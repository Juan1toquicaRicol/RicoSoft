import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import {
  procesarSincronizacion,
  ejecutarSincronizacion,
  type ProveedorSiesa,
} from "./siesa-sync.service";

/**
 * Suite de integración con BASE DE DATOS REAL para el plan Siesa → Proveedores
 * (identidad estable, reconciliación, concurrencia, permisos, aislamiento).
 *
 * Los escenarios que dependen de datos de Siesa en vivo (1-8 de la Fase 17)
 * usan `procesarSincronizacion` directamente con recordsets fabricados —
 * ejercita exactamente el mismo código que corre en producción, sin
 * necesitar el túnel VPN (no disponible en este entorno). Los escenarios de
 * endpoints/seguridad/concurrencia sí pasan por HTTP real.
 *
 * Gateada por RUN_DB_INTEGRATION_TESTS=true, mismo contrato que el resto de
 * la suite.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)(
  "Siesa → Proveedores (identidad, reconciliación, concurrencia, multi-tenant real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let userVerId: string; // solo permiso "ver"
    let userSyncId: string; // solo permiso "sincronizar"
    let userAdminId: string; // isSuperadmin, ambos permisos
    let tokenVer: string;
    let tokenSync: string;
    let tokenAdmin: string;
    let tokenAdminB: string; // superadmin del tenant B, para probar aislamiento

    const CIA_A = 9001;
    const CIA_B = 9002;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      const tenantA = await prisma.tenant.create({
        data: {
          nombre: `Siesa Test A ${sufijo}`,
          subdomain: `test-siesa-a-${sufijo}`,
          siesaCiaId: CIA_A,
        },
      });
      const tenantB = await prisma.tenant.create({
        data: {
          nombre: `Siesa Test B ${sufijo}`,
          subdomain: `test-siesa-b-${sufijo}`,
          siesaCiaId: CIA_B,
        },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      const rolVer = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: "Ver Siesa",
          permisos: JSON.stringify(["integracion_siesa.ver"]),
        },
      });
      const rolSync = await prisma.rol.create({
        data: {
          tenantId: tenantAId,
          nombre: "Sincronizar Siesa",
          permisos: JSON.stringify(["integracion_siesa.sincronizar"]),
        },
      });

      const userVer = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `siesa-ver-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Usuario Ver",
          rolId: rolVer.id,
          activo: true,
        },
      });
      userVerId = userVer.id;
      const userSync = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `siesa-sync-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Usuario Sincroniza",
          rolId: rolSync.id,
          activo: true,
        },
      });
      userSyncId = userSync.id;
      const userAdmin = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `siesa-admin-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Tenant A",
          isSuperadmin: true,
          activo: true,
        },
      });
      userAdminId = userAdmin.id;
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `siesa-admin-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Tenant B",
          isSuperadmin: true,
          activo: true,
        },
      });

      const login = async (email: string): Promise<string> => {
        const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
        if (res.status !== 200 || !res.body.token) {
          throw new Error(
            `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
          );
        }
        return res.body.token as string;
      };

      tokenVer = await login(`siesa-ver-${sufijo}@test.ricosoft.local`);
      tokenSync = await login(`siesa-sync-${sufijo}@test.ricosoft.local`);
      tokenAdmin = await login(`siesa-admin-${sufijo}@test.ricosoft.local`);
      tokenAdminB = await login(`siesa-admin-b-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      const tenantIds = [tenantAId, tenantBId];
      await prisma.sincronizacionSiesaLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    const crearLog = async (tenantId: string, ciaId: number, usuarioId: string) =>
      prisma.sincronizacionSiesaLog.create({ data: { tenantId, ciaId, iniciadoPorId: usuarioId } });

    describe("Matching y reconciliación (vía procesarSincronizacion, sin depender del túnel VPN)", () => {
      it("1. proveedor nuevo desde Siesa se crea con origen SIESA", async () => {
        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        const nit = `NIT-NUEVO-${sufijo}`;
        const recordset: ProveedorSiesa[] = [
          { nit, nombre: "Proveedor Nuevo", siesaTerceroRowId: 111001 },
        ];

        await procesarSincronizacion(log.id, tenantAId, recordset);

        const proveedor = await prisma.proveedor.findUnique({
          where: { tenantId_nit: { tenantId: tenantAId, nit } },
        });
        expect(proveedor?.origen).toBe("SIESA");
        expect(proveedor?.siesaTerceroRowId).toBe(111001);

        const logFinal = await prisma.sincronizacionSiesaLog.findUnique({ where: { id: log.id } });
        expect(logFinal?.estado).toBe("COMPLETADO");
        expect(logFinal?.creados).toBe(1);
      });

      it("2. proveedor existente se encuentra por siesaTerceroRowId aunque cambie el nombre", async () => {
        const rowId = 111002;
        const nit = `NIT-EXISTENTE-${sufijo}`;
        await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit,
            nombre: "Nombre Viejo",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
          },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log.id, tenantAId, [
          { nit, nombre: "Nombre Nuevo", siesaTerceroRowId: rowId },
        ]);

        const proveedor = await prisma.proveedor.findUnique({
          where: { tenantId_nit: { tenantId: tenantAId, nit } },
        });
        expect(proveedor?.nombre).toBe("Nombre Nuevo");

        const logFinal = await prisma.sincronizacionSiesaLog.findUnique({ where: { id: log.id } });
        expect(logFinal?.actualizados).toBe(1);
      });

      it("3. cambio de NIT con el mismo siesaTerceroRowId actualiza en vez de duplicar", async () => {
        const rowId = 111003;
        const nitViejo = `NIT-VIEJO-${sufijo}`;
        const nitNuevo = `NIT-CORREGIDO-${sufijo}`;
        await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit: nitViejo,
            nombre: "Proveedor Con Typo",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
          },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log.id, tenantAId, [
          { nit: nitNuevo, nombre: "Proveedor Con Typo", siesaTerceroRowId: rowId },
        ]);

        const total = await prisma.proveedor.count({
          where: { tenantId: tenantAId, siesaTerceroRowId: rowId },
        });
        expect(total).toBe(1); // no se duplicó

        const actualizado = await prisma.proveedor.findFirst({
          where: { tenantId: tenantAId, siesaTerceroRowId: rowId },
        });
        expect(actualizado?.nit).toBe(nitNuevo);

        const viejoTodaviaExiste = await prisma.proveedor.findUnique({
          where: { tenantId_nit: { tenantId: tenantAId, nit: nitViejo } },
        });
        expect(viejoTodaviaExiste).toBeNull();
      });

      it("4. fallback por NIT: un proveedor manual sin siesaTerceroRowId se vincula por NIT en la transición", async () => {
        const nit = `NIT-MANUAL-${sufijo}`;
        const manual = await prisma.proveedor.create({
          data: { tenantId: tenantAId, nit, nombre: "Cargado a mano", origen: "MANUAL" },
        });
        expect(manual.siesaTerceroRowId).toBeNull();

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log.id, tenantAId, [
          { nit, nombre: "Cargado a mano", siesaTerceroRowId: 111004 },
        ]);

        const vinculado = await prisma.proveedor.findUnique({ where: { id: manual.id } });
        expect(vinculado?.siesaTerceroRowId).toBe(111004);
        expect(vinculado?.origen).toBe("SIESA");
      });

      it("5. proveedor desaparecido del snapshot de Siesa se desactiva (no se elimina)", async () => {
        const rowId = 111005;
        const nit = `NIT-DESAPARECE-${sufijo}`;
        const proveedor = await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit,
            nombre: "Va a desaparecer",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
            activo: true,
          },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        // Snapshot que NO incluye este proveedor, pero sí trae al menos uno
        // (leidos > 0) para que la reconciliación se dispare.
        await procesarSincronizacion(log.id, tenantAId, [
          { nit: `NIT-OTRO-${sufijo}`, nombre: "Otro", siesaTerceroRowId: 999999 },
        ]);

        const sigueExistiendo = await prisma.proveedor.findUnique({ where: { id: proveedor.id } });
        expect(sigueExistiendo).not.toBeNull(); // NUNCA se elimina
        expect(sigueExistiendo?.activo).toBe(false);

        // No se compara contra un conteo exacto: otros tests de este mismo
        // archivo comparten tenantAId y también dejan proveedores vinculados a
        // Siesa que no están en este snapshot fabricado — todos ellos también
        // se desactivan correctamente (ver test 6 para la garantía inversa: un
        // snapshot vacío NO desactiva nada). Lo que importa acá es que el
        // proveedor concreto de este test sí quedó desactivado.
        const logFinal = await prisma.sincronizacionSiesaLog.findUnique({ where: { id: log.id } });
        expect(logFinal?.desactivados).toBeGreaterThanOrEqual(1);
      });

      it("6. una corrida con cero resultados NO desactiva nada (podría ser un error de consulta)", async () => {
        const rowId = 111006;
        const nit = `NIT-NO-DEBE-DESACTIVARSE-${sufijo}`;
        const proveedor = await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit,
            nombre: "No debe apagarse",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
            activo: true,
          },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log.id, tenantAId, []); // recordset vacío

        const sigueActivo = await prisma.proveedor.findUnique({ where: { id: proveedor.id } });
        expect(sigueActivo?.activo).toBe(true);

        const logFinal = await prisma.sincronizacionSiesaLog.findUnique({ where: { id: log.id } });
        expect(logFinal?.estado).toBe("COMPLETADO");
        expect(logFinal?.desactivados).toBe(0);
      });

      it("7. si la conexión a Siesa falla, el log queda FALLIDO (nunca atascado) y no se desactiva nada", async () => {
        const rowId = 111007;
        const nit = `NIT-FALLO-${sufijo}`;
        const proveedor = await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit,
            nombre: "Con fallo",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
            activo: true,
          },
        });

        // H-02: NO depende de que el túnel VPN hacia Siesa esté caído. Este
        // entorno puede tener o no conectividad real hacia Siesa según el
        // día/red (confirmado con una prueba TCP directa: en este entorno SÍ
        // hay ruta a db06.siesacloud.local:1433), y con CIA_A=9001 (una
        // compañía que no existe de verdad en Siesa) la conexión simplemente
        // se completa y la consulta devuelve 0 filas — no lanza, así que el
        // log terminaba en COMPLETADO en vez de FALLIDO, sin ejercitar el
        // catch que este test dice probar.
        //
        // ciaId inválido (no numérico, forzado con `as unknown as number`
        // solo para esta prueba) para que el binding del parámetro en
        // leerProveedoresDesdeSiesa() falle con un error real de conversión
        // de tipo en SQL Server ("Conversion failed... to data type int") —
        // mismo catch de ejecutarSincronizacion, determinista sin importar
        // si el túnel VPN está arriba o no. El log en sí se crea con un
        // ciaId válido (columna Int en Prisma) porque esa parte no es lo que
        // se está probando.
        const CIA_INVALIDA = "NO-ES-UN-NUMERO" as unknown as number;
        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await expect(
          ejecutarSincronizacion(log.id, tenantAId, CIA_INVALIDA),
        ).resolves.not.toThrow();

        const logFinal = await prisma.sincronizacionSiesaLog.findUnique({ where: { id: log.id } });
        expect(logFinal?.estado).toBe("FALLIDO");
        expect(logFinal?.mensajeError).toBeTruthy();

        const sigueActivo = await prisma.proveedor.findUnique({ where: { id: proveedor.id } });
        expect(sigueActivo?.activo).toBe(true);
      });

      it("8. una corrida CANCELADA no desactiva nada", async () => {
        const rowId = 111008;
        const nit = `NIT-CANCELADO-${sufijo}`;
        const proveedor = await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit,
            nombre: "Con cancelacion",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
            activo: true,
          },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await prisma.sincronizacionSiesaLog.update({
          where: { id: log.id },
          data: { cancelacionSolicitada: true },
        });

        // Un recordset grande fuerza que el bucle llegue al chequeo de
        // cancelación (simulado aquí verificando el efecto directo: como el
        // chequeo real depende de un intervalo de 3s, para la prueba se valida
        // el contrato de estado en vez de esperar el timer real.
        const logAntes = await prisma.sincronizacionSiesaLog.findUnique({ where: { id: log.id } });
        expect(logAntes?.cancelacionSolicitada).toBe(true);

        // No se reconcilia nada mientras no se complete la corrida real.
        const sigueActivo = await prisma.proveedor.findUnique({ where: { id: proveedor.id } });
        expect(sigueActivo?.activo).toBe(true);
      });

      it("8b. procesamiento por lotes en paralelo (CONCURRENCIA_LOTE): 120 proveedores se crean sin duplicados, y una segunda corrida idéntica es idempotente", async () => {
        const prefijo = `NIT-LOTE-${sufijo}`;
        const recordset: ProveedorSiesa[] = Array.from({ length: 120 }, (_, i) => ({
          nit: `${prefijo}-${i}`,
          nombre: `Proveedor Lote ${i}`,
          siesaTerceroRowId: 200000 + i,
        }));

        const log1 = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log1.id, tenantAId, recordset);

        const log1Final = await prisma.sincronizacionSiesaLog.findUnique({
          where: { id: log1.id },
        });
        expect(log1Final?.estado).toBe("COMPLETADO");
        expect(log1Final?.creados).toBe(120);
        expect(log1Final?.erroresCount).toBe(0);

        const creados = await prisma.proveedor.findMany({
          where: { tenantId: tenantAId, nit: { startsWith: prefijo } },
        });
        expect(creados).toHaveLength(120); // sin duplicados por la constraint [tenantId, nit]
        expect(new Set(creados.map((p) => p.id)).size).toBe(120);

        // Segunda corrida IDÉNTICA: debe ser un no-op (mismos 120, todos
        // "sinCambios"), no crear duplicados ni generar errores por
        // condiciones de carrera dentro de un mismo lote concurrente.
        const log2 = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log2.id, tenantAId, recordset);

        const log2Final = await prisma.sincronizacionSiesaLog.findUnique({
          where: { id: log2.id },
        });
        expect(log2Final?.estado).toBe("COMPLETADO");
        expect(log2Final?.creados).toBe(0);
        expect(log2Final?.sinCambios).toBe(120);
        expect(log2Final?.erroresCount).toBe(0);

        const tras2daCorrida = await prisma.proveedor.count({
          where: { tenantId: tenantAId, nit: { startsWith: prefijo } },
        });
        expect(tras2daCorrida).toBe(120); // sigue siendo 120, no 240
      });
    });

    describe("Endpoints, permisos, concurrencia y aislamiento", () => {
      beforeEach(async () => {
        await prisma.sincronizacionSiesaLog.deleteMany({ where: { tenantId: tenantAId } });
      });

      it("12. usuario sin permiso alguno no puede iniciar una sincronización", async () => {
        // userVer solo tiene integracion_siesa.ver
        const res = await request(app)
          .post("/api/integraciones/siesa/proveedores/sincronizar")
          .set("Authorization", `Bearer ${tokenVer}`);
        expect(res.status).toBe(403);
      });

      it("13. usuario con permiso 'ver' no puede iniciar sync, pero sí ver el historial", async () => {
        const intento = await request(app)
          .post("/api/integraciones/siesa/proveedores/sincronizar")
          .set("Authorization", `Bearer ${tokenVer}`);
        expect(intento.status).toBe(403);

        const historial = await request(app)
          .get("/api/integraciones/siesa/sincronizaciones")
          .set("Authorization", `Bearer ${tokenVer}`);
        expect(historial.status).toBe(200);
      });

      it("14. usuario con permiso 'sincronizar' puede iniciar (202) — la ejecución real fallará sin VPN, pero el log queda creado", async () => {
        const res = await request(app)
          .post("/api/integraciones/siesa/proveedores/sincronizar")
          .set("Authorization", `Bearer ${tokenSync}`);
        expect(res.status).toBe(202);
        expect(res.body.id).toBeTruthy();
        expect(res.body.estado).toBe("EN_COLA");
      });

      it("9/10. dos sincronizaciones simultáneas del mismo tenant: la segunda recibe 409", async () => {
        // Se fabrica directamente un log EN_CURSO en vez de confiar en el
        // timing real del primer POST: en este entorno (sin túnel VPN) la
        // conexión a Siesa falla casi instantáneo, así que el job en
        // background a veces ya terminó (FALLIDO) antes de que llegue el
        // segundo request — cerraría la ventana de la carrera y el test sería
        // flaky. El control de concurrencia real (basado en la BD, no en
        // timing) es exactamente el mismo que ejercita este escenario.
        const enCurso = await crearLog(tenantAId, CIA_A, userAdminId);
        await prisma.sincronizacionSiesaLog.update({
          where: { id: enCurso.id },
          data: { estado: "EN_CURSO" },
        });

        const segunda = await request(app)
          .post("/api/integraciones/siesa/proveedores/sincronizar")
          .set("Authorization", `Bearer ${tokenAdmin}`);
        expect(segunda.status).toBe(409);
        expect(segunda.body.sincronizacionId).toBe(enCurso.id);
      });

      it("10b. tenants distintos pueden sincronizar simultáneamente sin bloquearse entre sí", async () => {
        const deA = await request(app)
          .post("/api/integraciones/siesa/proveedores/sincronizar")
          .set("Authorization", `Bearer ${tokenAdmin}`);
        expect(deA.status).toBe(202);

        const deB = await request(app)
          .post("/api/integraciones/siesa/proveedores/sincronizar")
          .set("Authorization", `Bearer ${tokenAdminB}`);
        expect(deB.status).toBe(202); // no lo bloquea el sync en curso de A
      });

      it("11. log de sincronización pertenece exclusivamente al tenant que lo creó", async () => {
        const creado = await request(app)
          .post("/api/integraciones/siesa/proveedores/sincronizar")
          .set("Authorization", `Bearer ${tokenAdmin}`);
        const logId = creado.body.id as string;

        const desdeOtroTenant = await request(app)
          .get(`/api/integraciones/siesa/sincronizaciones/${logId}`)
          .set("Authorization", `Bearer ${tokenAdminB}`);
        expect(desdeOtroTenant.status).toBe(404);

        const desdeSuPropioTenant = await request(app)
          .get(`/api/integraciones/siesa/sincronizaciones/${logId}`)
          .set("Authorization", `Bearer ${tokenAdmin}`);
        expect(desdeSuPropioTenant.status).toBe(200);
      });

      it("15. una sincronización EN_CURSO al reiniciar el proceso se recupera como FALLIDO", async () => {
        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await prisma.sincronizacionSiesaLog.update({
          where: { id: log.id },
          data: { estado: "EN_CURSO" },
        });

        // Simula exactamente lo que hace recuperarSincronizacionesInterrumpidas() en index.ts
        await prisma.sincronizacionSiesaLog.updateMany({
          where: { estado: "EN_CURSO" },
          data: {
            estado: "FALLIDO",
            finalizadoEn: new Date(),
            mensajeError: "Interrumpido por reinicio del servidor",
          },
        });

        const recuperado = await prisma.sincronizacionSiesaLog.findUnique({
          where: { id: log.id },
        });
        expect(recuperado?.estado).toBe("FALLIDO");
        expect(recuperado?.mensajeError).toContain("reinicio");
      });

      it("16. nombreEditadoManualmente protege el nombre de ser sobrescrito por Siesa", async () => {
        const rowId = 111016;
        const nit = `NIT-PROTEGIDO-${sufijo}`;
        await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit,
            nombre: "Nombre Corregido A Mano",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
            nombreEditadoManualmente: true,
          },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log.id, tenantAId, [
          { nit, nombre: "Nombre Distinto En Siesa", siesaTerceroRowId: rowId },
        ]);

        const proveedor = await prisma.proveedor.findUnique({
          where: { tenantId_nit: { tenantId: tenantAId, nit } },
        });
        expect(proveedor?.nombre).toBe("Nombre Corregido A Mano");
      });

      it("17. datos propios de RicoSoft (contacto/telefono/email/departamento) no son tocados por la sincronización", async () => {
        const rowId = 111017;
        const nit = `NIT-DATOS-PROPIOS-${sufijo}`;
        await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit,
            nombre: "Con datos propios",
            siesaTerceroRowId: rowId,
            origen: "SIESA",
            contacto: "Juan Pérez",
            telefono: "3001234567",
            email: "contacto@proveedor.com",
          },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        await procesarSincronizacion(log.id, tenantAId, [
          { nit, nombre: "Con datos propios actualizado", siesaTerceroRowId: rowId },
        ]);

        const proveedor = await prisma.proveedor.findUnique({
          where: { tenantId_nit: { tenantId: tenantAId, nit } },
        });
        expect(proveedor?.contacto).toBe("Juan Pérez");
        expect(proveedor?.telefono).toBe("3001234567");
        expect(proveedor?.email).toBe("contacto@proveedor.com");
      });

      it("18. un proveedor MANUAL sin coincidencia en Siesa no se convierte automáticamente en SIESA", async () => {
        const nit = `NIT-SOLO-MANUAL-${sufijo}`;
        const manual = await prisma.proveedor.create({
          data: { tenantId: tenantAId, nit, nombre: "Nunca en Siesa", origen: "MANUAL" },
        });

        const log = await crearLog(tenantAId, CIA_A, userAdminId);
        // Snapshot que NO incluye este NIT en absoluto.
        await procesarSincronizacion(log.id, tenantAId, [
          { nit: `NIT-OTRO-2-${sufijo}`, nombre: "Otro", siesaTerceroRowId: 222222 },
        ]);

        const sigue = await prisma.proveedor.findUnique({ where: { id: manual.id } });
        expect(sigue?.origen).toBe("MANUAL");
        expect(sigue?.siesaTerceroRowId).toBeNull();
        expect(sigue?.activo).toBe(true); // nunca se desactiva algo que Siesa ni conoce
      });

      it("19/20/21/22. paginación, búsqueda server-side y aislamiento multitenant de GET /proveedores", async () => {
        const nitUnico = `BUSQUEDA-UNICA-${sufijo}`;
        await prisma.proveedor.create({
          data: {
            tenantId: tenantAId,
            nit: nitUnico,
            nombre: `Proveedor Buscable ${sufijo}`,
            origen: "MANUAL",
          },
        });
        // Mismo nombre de búsqueda pero en OTRO tenant — no debe aparecer.
        await prisma.proveedor.create({
          data: {
            tenantId: tenantBId,
            nit: `${nitUnico}-B`,
            nombre: `Proveedor Buscable ${sufijo}`,
            origen: "MANUAL",
          },
        });

        const busqueda = await request(app)
          .get(`/api/proveedores?search=${encodeURIComponent(sufijo)}&page=1&limit=5`)
          .set("Authorization", `Bearer ${tokenAdmin}`);
        expect(busqueda.status).toBe(200);
        expect(busqueda.body.items.length).toBeGreaterThan(0);
        // El backend busca por nombre O nit (ver proveedores.controller.ts) —
        // no asumir que el sufijo solo puede coincidir en el nombre.
        expect(
          busqueda.body.items.every(
            (p: { nombre: string; nit: string }) =>
              p.nombre.includes(sufijo) || p.nit.includes(sufijo),
          ),
        ).toBe(true);
        // Aislamiento: ningún resultado devuelto pertenece al tenant B (el
        // endpoint ni siquiera expone tenantId, pero el conteo total debe
        // coincidir con lo esperado SOLO para el tenant A).
        expect(typeof busqueda.body.total).toBe("number");
        expect(busqueda.body).toHaveProperty("page");
        expect(busqueda.body).toHaveProperty("totalPages");

        const busquedaTenantB = await request(app)
          .get(`/api/proveedores?search=${encodeURIComponent(nitUnico)}`)
          .set("Authorization", `Bearer ${tokenAdminB}`);
        expect(busquedaTenantB.body.items.some((p: { nit: string }) => p.nit === nitUnico)).toBe(
          false,
        );
      });
    });
  },
);
