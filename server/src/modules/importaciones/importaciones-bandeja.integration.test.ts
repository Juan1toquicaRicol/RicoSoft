import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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

    it("3. proveedor no identificado: crea excepción CON tenantId null, visible solo por superadmin", async () => {
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

      // Un superadmin SÍ puede verlo en el triage cross-tenant.
      const triage = await request(app)
        .get("/api/importaciones/bandeja/sin-asignar")
        .set("Authorization", `Bearer ${tokenSuperadminA}`);
      expect(triage.status).toBe(200);
      expect(triage.body.some((c: { id: string }) => c.id === correo.id)).toBe(true);

      // Un usuario NO superadmin recibe 403 en el triage, aunque sea de un tenant real.
      const triageSinSuperadmin = await request(app)
        .get("/api/importaciones/bandeja/sin-asignar")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(triageSinSuperadmin.status).toBe(403);

      // El superadmin asigna manualmente el proveedor correcto (§18: resolución humana).
      const asignar = await request(app)
        .post(`/api/importaciones/bandeja/sin-asignar/${correo.id}/asignar-proveedor`)
        .set("Authorization", `Bearer ${tokenSuperadminA}`)
        .send({ proveedorId: proveedorAId });
      expect(asignar.status).toBe(200);

      const correoActualizado = await prisma.importacionCorreo.findUniqueOrThrow({
        where: { id: correo.id },
      });
      expect(correoActualizado.tenantId).toBe(tenantAId);
      expect(correoActualizado.proveedorId).toBe(proveedorAId);
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
  },
);
