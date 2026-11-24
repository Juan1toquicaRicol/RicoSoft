import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import type {
  EmailMessage,
  EmailProvider,
  ListNewMessagesResult,
} from "../../integrations/email/email-provider";
import {
  _establecerProviderParaTests,
  ejecutarCicloIngestaCorreos,
} from "./importaciones-bandeja-ingesta.job";
import { ejecutarCicloProcesamientoCorreos } from "./importaciones-bandeja-procesamiento.job";
import { anioActualImportaciones } from "./importaciones-consecutivo";
import { recuperarCorreosConOrdenAnulada } from "./importaciones-bandeja-vinculo";

/**
 * Inyección de fallo para la prueba de reversión: con `forzar` activo, el
 * vínculo real se ejecuta completo dentro de la transacción de la orden y
 * después falla. Registra lo que existía en ese momento dentro de la
 * transacción. Sin `forzar`, delega en la implementación real sin cambios.
 */
const itemSiesaPrueba = vi.hoisted(() => ({
  itemRowId: 1800123, descripcion: "Carbonato simulado", referencia: "HUNH1024",
  unidadMedida: "KG", esVendible: true, naturaleza: "producto",
  cantidadExistente: 3000, cantidadComprometida: 500, cantidadPendienteEntrar: 10000,
  valorTotal: 0, fechaUltimaVenta: null,
}));
vi.mock("../integraciones-siesa/siesa-inventario.service", async (original) => ({
  ...(await original<typeof import("../integraciones-siesa/siesa-inventario.service")>()),
  leerExistenciasSiesa: async () => [itemSiesaPrueba],
  listarItemsMaestroSiesa: async (cia: number, opciones: { itemRowIdsFiltro: { ids: number[] } }) => ({
    items: cia === 901 && opciones.itemRowIdsFiltro.ids.includes(itemSiesaPrueba.itemRowId)
      ? [itemSiesaPrueba] : [],
    total: 1,
  }),
}));
vi.mock("../integraciones-siesa/siesa-manufactura.service", async (original) => ({
  ...(await original<typeof import("../integraciones-siesa/siesa-manufactura.service")>()),
  leerListaMaterialesSiesa: async () => [],
}));

const falloVinculo = vi.hoisted(() => ({
  forzar: false,
  dentroDeLaTransaccion: null as null | {
    codigo: string | null;
    contadores: { anio: number; siguienteConsecutivo: number }[];
    auditoriasDelCorreo: number;
  },
}));
vi.mock("./importaciones-bandeja-vinculo", async (importOriginal) => {
  const real = await importOriginal<typeof import("./importaciones-bandeja-vinculo")>();
  return {
    ...real,
    vincularOrdenCorreo: async (...args: Parameters<typeof real.vincularOrdenCorreo>) => {
      await real.vincularOrdenCorreo(...args);
      if (!falloVinculo.forzar) return;
      const [tx, datos] = args;
      const orden = await tx.ordenCompraIntl.findUniqueOrThrow({
        where: { id: datos.ordenId },
        select: { codigo: true },
      });
      falloVinculo.dentroDeLaTransaccion = {
        codigo: orden.codigo,
        contadores: await tx.consecutivoImportacion.findMany({
          where: { tenantId: datos.tenantId },
          select: { anio: true, siguienteConsecutivo: true },
        }),
        auditoriasDelCorreo: await tx.auditoria.count({
          where: { tenantId: datos.tenantId, entidadId: datos.correoId },
        }),
      };
      // Se apaga después de las lecturas: si una de ellas provoca un
      // reintento de la transacción, el reintento también falla.
      falloVinculo.forzar = false;
      throw new real.ConflictoVinculoCorreo("Fallo forzado del vínculo en la prueba.");
    },
  };
});

/**
 * Bandeja Inteligente de Importaciones — pipeline end-to-end + seguridad.
 * NUNCA depende de Gmail real: EmailProvider se reemplaza por un fake en
 * memoria (ver _establecerProviderParaTests, exactamente para esto). Los
 * jobs se ejecutan directamente en el test (ejecutarCicloIngestaCorreos/
 * ejecutarCicloProcesamientoCorreos) en vez de esperar al cron — mismo
 * patrón que crosschex-sync.job.test.ts.
 *
 * Los adjuntos de prueba son texto plano (no PDF): RegexDocumentExtractionProvider
 * los procesa sin pasar por pdf-parse, evitando una incompatibilidad real y
 * ya confirmada entre el bundle de pdf.js de pdf-parse@1 y Vitest (falla con
 * "bad XRef entry" incluso ante un PDF válido — verificado que SÍ funciona
 * en Node puro fuera de Vitest). La lógica de extracción de PDF en sí ya
 * tiene su propia cobertura con pdf-text.ts mockeado, ver
 * regex-extraction-provider.test.ts.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

class EmailProviderFalso implements EmailProvider {
  mensajes: (EmailMessage & { adjuntosContenido: Record<string, Buffer> })[] = [];

  async listNewMessages(
    _cursor: string | null,
    maxResults: number,
  ): Promise<ListNewMessagesResult> {
    const mensajes = this.mensajes.slice(0, maxResults);
    return { messages: mensajes, nextCursor: null };
  }

  async getAttachmentContent(
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Buffer> {
    const mensaje = this.mensajes.find((m) => m.providerMessageId === providerMessageId);
    const contenido = mensaje?.adjuntosContenido[providerAttachmentId];
    if (!contenido) throw new Error("Adjunto no encontrado en el fake.");
    return contenido;
  }
}

function crearMensajeFalso(datos: {
  messageId: string;
  from: string;
  subject: string;
  bodyText?: string;
  adjuntoTexto?: { filename: string; contenido: string };
}): EmailMessage & { adjuntosContenido: Record<string, Buffer> } {
  const providerAttachmentId = randomUUID();
  return {
    messageId: datos.messageId,
    providerMessageId: randomUUID(),
    from: datos.from,
    to: ["importaciones@ricol.com.co"],
    subject: datos.subject,
    date: new Date(),
    bodyText: datos.bodyText ?? null,
    bodyHtml: null,
    attachments: datos.adjuntoTexto
      ? [
          {
            providerAttachmentId,
            filename: datos.adjuntoTexto.filename,
            mimeType: "text/plain",
            size: datos.adjuntoTexto.contenido.length,
          },
        ]
      : [],
    adjuntosContenido: datos.adjuntoTexto
      ? { [providerAttachmentId]: Buffer.from(datos.adjuntoTexto.contenido, "utf-8") }
      : {},
  };
}

describe.skipIf(!RUN)(
  "Bandeja Inteligente de Importaciones — pipeline + seguridad (BD real)",
  () => {
    const app = createApp();
    const sufijo = randomUUID().slice(0, 8);
    const PASSWORD = "TestPassword123";
    const fakeProvider = new EmailProviderFalso();

    let tenantAId: string;
    let tenantBId: string;
    let tokenA: string;
    let tokenASinPermiso: string;
    let tokenB: string;
    let tokenSuperadminA: string;
    let proveedorAId: string;

    const login = async (email: string) => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      return res.body.token as string;
    };

    beforeAll(async () => {
      _establecerProviderParaTests(fakeProvider);
      process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED = "true";
      process.env.IMPORTACIONES_PROCESSING_ENABLED = "true";

      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      const tenantA = await prisma.tenant.create({
        data: { nombre: `Bandeja A ${sufijo}`, subdomain: `test-bandeja-a-${sufijo}` },
      });
      tenantAId = tenantA.id;
      const tenantB = await prisma.tenant.create({
        data: { nombre: `Bandeja B ${sufijo}`, subdomain: `test-bandeja-b-${sufijo}` },
      });
      tenantBId = tenantB.id;

      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `bandeja-super-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Super A",
          isSuperadmin: true,
          activo: true,
        },
      });
      const rolConPermisos = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Correos A ${sufijo}`,
          permisos: JSON.stringify([
            "importaciones.correos_ver",
            "importaciones.correos_resolver",
            "importaciones.correos_procesar",
          ]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `bandeja-conpermiso-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Con Permiso A",
          rolId: rolConPermisos.id,
          isSuperadmin: false,
          activo: true,
        },
      });
      const rolSinPermisos = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: `Sin Permiso Bandeja ${sufijo}`,
          permisos: JSON.stringify([]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `bandeja-sinpermiso-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Sin Permiso A",
          rolId: rolSinPermisos.id,
          isSuperadmin: false,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `bandeja-super-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Super B",
          isSuperadmin: true,
          activo: true,
        },
      });

      proveedorAId = (
        await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nombre: `Example Supplier Ltd ${sufijo}`,
            nit: `900${sufijo}1`,
            email: `sales-${sufijo}@examplesupplier.com`,
          },
        })
      ).id;

      tokenA = await login(`bandeja-conpermiso-a-${sufijo}@test.ricosoft.local`);
      tokenASinPermiso = await login(`bandeja-sinpermiso-a-${sufijo}@test.ricosoft.local`);
      tokenB = await login(`bandeja-super-b-${sufijo}@test.ricosoft.local`);
      tokenSuperadminA = await login(`bandeja-super-a-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      delete process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED;
      delete process.env.IMPORTACIONES_PROCESSING_ENABLED;

      const tenantIds = [tenantAId, tenantBId];
      await prisma.importacionExtraccion.deleteMany({
        where: {
          adjunto: { correo: { OR: [{ tenantId: { in: tenantIds } }, { tenantId: null }] } },
        },
      });
      await prisma.importacionExcepcion.deleteMany({
        where: { OR: [{ tenantId: { in: tenantIds } }, { tenantId: null }] },
      });
      await prisma.importacionCorreoAdjunto.deleteMany({
        where: { correo: { OR: [{ tenantId: { in: tenantIds } }, { tenantId: null }] } },
      });
      await prisma.importacionCorreo.deleteMany({
        where: { OR: [{ tenantId: { in: tenantIds } }, { tenantId: null }] },
      });
      await prisma.itemOrdenCompraIntl.deleteMany({
        where: { ordenCompra: { tenantId: { in: tenantIds } } },
      });
      await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.inboxItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.requisitoProveedorImportacion.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      fakeProvider.mensajes = [];
      await prisma.importacionExtraccion.deleteMany({
        where: { adjunto: { correo: { OR: [{ tenantId: tenantAId }, { tenantId: null }] } } },
      });
      await prisma.importacionExcepcion.deleteMany({
        where: { OR: [{ tenantId: tenantAId }, { tenantId: null }] },
      });
      await prisma.importacionCorreoAdjunto.deleteMany({
        where: { correo: { OR: [{ tenantId: tenantAId }, { tenantId: null }] } },
      });
      await prisma.importacionCorreo.deleteMany({
        where: { OR: [{ tenantId: tenantAId }, { tenantId: null }] },
      });
      // Cada test crea sus propias órdenes para el proveedor A — se limpian
      // entre pruebas para que el matching de orden ("¿tiene exactamente UNA
      // orden abierta?") no se contamine entre tests.
      await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: tenantAId } });
    });

    it("1. pipeline completo: correo con PO/ETA/Incoterm/contenedor se identifica, matchea y resuelve automáticamente", async () => {
      const orden = await prisma.ordenCompraIntl.create({
        data: {
          tenantId: tenantAId,
          numeroOrden: `PO-4587-${sufijo}`,
          incoterm: "FOB",
          proveedorId: proveedorAId,
          proveedorExtranjero: "Example Supplier Ltd",
          paisOrigen: "China",
          moneda: "USD",
          trmPactada: 4000,
          valorEstimadoTotal: 1000,
          estado: "Confirmada",
        },
      });

      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: `<msg-1-${sufijo}@examplesupplier.com>`,
          from: `sales-${sufijo}@examplesupplier.com`,
          subject: `Shipment Confirmation PO-4587-${sufijo}`,
          adjuntoTexto: {
            filename: "Shipping_Confirmation.txt",
            contenido: `Supplier: Example Supplier Ltd. PO: ${sufijo} ETA: 18/10/2026 Incoterm: FOB Container: ABCD1234567`,
          },
        }),
      );

      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();

      const correo = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { messageId: `<msg-1-${sufijo}@examplesupplier.com>` },
        include: { adjuntos: { include: { extracciones: true } }, excepciones: true },
      });

      expect(correo.tenantId).toBe(tenantAId);
      expect(correo.proveedorId).toBe(proveedorAId);
      expect(correo.clasificacion).toBe("AVISO_DESPACHO");
      expect(
        correo.adjuntos[0].extracciones.some(
          (e) => e.campo === "eta" && e.valorExtraido === "18/10/2026",
        ),
      ).toBe(true);
      // Sin proveedor con requisitos obligatorios configurados -> sin
      // excepciones -> resuelto automáticamente (§12: acción operativa segura).
      expect(correo.excepciones).toHaveLength(0);
      expect(correo.estadoProcesamiento).toBe("RESUELTO");
    });

    it("2. idempotencia: ingerir el mismo messageId dos veces nunca duplica la fila", async () => {
      const messageId = `<msg-dup-${sufijo}@examplesupplier.com>`;
      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId,
          from: `sales-${sufijo}@examplesupplier.com`,
          subject: "Hello",
        }),
      );

      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloIngestaCorreos(); // mismo mensaje, el fake lo sigue devolviendo

      const filas = await prisma.importacionCorreo.findMany({ where: { messageId } });
      expect(filas).toHaveLength(1);
    });

    it("3. proveedor no identificado: crea excepción CON tenantId null y el triage cross-tenant está denegado", async () => {
      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: `<msg-desconocido-${sufijo}@nadie.com>`,
          from: `nadie-${sufijo}@dominio-inexistente-${sufijo}.com`,
          subject: "Hola",
        }),
      );

      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();

      const correo = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { messageId: `<msg-desconocido-${sufijo}@nadie.com>` },
      });
      expect(correo.tenantId).toBeNull();
      expect(correo.estadoProcesamiento).toBe("REQUIERE_REVISION");

      const excepcion = await prisma.importacionExcepcion.findFirstOrThrow({
        where: { correoId: correo.id },
      });
      expect(excepcion.tipo).toBe("PROVEEDOR_NO_IDENTIFICADO");
      expect(excepcion.tenantId).toBeNull();

      // Un usuario normal (incluso superadmin de OTRO tenant) no puede verlo
      // por las rutas normales — no tiene tenant, no hay ruta tenant-scoped
      // que lo exponga en absoluto.
      const comoUsuarioNormal = await request(app)
        .get(`/api/importaciones/bandeja/correos/${correo.id}`)
        .set("Authorization", `Bearer ${tokenA}`);
      expect(comoUsuarioNormal.status).toBe(404);

      // El triage cross-tenant está DENEGADO para todos: isSuperadmin es un
      // flag por tenant, no una identidad de plataforma. Ni un usuario normal
      // ni el superadmin de un tenant pueden listar ni asignar estos correos.
      for (const token of [tokenA, tokenSuperadminA]) {
        const triage = await request(app)
          .get("/api/importaciones/bandeja/sin-asignar")
          .set("Authorization", `Bearer ${token}`);
        expect(triage.status).toBe(403);
        expect(JSON.stringify(triage.body)).not.toContain(correo.id);

        const asignar = await request(app)
          .post(`/api/importaciones/bandeja/sin-asignar/${correo.id}/asignar-proveedor`)
          .set("Authorization", `Bearer ${token}`)
          .send({ proveedorId: proveedorAId });
        expect(asignar.status).toBe(403);
      }

      // El correo sigue sin tenant ni proveedor: nada se reasignó.
      const correoIntacto = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { id: correo.id },
      });
      expect(correoIntacto.tenantId).toBeNull();
      expect(correoIntacto.proveedorId).toBeNull();
      expect(correoIntacto.estadoProcesamiento).toBe("REQUIERE_REVISION");
    });

    it("4. requisito obligatorio faltante genera excepción + InboxItem, y desaparece al resolverla", async () => {
      const orden = await prisma.ordenCompraIntl.create({
        data: {
          tenantId: tenantAId,
          numeroOrden: `PO-REQ-${sufijo}`,
          incoterm: "FOB",
          proveedorId: proveedorAId,
          proveedorExtranjero: "Example Supplier Ltd",
          paisOrigen: "China",
          moneda: "USD",
          trmPactada: 4000,
          valorEstimadoTotal: 1000,
          estado: "Confirmada",
        },
      });
      const requisito = await prisma.requisitoProveedorImportacion.create({
        data: {
          tenantId: tenantAId,
          proveedorId: proveedorAId,
          tipo: "DOCUMENTO",
          nombre: "Certificado de origen",
          obligatorio: true,
          activo: true,
        },
      });

      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: `<msg-req-${sufijo}@examplesupplier.com>`,
          from: `sales-${sufijo}@examplesupplier.com`,
          subject: `Shipment Confirmation ${orden.numeroOrden}`,
          adjuntoTexto: {
            filename: "aviso.txt",
            contenido: `PO: ${orden.numeroOrden} ETA: 01/01/2027`,
          },
        }),
      );

      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();

      const correo = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { messageId: `<msg-req-${sufijo}@examplesupplier.com>` },
        include: { excepciones: true },
      });
      expect(correo.estadoProcesamiento).toBe("REQUIERE_REVISION");
      const excepcion = correo.excepciones.find(
        (e) => e.tipo === "REQUISITO_FALTANTE" && e.estado === "ABIERTA",
      );
      expect(excepcion).toBeDefined();

      const itemInbox = await prisma.inboxItem.findFirst({
        where: {
          tenantId: tenantAId,
          sourceModule: "importaciones-bandeja",
          sourceEntityId: correo.id,
        },
      });
      expect(itemInbox?.status).toBe("PENDIENTE");

      // Resolución humana: se descarta (ej. el requisito se cumplió por otro
      // medio, fuera de la Bandeja) — queda auditado y el InboxItem se resuelve.
      const resolver = await request(app)
        .post(
          `/api/importaciones/bandeja/correos/${correo.id}/excepciones/${excepcion!.id}/resolver`,
        )
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ accion: "DESCARTAR" });
      expect(resolver.status).toBe(204);

      const itemInboxDespues = await prisma.inboxItem.findFirst({
        where: {
          tenantId: tenantAId,
          sourceModule: "importaciones-bandeja",
          sourceEntityId: correo.id,
        },
      });
      expect(itemInboxDespues?.status).toBe("RESUELTO");

      const auditoria = await prisma.auditoria.findFirst({
        where: {
          tenantId: tenantAId,
          accion: "IMPORTACION_EXCEPCION_RESUELTA",
          entidadId: excepcion!.id,
        },
      });
      expect(auditoria).not.toBeNull();

      await prisma.requisitoProveedorImportacion.delete({ where: { id: requisito.id } });
    });

    it("5. multi-tenant: Tenant B jamás ve correos/excepciones de Tenant A (404 en detalle y lista vacía)", async () => {
      const orden = await prisma.ordenCompraIntl.create({
        data: {
          tenantId: tenantAId,
          numeroOrden: `PO-MT-${sufijo}`,
          incoterm: "FOB",
          proveedorId: proveedorAId,
          proveedorExtranjero: "Example Supplier Ltd",
          paisOrigen: "China",
          moneda: "USD",
          trmPactada: 4000,
          valorEstimadoTotal: 1000,
          estado: "Confirmada",
        },
      });
      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: `<msg-mt-${sufijo}@examplesupplier.com>`,
          from: `sales-${sufijo}@examplesupplier.com`,
          subject: `Order ${orden.numeroOrden}`,
        }),
      );
      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();

      const correo = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { messageId: `<msg-mt-${sufijo}@examplesupplier.com>` },
      });
      expect(correo.tenantId).toBe(tenantAId);

      const listaB = await request(app)
        .get("/api/importaciones/bandeja/correos")
        .set("Authorization", `Bearer ${tokenB}`);
      expect(listaB.status).toBe(200);
      expect(listaB.body.some((c: { id: string }) => c.id === correo.id)).toBe(false);

      const detalleB = await request(app)
        .get(`/api/importaciones/bandeja/correos/${correo.id}`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(detalleB.status).toBe(404);

      const adjuntoB = await request(app)
        .get(`/api/importaciones/bandeja/correos/${correo.id}/adjuntos/${randomUUID()}`)
        .set("Authorization", `Bearer ${tokenB}`);
      expect(adjuntoB.status).toBe(404);
    });

    it("6. permisos: un usuario sin importaciones.correos_ver recibe 403 al listar/ver/resolver", async () => {
      const listar = await request(app)
        .get("/api/importaciones/bandeja/correos")
        .set("Authorization", `Bearer ${tokenASinPermiso}`);
      expect(listar.status).toBe(403);

      const detalle = await request(app)
        .get(`/api/importaciones/bandeja/correos/${randomUUID()}`)
        .set("Authorization", `Bearer ${tokenASinPermiso}`);
      expect(detalle.status).toBe(403);

      const resolver = await request(app)
        .post(
          `/api/importaciones/bandeja/correos/${randomUUID()}/excepciones/${randomUUID()}/resolver`,
        )
        .set("Authorization", `Bearer ${tokenASinPermiso}`)
        .send({ accion: "DESCARTAR" });
      expect(resolver.status).toBe(403);
    });

    it("7. IDOR: no se puede resolver una excepción de OTRO tenant por id directo (404), sin cambios", async () => {
      const proveedorB = await prisma.proveedor.create({
        data: { tenantId: tenantBId, nombre: `Prov B ${sufijo}`, nit: `900${sufijo}9` },
      });
      const correoB = await prisma.importacionCorreo.create({
        data: {
          tenantId: tenantBId,
          proveedorId: proveedorB.id,
          messageId: `<msg-b-${sufijo}@provb.com>`,
          remitente: "x@provb.com",
          destinatarios: "importaciones@ricol.com.co",
          asunto: "Correo de B",
          fechaRecibido: new Date(),
          estadoProcesamiento: "REQUIERE_REVISION",
        },
      });
      const excepcionB = await prisma.importacionExcepcion.create({
        data: {
          tenantId: tenantBId,
          correoId: correoB.id,
          tipo: "OTRO",
          descripcion: "Excepción de B",
        },
      });

      const intento = await request(app)
        .post(
          `/api/importaciones/bandeja/correos/${correoB.id}/excepciones/${excepcionB.id}/resolver`,
        )
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ accion: "DESCARTAR" });
      expect(intento.status).toBe(404);

      const sinTocar = await prisma.importacionExcepcion.findUnique({
        where: { id: excepcionB.id },
      });
      expect(sinTocar?.estado).toBe("ABIERTA");

      await prisma.importacionExcepcion.delete({ where: { id: excepcionB.id } });
      await prisma.importacionCorreo.delete({ where: { id: correoB.id } });
      await prisma.proveedor.delete({ where: { id: proveedorB.id } });
    });

    it("8. configuración de la Bandeja nunca expone el JSON de la cuenta de servicio, solo estado", async () => {
      const res = await request(app)
        .get("/api/importaciones/bandeja/configuracion")
        .set("Authorization", `Bearer ${tokenSuperadminA}`);
      // requiere importaciones.correos_configurar — superadmin lo tiene por
      // isSuperadmin, no por el permiso puntual.
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("serviceAccountJson");
      expect(JSON.stringify(res.body)).not.toContain("private_key");
    });

    it("9. correo con múltiples órdenes abiertas del proveedor sin PO identificable -> excepción ORDEN_NO_IDENTIFICADA", async () => {
      await prisma.ordenCompraIntl.createMany({
        data: [
          {
            tenantId: tenantAId,
            numeroOrden: `PO-AMB-1-${sufijo}`,
            incoterm: "FOB",
            proveedorId: proveedorAId,
            proveedorExtranjero: "Example Supplier Ltd",
            paisOrigen: "China",
            moneda: "USD",
            trmPactada: 4000,
            valorEstimadoTotal: 1000,
            estado: "Confirmada",
          },
          {
            tenantId: tenantAId,
            numeroOrden: `PO-AMB-2-${sufijo}`,
            incoterm: "FOB",
            proveedorId: proveedorAId,
            proveedorExtranjero: "Example Supplier Ltd",
            paisOrigen: "China",
            moneda: "USD",
            trmPactada: 4000,
            valorEstimadoTotal: 1000,
            estado: "Borrador",
          },
        ],
      });

      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: `<msg-ambiguo-${sufijo}@examplesupplier.com>`,
          from: `sales-${sufijo}@examplesupplier.com`,
          subject: "General update",
        }),
      );
      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();

      const correo = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { messageId: `<msg-ambiguo-${sufijo}@examplesupplier.com>` },
        include: { excepciones: true },
      });
      expect(correo.proveedorId).toBe(proveedorAId);
      expect(correo.ordenCompraId).toBeNull();
      expect(correo.excepciones.some((e) => e.tipo === "ORDEN_NO_IDENTIFICADA")).toBe(true);

      await prisma.ordenCompraIntl.deleteMany({
        where: {
          tenantId: tenantAId,
          numeroOrden: { in: [`PO-AMB-1-${sufijo}`, `PO-AMB-2-${sufijo}`] },
        },
      });
    });

    async function correoEnRevision() {
      return prisma.importacionCorreo.create({
        data: {
          tenantId: tenantAId,
          proveedorId: proveedorAId,
          messageId: randomUUID(),
          remitente: "pilot@example.test",
          destinatarios: "pilot@example.test",
          asunto: "Caso controlado de importación",
          fechaRecibido: new Date(),
          estadoProcesamiento: "REQUIERE_REVISION",
          excepciones: {
            create: {
              tipo: "ORDEN_NO_IDENTIFICADA",
              descripcion: "Revisar orden",
              tenantId: tenantAId,
            },
          },
        },
        include: { excepciones: true },
      });
    }

    const ordenNueva = () => ({
      proveedorId: proveedorAId,
      incoterm: "FOB",
      paisOrigen: "China",
      moneda: "USD",
      trmPactada: 4000,
      items: [
        {
          descripcion: "Carbonato simulado",
          referencia: "HUNH1024",
          unidadMedida: "KG",
          cantidad: 100,
          valorUnitarioFob: 2,
        },
      ],
    });

    it("vincula una orden por IMP, aísla el listado y rechaza un vínculo concurrente", async () => {
      const correo = await correoEnRevision();
      const crear = () =>
        request(app)
          .post("/api/importaciones")
          .set("Authorization", "Bearer " + tokenSuperadminA)
          .send(ordenNueva());
      const primera = await crear();
      const segunda = await crear();
      expect([primera.status, segunda.status]).toEqual([201, 201]);

      const endpoint = "/api/importaciones/bandeja/correos/" + correo.id;
      const buscar = (token: string) =>
        request(app)
          .get(endpoint + "/ordenes")
          .set("Authorization", "Bearer " + token)
          .query({ q: primera.body.numeroOrden });
      expect((await buscar(tokenB)).status).toBe(404);
      const resultados = await buscar(tokenA);
      expect(resultados.status).toBe(200);
      expect(resultados.body.map((x: { id: string }) => x.id)).toEqual([primera.body.id]);

      const vincular = (ordenCompraId: string) =>
        request(app)
          .post(endpoint + "/excepciones/" + correo.excepciones[0].id + "/resolver")
          .set("Authorization", "Bearer " + tokenA)
          .send({ accion: "SELECCIONAR_ORDEN", ordenCompraId });
      const respuestas = await Promise.all([vincular(primera.body.id), vincular(segunda.body.id)]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([204, 409]);
      const correoVinculado = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { id: correo.id },
      });
      expect([primera.body.id, segunda.body.id]).toContain(correoVinculado.ordenCompraId);
      expect(correoVinculado.estadoProcesamiento).toBe("PENDIENTE");
      expect(
        await prisma.auditoria.count({
          where: { entidadId: correo.id, accion: "IMPORTACION_CORREO_ORDEN_VINCULADA" },
        }),
      ).toBe(1);
      // La resolución conserva su evento para los reportes existentes; la
      // solicitud que perdió la carrera no deja ninguno de los dos.
      expect(
        await prisma.auditoria.count({
          where: {
            tenantId: tenantAId,
            entidadTipo: "ImportacionExcepcion",
            entidadId: correo.excepciones[0].id,
            accion: "IMPORTACION_EXCEPCION_RESUELTA",
          },
        }),
      ).toBe(1);
      await ejecutarCicloProcesamientoCorreos();
      const reprocesado = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { id: correo.id },
      });
      expect(reprocesado.ordenCompraId).toBe(correoVinculado.ordenCompraId);
    });

    it("crea y vincula en una transacción, sin duplicados ni consumo de IMP en el reintento", async () => {
      const correo = await correoEnRevision();
      const payload = { ...ordenNueva(), correoOrigenId: correo.id };
      const crear = (token: string, body = payload) =>
        request(app)
          .post("/api/importaciones")
          .set("Authorization", "Bearer " + token)
          .send(body);
      expect((await crear(tokenA)).status).toBe(403);
      const rolCreador = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: "Creador sin Bandeja",
          permisos: JSON.stringify(["importaciones.ver", "importaciones.crear"]),
        },
      });
      const emailCreador = "bandeja-creador-" + sufijo + "@test.ricosoft.local";
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          rolId: rolCreador.id,
          email: emailCreador,
          passwordHash: await bcrypt.hash(PASSWORD, 10),
          nombre: "Creador sin Bandeja",
          activo: true,
        },
      });
      const tokenCreador = await login(emailCreador);
      expect(tokenCreador).toBeTruthy();
      expect((await crear(tokenCreador)).status).toBe(403);

      const otroProveedor = await prisma.proveedor.create({
        data: { tenantId: tenantAId, nombre: "Proveedor distinto", nit: randomUUID() },
      });
      expect(
        (await crear(tokenSuperadminA, { ...payload, proveedorId: otroProveedor.id })).status,
      ).toBe(409);
      const respuestas = await Promise.all([crear(tokenSuperadminA), crear(tokenSuperadminA)]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
      const nueva = respuestas.find((r) => r.status === 201)!;
      expect(nueva.body.numeroOrden).toMatch(/^IMP-\d{4}-\d+$/);
      expect(await prisma.ordenCompraIntl.count({ where: { tenantId: tenantAId } })).toBe(1);
      const guardado = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { id: correo.id },
        include: { excepciones: true },
      });
      expect(guardado.ordenCompraId).toBe(nueva.body.id);
      expect(guardado.excepciones[0].estado).toBe("RESUELTA");
      expect(
        await prisma.auditoria.count({
          where: { entidadId: correo.id, accion: "IMPORTACION_CORREO_ORDEN_VINCULADA" },
        }),
      ).toBe(1);
      const valor = Number(nueva.body.numeroOrden.split("-").at(-1));
      const serie = await prisma.consecutivoImportacion.findFirstOrThrow({
        where: { tenantId: tenantAId },
      });
      expect(serie.siguienteConsecutivo).toBe(valor + 1);
    });

    async function correoResueltoConOrden(tenantId: string, ordenCompraId: string) {
      return prisma.importacionCorreo.create({
        data: {
          tenantId,
          proveedorId: tenantId === tenantAId ? proveedorAId : null,
          ordenCompraId,
          messageId: randomUUID(),
          remitente: "pilot@example.test",
          destinatarios: "pilot@example.test",
          asunto: "Correo resuelto " + randomUUID().slice(0, 8),
          fechaRecibido: new Date(),
          estadoProcesamiento: "RESUELTO",
        },
      });
    }
    const crearOrdenA = async () => {
      const res = await request(app)
        .post("/api/importaciones")
        .set("Authorization", "Bearer " + tokenSuperadminA)
        .send(ordenNueva());
      expect(res.status).toBe(201);
      return res.body as { id: string; numeroOrden: string };
    };
    const vincularOrden = async (correoId: string, ordenCompraId: string) => {
      const excepcion = await prisma.importacionExcepcion.findFirstOrThrow({
        where: { correoId, tipo: "ORDEN_NO_IDENTIFICADA", estado: "ABIERTA" },
      });
      return request(app)
        .post(`/api/importaciones/bandeja/correos/${correoId}/excepciones/${excepcion.id}/resolver`)
        .set("Authorization", "Bearer " + tokenA)
        .send({ accion: "SELECCIONAR_ORDEN", ordenCompraId });
    };

    it("al anular una orden desvincula solo los correos de esa empresa y permite elegir otra", async () => {
      const anulada = await crearOrdenA();
      const otra = await crearOrdenA();
      const correo = await correoResueltoConOrden(tenantAId, anulada.id);
      // Fila inconsistente de otra empresa que apunta a la misma orden: no se toca.
      const correoOtraEmpresa = await correoResueltoConOrden(tenantBId, anulada.id);
      try {
        const anular = await request(app)
          .delete("/api/importaciones/" + anulada.id)
          .set("Authorization", "Bearer " + tokenSuperadminA)
          .send({ motivo: "Prueba de desvinculación" });
        expect(anular.status).toBe(204);

        const desvinculado = await prisma.importacionCorreo.findUniqueOrThrow({
          where: { id: correo.id },
          include: { excepciones: true },
        });
        expect(desvinculado.ordenCompraId).toBeNull();
        expect(desvinculado.estadoProcesamiento).toBe("REQUIERE_REVISION");
        expect(desvinculado.proveedorId).toBe(proveedorAId);
        const excepcion = desvinculado.excepciones.find((e) => e.estado === "ABIERTA");
        expect(excepcion?.tipo).toBe("ORDEN_NO_IDENTIFICADA");
        expect(excepcion?.tenantId).toBe(tenantAId);
        expect(excepcion?.descripcion).toContain(anulada.numeroOrden);
        const traza = await prisma.auditoria.findFirstOrThrow({
          where: {
            tenantId: tenantAId,
            entidadId: correo.id,
            accion: "IMPORTACION_CORREO_ORDEN_DESVINCULADA",
          },
        });
        expect(JSON.parse(traza.datosAnteriores ?? "{}")).toMatchObject({
          ordenCompraId: anulada.id,
          numeroOrden: anulada.numeroOrden,
          estadoProcesamiento: "RESUELTO",
        });
        const inbox = await prisma.inboxItem.findFirst({
          where: { tenantId: tenantAId, sourceEntityId: correo.id },
        });
        expect(inbox?.status).toBe("PENDIENTE");
        const historial = await prisma.importacionHistorial.findFirstOrThrow({
          where: { ordenCompraId: anulada.id, accion: "Orden anulada" },
        });
        expect(historial.detalle).toContain("1 correo(s)");

        const intacto = await prisma.importacionCorreo.findUniqueOrThrow({
          where: { id: correoOtraEmpresa.id },
        });
        expect(intacto.ordenCompraId).toBe(anulada.id);
        expect(intacto.estadoProcesamiento).toBe("RESUELTO");
        expect(
          await prisma.auditoria.count({ where: { entidadId: correoOtraEmpresa.id } }),
        ).toBe(0);

        // La orden anulada ya no se ofrece ni se acepta; otra vigente sí.
        const opciones = await request(app)
          .get(`/api/importaciones/bandeja/correos/${correo.id}/ordenes`)
          .set("Authorization", "Bearer " + tokenA);
        const ids = (opciones.body as { id: string }[]).map((o) => o.id);
        expect(ids).toContain(otra.id);
        expect(ids).not.toContain(anulada.id);
        expect((await vincularOrden(correo.id, anulada.id)).status).toBe(404);
        expect((await vincularOrden(correo.id, otra.id)).status).toBe(204);
        const revinculado = await prisma.importacionCorreo.findUniqueOrThrow({
          where: { id: correo.id },
        });
        expect(revinculado.ordenCompraId).toBe(otra.id);

        const detalleB = await request(app)
          .get("/api/importaciones/bandeja/correos/" + correo.id)
          .set("Authorization", "Bearer " + tokenB);
        expect(detalleB.status).toBe(404);
      } finally {
        await prisma.importacionCorreo.delete({ where: { id: correoOtraEmpresa.id } });
      }
    });

    it("una vinculación concurrente con la anulación no deja un vínculo a la orden anulada", async () => {
      const orden = await crearOrdenA();
      const correo = await correoEnRevision();
      const [vinculo, anulacion] = await Promise.all([
        vincularOrden(correo.id, orden.id),
        request(app).delete("/api/importaciones/" + orden.id)
          .set("Authorization", "Bearer " + tokenSuperadminA)
          .send({ motivo: "Prueba de concurrencia" }),
      ]);
      expect([204, 404, 409]).toContain(vinculo.status);
      expect(anulacion.status).toBe(204);
      const fila = await prisma.importacionCorreo.findUniqueOrThrow({ where: { id: correo.id } });
      expect(fila.ordenCompraId).toBeNull();
      expect(fila.estadoProcesamiento).toBe("REQUIERE_REVISION");
    });

    it("vincula un ítem histórico con Siesa y conserva la referencia de la orden", async () => {
      const orden = await crearOrdenA();
      const item = await prisma.itemOrdenCompraIntl.findFirstOrThrow({ where: { ordenCompraId: orden.id } });
      const vincular = (token: string, itemRowId: number) =>
        request(app).put("/api/importaciones/items/" + item.id + "/vinculo-siesa")
          .set("Authorization", "Bearer " + token).send({ itemRowId });
      await prisma.tenant.update({ where: { id: tenantAId }, data: { siesaCiaId: 901 } });
      try {
        expect((await vincular(tokenB, itemSiesaPrueba.itemRowId)).status).toBe(404);
        expect((await vincular(tokenSuperadminA, itemSiesaPrueba.itemRowId + 1)).status).toBe(400);
        expect((await vincular(tokenSuperadminA, itemSiesaPrueba.itemRowId)).status).toBe(204);
        const fila = await prisma.itemOrdenCompraIntl.findUniqueOrThrow({ where: { id: item.id } });
        expect(fila).toMatchObject({
          itemRowId: itemSiesaPrueba.itemRowId, siesaCiaId: 901, referencia: item.referencia,
        });
      } finally {
        await prisma.tenant.update({ where: { id: tenantAId }, data: { siesaCiaId: null } });
      }
    });

    it("Ventas separa stock Siesa, dos embarques y una recepción parcial conciliada", async () => {
      const headersA = "Bearer " + tokenSuperadminA;
      const headersB = "Bearer " + tokenB;
      await prisma.tenant.update({ where: { id: tenantAId }, data: { siesaCiaId: 901 } });
      await prisma.tenant.update({ where: { id: tenantBId }, data: { siesaCiaId: 902 } });
      const payload = ordenNueva();
      const itemRowId = itemSiesaPrueba.itemRowId;
      const orden = await request(app).post("/api/importaciones").set("Authorization", headersA)
        .send({ ...payload, items: [{ ...payload.items[0], itemRowId, cantidad: 10000 }] });
      expect(orden.status).toBe(201);
      const ordenId: string = orden.body.id;
      const itemId: string = orden.body.items[0].id;
      expect(orden.body.items[0].itemRowId).toBe(itemRowId);
      const cruzada = await request(app).post("/api/importaciones").set("Authorization", headersB)
        .send({ ...payload, proveedorId: undefined, proveedorExtranjero: "Prueba",
          items: [{ ...payload.items[0], itemRowId, cantidad: 10000 }] });
      expect(cruzada.status).toBe(400);
      await prisma.ordenCompraIntl.update({ where: { id: ordenId }, data: { estado: "Confirmada" } });
      const crearLote = (blAwb: string, eta: string) => prisma.loteImportacion.create({ data: {
        tenantId: tenantAId, ordenCompraId: ordenId, blAwb,
        puertoOrigen: "Origen", puertoDestino: "Destino", fechaLlegadaEstimada: new Date(eta),
      } });
      const primero = await crearLote("SIM-1", "2099-04-01");
      const segundo = await crearLote("SIM-2", "2099-05-01");
      await prisma.loteImportacion.update({
        where: { id: segundo.id },
        data: { proveedorTracking: "mock", etaTrackingActual: new Date("2099-05-10") },
      });
      const asignar = (lote: string, cambios: object, auth = headersA) =>
        request(app).put(`/api/importaciones/lotes/${lote}/asignaciones/${itemId}`)
          .set("Authorization", auth)
          .send({ cantidad: 0, recibida: 0, conciliada: 0, fechaDisponibilidad: null,
            evidenciaFecha: null, documentoSiesa: null, actualizadoEn: null, ...cambios });
      const consultar = (auth = headersA) =>
        request(app).get("/api/ventas/disponibilidad").set("Authorization", auth)
          .query({ itemRowId, cantidad: 5000 });
      try {
        expect((await asignar(primero.id, { cantidad: 6000 }, headersB)).status).toBe(404);
        expect((await asignar(primero.id, { cantidad: 6000 }, "Bearer " + tokenASinPermiso)).status).toBe(403);
        expect((await asignar(primero.id, { cantidad: 6000, conciliada: 5 })).status).toBe(400);
        const [a, b] = await Promise.all([
          asignar(primero.id, { cantidad: 6000, fechaDisponibilidad: "2099-04-20", evidenciaFecha: "Plan de recepción confirmado" }),
          asignar(segundo.id, { cantidad: 5000 }),
        ]);
        expect([a.status, b.status].sort()).toEqual([204, 409]);
        if (b.status === 204) {
          const version = await prisma.importacionAsignacionEmbarque.findUniqueOrThrow({
            where: { loteId_itemId: { loteId: segundo.id, itemId } },
          });
          expect((await asignar(segundo.id, {
            cantidad: 4000, actualizadoEn: version.actualizadoEn.toISOString(),
          })).status).toBe(204);
          expect((await asignar(primero.id, {
            cantidad: 6000, fechaDisponibilidad: "2099-04-20", evidenciaFecha: "Plan de recepción confirmado",
          })).status).toBe(204);
        } else {
          expect((await asignar(segundo.id, { cantidad: 4000 })).status).toBe(204);
        }
        const antes = await consultar();
        expect(antes.status).toBe(200);
        expect(antes.body.resultado.disponibleLibre).toBe(2500);
        expect(antes.body.resultado.ingresosImportacion).toEqual(expect.arrayContaining([
          expect.objectContaining({ loteId: primero.id, cantidadPendiente: 6000, fechaDisponibilidad: "2099-04-20" }),
          expect.objectContaining({ loteId: segundo.id, cantidadPendiente: 4000, fechaDisponibilidad: null, fuenteEta: "Proveedor" }),
        ]));
        const version = await prisma.importacionAsignacionEmbarque.findUniqueOrThrow({
          where: { loteId_itemId: { loteId: primero.id, itemId } },
        });
        const versionSegundo = await prisma.importacionAsignacionEmbarque.findUniqueOrThrow({
          where: { loteId_itemId: { loteId: segundo.id, itemId } },
        });
        expect((await asignar(segundo.id, {
          cantidad: 4000, fechaDisponibilidad: "2099-05-20", evidenciaFecha: "Fecha validada por Comercio Exterior",
          actualizadoEn: versionSegundo.actualizadoEn.toISOString(),
        })).status).toBe(204);
        const parcial = { cantidad: 6000, recibida: 3000, conciliada: 2000, documentoSiesa: "SIM-ING-001",
          fechaDisponibilidad: "2099-04-20", evidenciaFecha: "Plan de recepción confirmado",
          actualizadoEn: version.actualizadoEn.toISOString() };
        expect((await asignar(primero.id, parcial)).status).toBe(204);
        expect((await asignar(primero.id, parcial)).status).toBe(409);
        const despues = await consultar();
        expect(despues.body.resultado.disponibleLibre).toBe(2500);
        expect(despues.body.resultado.ingresosImportacion).toEqual(expect.arrayContaining([
          expect.objectContaining({ loteId: primero.id, porRecibir: 3000, recibidaSinConciliar: 1000, cantidadPendiente: 4000 }),
          expect.objectContaining({ loteId: segundo.id, cantidadPendiente: 4000, fechaDisponibilidad: "2099-05-20" }),
        ]));
        expect((await consultar(headersB)).body.resultado.ingresosImportacion).toEqual([]);
      } finally {
        await prisma.importacionAsignacionEmbarque.deleteMany({ where: { itemId } });
        await prisma.loteImportacion.deleteMany({ where: { id: { in: [primero.id, segundo.id] }, tenantId: tenantAId } });
        await prisma.tenant.updateMany({
          where: { id: { in: [tenantAId, tenantBId] } }, data: { siesaCiaId: null },
        });
      }
    });

    it("recupera un correo histórico RESUELTO que ya apuntaba a una orden anulada", async () => {
      const orden = await crearOrdenA();
      const nueva = await crearOrdenA();
      // Anulada antes de existir la desvinculación: el correo quedó apuntándole.
      await prisma.ordenCompraIntl.update({
        where: { id: orden.id },
        data: { estado: "Anulada", eliminado: true },
      });
      const correo = await correoResueltoConOrden(tenantAId, orden.id);
      const correoOtraEmpresa = await correoResueltoConOrden(tenantBId, orden.id);
      try {
        const reporte = await recuperarCorreosConOrdenAnulada(prisma, tenantAId, {
          aplicar: false,
        });
        expect(reporte).toEqual([
          { ordenId: orden.id, numeroOrden: orden.numeroOrden, correoIds: [correo.id] },
        ]);
        expect(
          (await prisma.importacionCorreo.findUniqueOrThrow({ where: { id: correo.id } }))
            .ordenCompraId,
        ).toBe(orden.id);

        await recuperarCorreosConOrdenAnulada(prisma, tenantAId, { aplicar: true });
        const recuperado = await prisma.importacionCorreo.findUniqueOrThrow({
          where: { id: correo.id },
        });
        expect(recuperado.ordenCompraId).toBeNull();
        expect(recuperado.estadoProcesamiento).toBe("REQUIERE_REVISION");
        expect(
          await prisma.auditoria.count({
            where: { entidadId: correo.id, accion: "IMPORTACION_CORREO_ORDEN_DESVINCULADA" },
          }),
        ).toBe(1);
        // Repetir no duplica nada.
        expect(await recuperarCorreosConOrdenAnulada(prisma, tenantAId, { aplicar: true })).toEqual(
          [],
        );
        expect(
          (await prisma.importacionCorreo.findUniqueOrThrow({ where: { id: correoOtraEmpresa.id } }))
            .ordenCompraId,
        ).toBe(orden.id);
        expect((await vincularOrden(correo.id, nueva.id)).status).toBe(204);
      } finally {
        await prisma.importacionCorreo.delete({ where: { id: correoOtraEmpresa.id } });
      }
    });

    it("revierte la orden, el IMP y la auditoría si el vínculo falla dentro de la transacción", async () => {
      const correo = await correoEnRevision();
      const anio = anioActualImportaciones();
      const contador = async () =>
        (
          await prisma.consecutivoImportacion.findUnique({
            where: { tenantId_anio: { tenantId: tenantAId, anio } },
          })
        )?.siguienteConsecutivo ?? null;
      const antes = {
        contador: await contador(),
        ordenes: await prisma.ordenCompraIntl.count({ where: { tenantId: tenantAId } }),
        actividades: await prisma.importacionActividad.count({ where: { tenantId: tenantAId } }),
      };
      const crear = () =>
        request(app)
          .post("/api/importaciones")
          .set("Authorization", "Bearer " + tokenSuperadminA)
          .send({ ...ordenNueva(), correoOrigenId: correo.id });

      falloVinculo.dentroDeLaTransaccion = null;
      falloVinculo.forzar = true;
      const fallida = await crear();
      falloVinculo.forzar = false;
      expect(fallida.status).toBe(409);
      // El fallo ocurrió con la orden creada, el IMP reservado en el contador
      // y la auditoría del vínculo ya escrita, todo dentro de la transacción.
      const dentro = falloVinculo.dentroDeLaTransaccion;
      expect(dentro).not.toBeNull();
      expect(dentro!.codigo).toMatch(/^IMP-\d{4}-\d{3,}$/);
      const reservado = Number(dentro!.codigo!.split("-").at(-1));
      const contadorDentro = dentro!.contadores.find((c) => c.anio === anio);
      expect(contadorDentro?.siguienteConsecutivo).toBe(reservado + 1);
      expect(contadorDentro?.siguienteConsecutivo).not.toBe(antes.contador);
      expect(dentro!.auditoriasDelCorreo).toBe(1);

      // Nada de eso sobrevive.
      expect(await prisma.ordenCompraIntl.count({ where: { tenantId: tenantAId } })).toBe(
        antes.ordenes,
      );
      expect(
        await prisma.ordenCompraIntl.count({
          where: { tenantId: tenantAId, codigo: dentro!.codigo },
        }),
      ).toBe(0);
      expect(await prisma.importacionActividad.count({ where: { tenantId: tenantAId } })).toBe(
        antes.actividades,
      );
      expect(await contador()).toBe(antes.contador);
      expect(
        await prisma.auditoria.count({ where: { tenantId: tenantAId, entidadId: correo.id } }),
      ).toBe(0);
      const intacto = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { id: correo.id },
        include: { excepciones: true },
      });
      expect(intacto.ordenCompraId).toBeNull();
      expect(intacto.estadoProcesamiento).toBe("REQUIERE_REVISION");
      expect(intacto.excepciones.map((e) => e.estado)).toEqual(["ABIERTA"]);

      // Sin el fallo, el reintento recibe el mismo IMP: el número no se consumió.
      const reintento = await crear();
      expect(reintento.status).toBe(201);
      expect(reintento.body.numeroOrden).toBe(dentro!.codigo);
    });

    it("sugiere un proveedor por el adjunto sin asignarlo y protege el correo sin empresa", async () => {
      const nombre = "VIET NAM HANOTECH JOINT STOCK COMPANY";
      const candidato = await prisma.proveedor.create({
        data: { tenantId: tenantAId, nombre, nit: randomUUID() },
      });
      const remitente = "sistemas@ejemplo.test";
      const adjuntoTexto = {
        filename: "simulacion.txt",
        contenido: "Proveedor de referencia\n" + nombre + "\nPO-26112401",
      };
      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: randomUUID(),
          from: remitente,
          subject: "Simulación PO-26112401",
          adjuntoTexto,
        }),
      );
      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();
      const correo = await prisma.importacionCorreo.findFirstOrThrow({
        where: { asunto: "Simulación PO-26112401", remitente },
        include: { excepciones: true },
      });
      expect(correo.estadoProcesamiento).toBe("REQUIERE_REVISION");
      expect(correo.tenantId).toBeNull();
      expect(correo.proveedorId).toBeNull();
      expect(JSON.parse(correo.excepciones[0].candidatos ?? "[]")).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: candidato.id, nombre })]),
      );
      const endpoint = "/api/importaciones/bandeja/correos/" + correo.id;
      expect(
        (
          await request(app)
            .get(endpoint)
            .set("Authorization", "Bearer " + tokenSuperadminA)
        ).status,
      ).toBe(404);
      await prisma.importacionCorreo.update({
        where: { id: correo.id },
        data: { tenantId: tenantAId },
      });
      const detalle = await request(app)
        .get(endpoint)
        .set("Authorization", "Bearer " + tokenA);
      expect(detalle.status).toBe(200);
      expect(detalle.body.sugerenciasProveedor).toEqual([
        expect.objectContaining({
          id: candidato.id,
          nombre,
          señales: [expect.objectContaining({ campo: "Razón social" })],
        }),
      ]);
      expect(
        (
          await request(app)
            .get(endpoint)
            .set("Authorization", "Bearer " + tokenB)
        ).status,
      ).toBe(404);
    });

    it("deja en revisión un remitente registrado cuando el documento contradice su identidad", async () => {
      const proveedorDocumento = await prisma.proveedor.create({
        data: { tenantId: tenantAId, nombre: "Proveedor Documento Simulado", nit: "123456789" },
      });
      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: randomUUID(),
          from: "sales-" + sufijo + "@examplesupplier.com",
          subject: "Identidades contradictorias",
          adjuntoTexto: {
            filename: "identidad.txt",
            contenido:
              "Proveedor: " +
              proveedorDocumento.nombre +
              "\nNIT proveedor: " +
              proveedorDocumento.nit,
          },
        }),
      );
      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();
      const correo = await prisma.importacionCorreo.findFirstOrThrow({
        where: { asunto: "Identidades contradictorias" },
        include: { excepciones: true },
      });
      expect(correo.estadoProcesamiento).toBe("REQUIERE_REVISION");
      expect(correo.tenantId).toBeNull();
      expect(correo.proveedorId).toBeNull();
      expect(
        JSON.parse(correo.excepciones[0].candidatos ?? "[]").map((p: { id: string }) => p.id),
      ).toContain(proveedorDocumento.id);
    });

    it("con remitente exacto, el mismo proveedor registrado en otra empresa no bloquea el correo", async () => {
      // Mismo proveedor en dos empresas: en A con un nombre abreviado y el
      // correo del remitente; en B con la razón social completa del documento.
      const razonSocial = `Razon Social Completa Homonima ${sufijo}`;
      const remitente = `ventas-homonimo-${sufijo}@proveedor-homonimo.example`;
      const proveedorEnA = await prisma.proveedor.create({
        data: {
          tenantId: tenantAId,
          nombre: `Proveedor Abreviado ${sufijo}`,
          nit: `HOM${sufijo}`,
          email: remitente,
        },
      });
      const mismoProveedorEnB = await prisma.proveedor.create({
        data: { tenantId: tenantBId, nombre: razonSocial, nit: `HOM${sufijo}` },
      });
      const asunto = `Proforma homónimo ${sufijo}`;
      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: randomUUID(),
          from: remitente,
          subject: asunto,
          adjuntoTexto: { filename: "proforma.txt", contenido: "Proveedor: " + razonSocial },
        }),
      );
      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();

      const correo = await prisma.importacionCorreo.findFirstOrThrow({
        where: { asunto },
        include: { excepciones: true },
      });
      expect(correo.tenantId).toBe(tenantAId);
      expect(correo.proveedorId).toBe(proveedorEnA.id);
      expect(correo.excepciones.map((e) => e.tipo)).not.toContain("PROVEEDOR_NO_IDENTIFICADO");
      expect(mismoProveedorEnB.tenantId).toBe(tenantBId);
      const detalleB = await request(app)
        .get("/api/importaciones/bandeja/correos/" + correo.id)
        .set("Authorization", "Bearer " + tokenB);
      expect(detalleB.status).toBe(404);
    });

    it("con remitente exacto y conflicto, solo guarda candidatos de la empresa del remitente", async () => {
      // El documento nombra a otro proveedor de A (conflicto) y esa misma
      // razón social existe también en B, que no debe quedar como candidato.
      const razonSocial = `Proveedor Nombrado En Documento ${sufijo}`;
      const remitente = `ventas-conflicto-${sufijo}@remitente-conflicto.example`;
      await prisma.proveedor.create({
        data: {
          tenantId: tenantAId,
          nombre: `Remitente Registrado ${sufijo}`,
          nit: `REM${sufijo}`,
          email: remitente,
        },
      });
      const nombradoEnA = await prisma.proveedor.create({
        data: { tenantId: tenantAId, nombre: razonSocial, nit: `NOMA${sufijo}` },
      });
      const homonimoEnB = await prisma.proveedor.create({
        data: { tenantId: tenantBId, nombre: razonSocial, nit: `NOMB${sufijo}` },
      });
      const asunto = `Conflicto de identidad ${sufijo}`;
      fakeProvider.mensajes.push(
        crearMensajeFalso({
          messageId: randomUUID(),
          from: remitente,
          subject: asunto,
          adjuntoTexto: { filename: "proforma.txt", contenido: "Proveedor: " + razonSocial },
        }),
      );
      await ejecutarCicloIngestaCorreos();
      await ejecutarCicloProcesamientoCorreos();

      const correo = await prisma.importacionCorreo.findFirstOrThrow({
        where: { asunto },
        include: { excepciones: true },
      });
      expect(correo.estadoProcesamiento).toBe("REQUIERE_REVISION");
      expect(correo.tenantId).toBeNull();
      expect(correo.proveedorId).toBeNull();
      const excepcion = correo.excepciones.find((e) => e.tipo === "PROVEEDOR_NO_IDENTIFICADO");
      expect(excepcion?.tenantId).toBeNull();
      const candidatos = JSON.parse(excepcion?.candidatos ?? "[]") as {
        id: string;
        tenantId: string;
      }[];
      expect(candidatos.map((c) => c.id)).toContain(nombradoEnA.id);
      expect(candidatos.map((c) => c.id)).not.toContain(homonimoEnB.id);
      expect(candidatos.every((c) => c.tenantId === tenantAId)).toBe(true);
    });
  },
);
