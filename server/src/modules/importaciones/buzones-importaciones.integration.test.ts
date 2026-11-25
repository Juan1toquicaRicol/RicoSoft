import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../app";
import { ejecutarCicloProcesamientoCorreos } from "./importaciones-bandeja-procesamiento.job";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import type { EmailMessage, EmailProvider } from "../../integrations/email/email-provider";
import {
  ejecutarCicloIngestaCorreos,
  _establecerFabricaProveedorIngestaParaTests,
} from "./importaciones-bandeja-ingesta.job";
import {
  _establecerFabricaProveedorParaTests,
  obtenerBuzonDelTenant,
  probarConexionBuzon,
  registrarBuzon,
} from "./buzones-importaciones.service";

/**
 * Prueba de aceptación de los buzones de la Bandeja contra la base real de
 * pruebas (ricosoft_integration). Gmail se simula: ninguna prueba toca Gmail.
 */

const sufijo = randomUUID().slice(0, 8);
const dir = (nombre: string) => `${nombre}-${sufijo}@ricol.com.co`;

let tenantRicolId = "";
let tenantOtroId = "";
let responsableGisela = "";
let responsableCompras = "";
let responsableInactivo = "";
let usuarioAjeno = "";
const buzonIds: Record<string, string> = {};

function mensaje(nombre: string, extra: Partial<EmailMessage> = {}): EmailMessage {
  return {
    messageId: `<${nombre}-${sufijo}@test>`,
    providerMessageId: `gl-${nombre}-${sufijo}`,
    from: "Proveedor <ventas@proveedor.test>",
    to: [dir("logistica")],
    subject: `Asunto ${nombre}`,
    date: new Date("2026-11-20T10:00:00Z"),
    bodyText: "Cuerpo de prueba",
    bodyHtml: null,
    attachments: [],
    ...extra,
  };
}

/** Falso de Gmail por buzón. Cuenta las llamadas para probar el aislamiento. */
function falso(mensajes: EmailMessage[] | "falla" | "cuelga") {
  const llamadas = { listados: 0, conexion: 0 };
  const proveedor: EmailProvider & { probarConexion: () => Promise<{ id: string; nombre: string }[]> } = {
    async listNewMessages() {
      llamadas.listados++;
      if (mensajes === "falla") throw new Error("token expirado");
      if (mensajes === "cuelga") return new Promise<never>(() => undefined);
      return { messages: mensajes, nextCursor: null };
    },
    async getAttachmentContent() {
      return Buffer.from("x");
    },
    async probarConexion() {
      llamadas.conexion++;
      return [{ id: "Label_1", nombre: "Piloto" }];
    },
  };
  return { proveedor, llamadas };
}

describe("buzones de la Bandeja (base real)", () => {
  beforeAll(async () => {
    process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED = "true";
    const tRicol = await prisma.tenant.create({
      data: { nombre: `Ricol Buzones ${sufijo}`, subdomain: `test-buzones-ricol-${sufijo}` },
    });
    const tOtro = await prisma.tenant.create({
      data: { nombre: `Otra Buzones ${sufijo}`, subdomain: `test-buzones-otro-${sufijo}` },
    });
    tenantRicolId = tRicol.id;
    tenantOtroId = tOtro.id;

    const crearUsuario = (nombre: string, tenantId: string, activo = true) =>
      prisma.user.create({
        data: {
          tenantId,
          email: `${nombre}-${sufijo}@test.ricosoft.local`,
          passwordHash: "no-usado-en-pruebas",
          nombre,
          activo,
        },
      });
    responsableGisela = (await crearUsuario("gisela", tenantRicolId)).id;
    responsableCompras = (await crearUsuario("compras", tenantRicolId)).id;
    responsableInactivo = (await crearUsuario("inactivo", tenantRicolId, false)).id;
    usuarioAjeno = (await crearUsuario("ajeno", tenantOtroId)).id;
    await prisma.user.updateMany({
      where: { id: { in: [responsableGisela, usuarioAjeno] } }, data: { isSuperadmin: true },
    });
    process.env.IMPORTACIONES_SISTEMAS_TENANT_ID = tenantRicolId;
    process.env.IMPORTACIONES_SISTEMAS_USUARIOS = responsableGisela + "," + responsableCompras;
    process.env.IMPORTACIONES_PROCESSING_ENABLED = "true";
  });

  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Limpia buzones y correos de la prueba previa para que cada caso parta limpio.
    await prisma.importacionCorreoOrigen.deleteMany({ where: { buzon: { tenantId: tenantRicolId } } });
    await prisma.importacionExcepcion.deleteMany({ where: { tenantId: { in: [tenantRicolId, tenantOtroId] } } });
    await prisma.importacionCorreoAdjunto.deleteMany({ where: { correo: { tenantId: tenantRicolId } } });
    await prisma.importacionCorreo.deleteMany({ where: { tenantId: { in: [tenantRicolId, tenantOtroId] } } });
    await prisma.buzonImportaciones.deleteMany({ where: { tenantId: tenantRicolId } });

    const crear = async (nombre: string, estado: string, responsableUsuarioId: string | null) => {
      const fila = await prisma.buzonImportaciones.create({
        data: {
          direccion: dir(nombre),
          tenantId: tenantRicolId,
          estado,
          etiquetaId: estado === "ACTIVO" || estado === "APROBADO" ? `Label_${nombre}` : null,
          responsableUsuarioId,
          registradoPorId: responsableGisela,
          aprobadoPorId: estado === "REGISTRADO" ? null : responsableGisela,
        },
      });
      buzonIds[nombre] = fila.id;
    };
    await crear("logistica", "ACTIVO", null);
    await crear("gisela", "ACTIVO", responsableGisela);
    await crear("compras", "ACTIVO", responsableCompras);
    await crear("nuevo", "REGISTRADO", null);
  });

  afterAll(async () => {
    const tenants = [tenantRicolId, tenantOtroId];
    await prisma.importacionCorreoOrigen.deleteMany({ where: { buzon: { tenantId: { in: tenants } } } });
    await prisma.importacionExcepcion.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.importacionCorreoAdjunto.deleteMany({ where: { correo: { tenantId: { in: tenants } } } });
    await prisma.importacionCorreo.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.buzonImportaciones.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    _establecerFabricaProveedorIngestaParaTests(null);
    _establecerFabricaProveedorParaTests(null);
    delete process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED;
    delete process.env.IMPORTACIONES_PROCESSING_ENABLED;
    delete process.env.IMPORTACIONES_SISTEMAS_TENANT_ID;
    delete process.env.IMPORTACIONES_SISTEMAS_USUARIOS;
  });

  it("aceptación: un buzón falla, los otros dos siguen y un mensaje en ambos queda como un caso con dos orígenes y responsable inicial intacto", async () => {
    const m1 = mensaje("uno");
    const m2 = mensaje("dos");
    const m3 = mensaje("tres");
    const fallo = falso("falla");
    const gisela = falso([m1, m2]);
    const compras = falso([m1, m3]);
    const mapa: Record<string, EmailProvider> = {
      [dir("logistica")]: fallo.proveedor,
      [dir("gisela")]: gisela.proveedor,
      [dir("compras")]: compras.proveedor,
    };
    _establecerFabricaProveedorIngestaParaTests((d) => mapa[d]);

    await ejecutarCicloIngestaCorreos();

    const logistica = await prisma.buzonImportaciones.findUniqueOrThrow({ where: { id: buzonIds.logistica } });
    expect(logistica.ultimoError).toBe("Falló la lectura del buzón.");
    for (const nombre of ["gisela", "compras"]) {
      const b = await prisma.buzonImportaciones.findUniqueOrThrow({ where: { id: buzonIds[nombre] } });
      expect(b.ultimaEjecucion).not.toBeNull();
      expect(b.ultimoError).toBeNull();
    }

    const casos = await prisma.importacionCorreo.findMany({
      where: { tenantId: tenantRicolId },
      include: { origenes: true },
    });
    expect(casos.map((c) => c.messageId).sort()).toEqual(
      [m1.messageId, m2.messageId, m3.messageId].sort(),
    );
    const caso1 = casos.find((c) => c.messageId === m1.messageId)!;
    expect(caso1.responsableUsuarioId).toBe(responsableGisela); // responsable inicial de quien lo recibió primero
    expect(caso1.origenes.map((o) => o.buzonId).sort()).toEqual(
      [buzonIds.gisela, buzonIds.compras].sort(),
    );
  });

  it("repetir el ciclo no duplica casos ni orígenes", async () => {
    const m1 = mensaje("uno");
    const gisela = falso([m1]);
    const compras = falso([m1]);
    const mapa: Record<string, EmailProvider> = {
      [dir("logistica")]: falso([]).proveedor,
      [dir("gisela")]: gisela.proveedor,
      [dir("compras")]: compras.proveedor,
    };
    _establecerFabricaProveedorIngestaParaTests((d) => mapa[d]);

    await ejecutarCicloIngestaCorreos();
    await ejecutarCicloIngestaCorreos();

    expect(await prisma.importacionCorreo.count({ where: { messageId: m1.messageId } })).toBe(1);
    expect(await prisma.importacionCorreoOrigen.count({ where: { correo: { messageId: m1.messageId } } })).toBe(2);
  });

  it("un buzón REGISTRADO no se consulta en el ciclo ni puede probar conexión con Gmail", async () => {
    const consultados: string[] = [];
    const sinUso = falso([mensaje("nuevo")]);
    const fabricaRegistrar = (direccion: string) => {
      consultados.push(direccion);
      return sinUso.proveedor;
    };
    _establecerFabricaProveedorIngestaParaTests(fabricaRegistrar);
    _establecerFabricaProveedorParaTests(fabricaRegistrar);

    await ejecutarCicloIngestaCorreos();
    expect(consultados).not.toContain(dir("nuevo"));
    expect(consultados.sort()).toEqual([dir("compras"), dir("gisela"), dir("logistica")].sort());

    const registrado = await prisma.buzonImportaciones.findUniqueOrThrow({ where: { id: buzonIds.nuevo } });
    const conexion = await probarConexionBuzon(registrado);
    expect(conexion.ok).toBe(false);
    expect(sinUso.llamadas.conexion).toBe(0);
  });

  it("un mensaje de otra empresa no recibe origen ni cambia de tenant", async () => {
    const ajeno = mensaje("ajeno");
    await prisma.importacionCorreo.create({
      data: {
        tenantId: tenantOtroId,
        messageId: ajeno.messageId,
        remitente: ajeno.from,
        destinatarios: "x@test",
        asunto: ajeno.subject,
        fechaRecibido: ajeno.date,
        estadoProcesamiento: "PENDIENTE",
      },
    });
    const compras = falso([ajeno]);
    _establecerFabricaProveedorIngestaParaTests((d) =>
      d === dir("compras") ? compras.proveedor : falso([]).proveedor,
    );

    await ejecutarCicloIngestaCorreos();

    const correo = await prisma.importacionCorreo.findUniqueOrThrow({ where: { messageId: ajeno.messageId } });
    expect(correo.tenantId).toBe(tenantOtroId);
    expect(await prisma.importacionCorreoOrigen.count({ where: { correo: { messageId: ajeno.messageId } } })).toBe(0);
  });

  it("aislamiento: un buzón de Ricol no se obtiene desde otra empresa", async () => {
    expect(await obtenerBuzonDelTenant(buzonIds.gisela, tenantOtroId)).toBeNull();
    expect(await obtenerBuzonDelTenant(buzonIds.gisela, tenantRicolId)).not.toBeNull();
  });

  it("no se registra un buzón con responsable inactivo", async () => {
    const r = await registrarBuzon(
      { id: responsableGisela, tenantId: tenantRicolId },
      { direccion: dir("nuevo2"), responsableUsuarioId: responsableInactivo },
    );
    expect(r.ok).toBe(false);
    expect(await prisma.buzonImportaciones.count({ where: { direccion: dir("nuevo2") } })).toBe(0);
  });

  it("no se registra un buzón fuera del dominio ricol.com.co", async () => {
    const r = await registrarBuzon(
      { id: responsableGisela, tenantId: tenantRicolId },
      { direccion: `ventas-${sufijo}@proveedor.test` },
    );
    expect(r.ok).toBe(false);
  });
  const auth = async (userId: string, tenantId: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
    return "Bearer " + jwt.sign({ sub: userId, tenantId, tv: user.tokenVersion }, process.env.JWT_SECRET!);
  };
  const api = "/api/importaciones/bandeja";

  it("HTTP exige permiso, tenant de Sistemas y aprobación antes de consultar Gmail", async () => {
    const app = createApp();
    const prueba = falso([]);
    _establecerFabricaProveedorParaTests(() => prueba.proveedor);
    const ruta = api + "/operacion/buzones/" + buzonIds.nuevo;
    const admin = await auth(responsableGisela, tenantRicolId);
    expect((await request(app).post(ruta + "/conexion")).status).toBe(401);
    expect((await request(app).post(ruta + "/conexion").set("Authorization", await auth(responsableCompras, tenantRicolId))).status).toBe(403);
    expect((await request(app).post(ruta + "/conexion").set("Authorization", await auth(usuarioAjeno, tenantOtroId))).status).toBe(403);
    expect((await request(app).post(ruta + "/conexion").set("Authorization", admin)).status).toBe(409);
    expect(prueba.llamadas.conexion).toBe(0);
    expect((await request(app).post(ruta + "/aprobar").set("Authorization", admin)).status).toBe(200);
    expect((await request(app).post(ruta + "/conexion").set("Authorization", admin)).status).toBe(200);
    expect(prueba.llamadas.conexion).toBe(1);
  });

  it("retirar un buzón conserva su origen, impide nuevas lecturas y exige aprobación al restaurarlo", async () => {
    const app = createApp();
    const admin = await auth(responsableGisela, tenantRicolId);
    const ajeno = await auth(usuarioAjeno, tenantOtroId);
    const sinPermiso = await auth(responsableCompras, tenantRicolId);
    const ejemplo = mensaje("antes-de-retirar");
    const proveedor = falso([ejemplo]);
    _establecerFabricaProveedorParaTests((direccion) =>
      direccion === dir("logistica") ? proveedor.proveedor : falso([]).proveedor,
    );
    await ejecutarCicloIngestaCorreos();
    const id = buzonIds.logistica;
    const base = api + "/operacion/buzones";
    const ruta = base + "/" + id;
    expect((await request(app).post(ruta + "/retirar").set("Authorization", ajeno)).status).toBe(403);
    expect((await request(app).post(ruta + "/retirar").set("Authorization", sinPermiso)).status).toBe(403);
    const retirado = await request(app).post(ruta + "/retirar").set("Authorization", admin);
    expect(retirado.status).toBe(200);
    expect(retirado.body.buzon.estado).toBe("RETIRADO");
    await ejecutarCicloIngestaCorreos();
    expect(proveedor.llamadas.listados).toBe(1);
    expect((await request(app).post(ruta + "/conexion").set("Authorization", admin)).status).toBe(409);
    expect((await request(app).post(ruta + "/activar").set("Authorization", admin)).status).toBe(409);
    const origen = await prisma.importacionCorreoOrigen.findFirst({
      where: { buzonId: id, correo: { messageId: ejemplo.messageId } },
    });
    expect(origen).not.toBeNull();
    const listado = await request(app).get(base).set("Authorization", admin);
    expect(listado.body.buzones).toContainEqual(expect.objectContaining({ id, estado: "RETIRADO" }));

    const restaurado = await request(app).post(ruta + "/restaurar").set("Authorization", admin);
    expect(restaurado.status).toBe(200);
    expect(restaurado.body.buzon).toMatchObject({ id, estado: "REGISTRADO", etiquetaId: null });
    expect((await request(app).post(ruta + "/conexion").set("Authorization", admin)).status).toBe(409);
    expect(await prisma.importacionCorreoOrigen.count({ where: { buzonId: id } })).toBe(1);
    expect(await prisma.auditoria.count({
      where: { tenantId: tenantRicolId, accion: { in: ["IMPORTACION_BUZON_RETIRADO", "IMPORTACION_BUZON_RESTAURADO"] } },
    })).toBe(2);
  });

  it("reprocesa manualmente un correo histórico de Ricol y permite reasignarlo", async () => {
    const app = createApp();
    const admin = await auth(responsableGisela, tenantRicolId);
    const sistemaAjeno = await auth(usuarioAjeno, tenantOtroId);
    const historico = await prisma.importacionCorreo.create({ data: {
      tenantId: tenantRicolId, messageId: mensaje("historico").messageId,
      asunto: "Histórico", remitente: "sin-proveedor@example.test", destinatarios: dir("logistica"),
      fechaRecibido: new Date().toISOString(), estadoProcesamiento: "PENDIENTE",
    } });
    const ruta = api + "/correos/" + historico.id;
    expect((await request(app).get(ruta).set("Authorization", sistemaAjeno)).status).toBe(404);
    expect((await request(app).put(ruta + "/responsable").set("Authorization", sistemaAjeno)
      .send({ responsableUsuarioId: usuarioAjeno })).status).toBe(403);
    await ejecutarCicloProcesamientoCorreos();
    expect((await prisma.importacionCorreo.findUniqueOrThrow({ where: { id: historico.id } })).estadoProcesamiento).toBe("PENDIENTE");

    expect((await request(app).put(ruta + "/responsable").set("Authorization", admin)
      .send({ responsableUsuarioId: responsableCompras })).status).toBe(204);
    expect((await request(app).post(ruta + "/reprocesar").set("Authorization", admin)).status).toBe(204);
    await ejecutarCicloProcesamientoCorreos();
    expect(await prisma.importacionCorreo.findUniqueOrThrow({ where: { id: historico.id } })).toMatchObject({
      estadoProcesamiento: "REQUIERE_REVISION", reprocesoHistorico: false, responsableUsuarioId: responsableCompras,
    });
  });

  it("cancela un adjunto vencido, impide su procesamiento y continúa con los demás buzones", async () => {
    const adjunto = { providerAttachmentId: "adjunto-lento", filename: "archivo.txt", mimeType: "text/plain", size: 1 };
    const lento = mensaje("demora", { attachments: [adjunto] });
    const rapido = mensaje("siguiente");
    await prisma.buzonImportaciones.update({ where: { id: buzonIds.logistica }, data: { timeoutSegundos: 1 } });
    let abortado = false;
    _establecerFabricaProveedorIngestaParaTests((direccion) => ({
      listNewMessages: async () => ({ messages: direccion === dir("logistica") ? [lento] : [rapido], nextCursor: null }),
      getAttachmentContent: async (_id, _adjunto, signal) => new Promise<Buffer>((_, reject) => {
        signal?.addEventListener("abort", () => { abortado = true; reject(signal.reason); }, { once: true });
      }),
    }));
    await ejecutarCicloIngestaCorreos();
    expect(abortado).toBe(true);
    expect(await prisma.importacionCorreo.findUnique({ where: { messageId: lento.messageId } })).toMatchObject({
      estadoProcesamiento: "ERROR", ingestaCompleta: false,
    });
    expect(await prisma.importacionCorreo.findUnique({ where: { messageId: rapido.messageId } })).toMatchObject({
      estadoProcesamiento: "PENDIENTE", ingestaCompleta: true,
    });
    expect((await prisma.buzonImportaciones.findUniqueOrThrow({ where: { id: buzonIds.logistica } })).ultimoError).toContain("tiempo");
  });

  it("una omisión por empresa no vuelve a ocupar cupo en el mismo buzón", async () => {
    const ajeno = mensaje("omision-ajena");
    const nuevo = mensaje("posterior-a-omision");
    await prisma.importacionCorreo.create({ data: {
      tenantId: tenantOtroId, messageId: ajeno.messageId, asunto: ajeno.subject,
      remitente: ajeno.from, destinatarios: dir("logistica"), fechaRecibido: ajeno.date.toISOString(),
    } });
    await prisma.buzonImportaciones.update({ where: { id: buzonIds.logistica }, data: { correosPorCiclo: 1 } });
    _establecerFabricaProveedorIngestaParaTests((direccion) => ({
      listNewMessages: async (_cursor, max, opciones) => ({
        messages: direccion === dir("logistica")
          ? [ajeno, nuevo].filter((m) => !opciones?.omitirIds?.has(m.providerMessageId)).slice(0, max) : [],
        nextCursor: null,
      }),
      getAttachmentContent: async () => Buffer.from(""),
    }));
    await ejecutarCicloIngestaCorreos();
    expect(await prisma.importacionMensajeOmitido.count({ where: { buzonId: buzonIds.logistica } })).toBe(1);
    await ejecutarCicloIngestaCorreos();
    expect(await prisma.importacionCorreo.findUnique({ where: { messageId: nuevo.messageId } })).toMatchObject({ tenantId: tenantRicolId });
    expect(await prisma.importacionCorreoOrigen.count({ where: { correo: { messageId: ajeno.messageId } } })).toBe(0);
  });

});
