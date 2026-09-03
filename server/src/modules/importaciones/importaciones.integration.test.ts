import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL (sin mocks) para el flujo
 * nuevo de expediente aduanero / vistos buenos de Importaciones — en
 * particular para demostrar que el aislamiento multi-tenant de
 * VistoBuenoAduanero (el único modelo del módulo sin columna `tenantId`
 * propia; se verifica vía la relación anidada `expediente: { tenantId }`)
 * efectivamente bloquea el acceso cruzado entre tenants en cada operación
 * (GET/UPDATE/UPLOAD/DOWNLOAD), no solo que un tenant autorizado ve sus
 * propios datos correctamente.
 *
 * Requiere DATABASE_URL (SQL Server real, con el schema ya migrado) y
 * JWT_SECRET configurados como variables de entorno del PROCESO antes de que
 * arranque vitest (se leen a nivel de módulo en auth.middleware.ts /
 * auth.service.ts). Crea y destruye sus propios tenants/usuarios/datos con
 * identificadores aleatorios — no toca ningún dato preexistente.
 *
 * NO se ejecuta como parte de `npm test` (ver vitest.config.mts, que excluye
 * *.integration.test.ts) — solo vía `npm run test:integration`, pensado
 * para el job de CI con SQL Server efímero (ver .github/workflows/ci.yml).
 * Gateada además por RUN_DB_INTEGRATION_TESTS=true como salvaguarda extra
 * contra correrla sin querer contra una base de datos real de desarrollo.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)(
  "Importaciones — expediente aduanero y vistos buenos (multi-tenant real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tokenAAdmin: string;
    let tokenASinPermiso: string;
    let tokenBAdmin: string;
    let ordenAId: string;
    let loteAId: string;
    let vistoBuenoAId: string;

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      const tenantA = await prisma.tenant.create({
        data: { nombre: `Test Tenant A ${sufijo}`, subdomain: `test-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `Test Tenant B ${sufijo}`, subdomain: `test-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      // isSuperadmin=true evita tener que crear un Rol con permisos explícitos
      // para el usuario "autorizado" de cada tenant; el usuario "sin permiso"
      // se deja sin rol ni isSuperadmin para probar el 403.
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `admin-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Tenant A",
          isSuperadmin: true,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `sinpermiso-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Sin Permiso Tenant A",
          isSuperadmin: false,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `admin-b-${sufijo}@test.ricosoft.local`,
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

      tokenAAdmin = await login(`admin-a-${sufijo}@test.ricosoft.local`);
      tokenASinPermiso = await login(`sinpermiso-a-${sufijo}@test.ricosoft.local`);
      tokenBAdmin = await login(`admin-b-${sufijo}@test.ricosoft.local`);

      // Fixture de Tenant A creado vía la API real (no directo en Prisma), para
      // ejercitar toda la cadena Orden -> Lote antes de probar Expediente /
      // VistoBueno sobre ella.
      const ordenRes = await request(app)
        .post("/api/importaciones")
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({
          numeroOrden: `ORD-A-${sufijo}`,
          incoterm: "FOB",
          proveedorExtranjero: "Proveedor de Prueba",
          paisOrigen: "China",
          moneda: "USD",
          trmPactada: 4000,
          items: [{ descripcion: "Ítem de prueba", cantidad: 10, valorUnitarioFob: 100 }],
        });
      if (ordenRes.status !== 201) {
        throw new Error(
          `No se pudo crear la orden fixture: ${ordenRes.status} ${JSON.stringify(ordenRes.body)}`,
        );
      }
      ordenAId = ordenRes.body.id;

      const loteRes = await request(app)
        .post(`/api/importaciones/${ordenAId}/lotes`)
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({ blAwb: `BL-A-${sufijo}`, puertoOrigen: "Shanghai", puertoDestino: "Cartagena" });
      if (loteRes.status !== 201) {
        throw new Error(
          `No se pudo crear el lote fixture: ${loteRes.status} ${JSON.stringify(loteRes.body)}`,
        );
      }
      loteAId = loteRes.body.id;
    });

    afterAll(async () => {
      // Borrado explícito en orden inverso de dependencias: varias relaciones
      // del módulo son onDelete: NoAction (no hay cascada automática desde
      // Tenant). Solo toca los tenants creados en esta suite.
      await prisma.vistoBuenoAduanero.deleteMany({
        where: { expediente: { tenantId: { in: [tenantAId, tenantBId] } } },
      });
      await prisma.expedienteAduanero.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.costeoImportacionDetalle.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      // ImportacionActividad.loteId -> LoteImportacion es onDelete: NoAction
      // (no hay cascada automática) — igual que el resto de este bloque, se
      // borra explícitamente antes que los lotes que referencia.
      await prisma.importacionActividad.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.loteImportacion.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.ordenCompraIntl.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
      await prisma.$disconnect();
    });

    // ---------- Expediente aduanero ----------

    it("usuario autorizado puede actualizar el expediente de su propio tenant", async () => {
      const res = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/expediente`)
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({ numeroDIM: "DIM-0001", certificadoOrigenTlc: "TLC-CO-CN" });

      expect(res.status).toBe(200);
      expect(res.body.numeroDIM).toBe("DIM-0001");
      expect(res.body.certificadoOrigenTlc).toBe("TLC-CO-CN");
    });

    it("usuario sin permiso IMPORTACIONES_GESTIONAR_TRANSITO recibe 403 al intentar editar el expediente", async () => {
      const res = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/expediente`)
        .set("Authorization", `Bearer ${tokenASinPermiso}`)
        .send({ numeroDIM: "DIM-9999" });

      expect(res.status).toBe(403);
    });

    it("usuario de OTRO tenant no puede leer ni actualizar el expediente (404, sin fuga de datos)", async () => {
      const res = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/expediente`)
        .set("Authorization", `Bearer ${tokenBAdmin}`)
        .send({ numeroDIM: "DIM-HACKEADO" });

      expect(res.status).toBe(404);

      // El intento cruzado no debe haber modificado el dato real de Tenant A.
      const real = await prisma.expedienteAduanero.findUnique({ where: { loteId: loteAId } });
      expect(real?.numeroDIM).toBe("DIM-0001");
    });

    it("sube, descarga y elimina el documento DIM del expediente, bloqueando el acceso cruzado en cada paso", async () => {
      const subida = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/expediente/documentos/dim`)
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .attach("archivo", Buffer.from("%PDF-1.4 contenido de prueba"), {
          filename: "dim-prueba.pdf",
          contentType: "application/pdf",
        });
      expect(subida.status).toBe(201);
      expect(subida.body.documentos.dim?.nombre).toBe("dim-prueba.pdf");

      const descargaPropia = await request(app)
        .get(`/api/importaciones/lotes/${loteAId}/expediente/documentos/dim`)
        .set("Authorization", `Bearer ${tokenAAdmin}`);
      expect(descargaPropia.status).toBe(200);
      expect(descargaPropia.headers["content-type"]).toContain("application/pdf");

      const descargaCruzada = await request(app)
        .get(`/api/importaciones/lotes/${loteAId}/expediente/documentos/dim`)
        .set("Authorization", `Bearer ${tokenBAdmin}`);
      expect(descargaCruzada.status).toBe(404);

      const subidaCruzada = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/expediente/documentos/dim`)
        .set("Authorization", `Bearer ${tokenBAdmin}`)
        .attach("archivo", Buffer.from("%PDF-1.4 intento hostil"), {
          filename: "hackeo.pdf",
          contentType: "application/pdf",
        });
      expect(subidaCruzada.status).toBe(404);

      const eliminacionCruzada = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/expediente/documentos/dim`)
        .set("Authorization", `Bearer ${tokenBAdmin}`);
      expect(eliminacionCruzada.status).toBe(404);

      // El documento real de A sigue intacto pese a los tres intentos cruzados.
      const trasIntentos = await prisma.expedienteAduanero.findUnique({
        where: { loteId: loteAId },
      });
      expect(trasIntentos?.dimNombre).toBe("dim-prueba.pdf");

      const eliminacion = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/expediente/documentos/dim`)
        .set("Authorization", `Bearer ${tokenAAdmin}`);
      expect(eliminacion.status).toBe(200);
      expect(eliminacion.body.documentos.dim).toBeNull();

      const descargaTrasEliminar = await request(app)
        .get(`/api/importaciones/lotes/${loteAId}/expediente/documentos/dim`)
        .set("Authorization", `Bearer ${tokenAAdmin}`);
      expect(descargaTrasEliminar.status).toBe(404);
    });

    // ---------- Vistos buenos ----------

    it("crea un visto bueno y actualiza su estado", async () => {
      const creacion = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/expediente/vistos-buenos`)
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({ entidad: "INVIMA", numero: "INV-001" });

      expect(creacion.status).toBe(201);
      expect(creacion.body.entidad).toBe("INVIMA");
      expect(creacion.body.estado).toBe("Pendiente");
      vistoBuenoAId = creacion.body.id;

      const actualizacion = await request(app)
        .patch(`/api/importaciones/vistos-buenos/${vistoBuenoAId}`)
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .send({ estado: "Aprobado" });

      expect(actualizacion.status).toBe(200);
      expect(actualizacion.body.estado).toBe("Aprobado");
    });

    it("usuario sin permiso recibe 403 al intentar crear un visto bueno", async () => {
      const res = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/expediente/vistos-buenos`)
        .set("Authorization", `Bearer ${tokenASinPermiso}`)
        .send({ entidad: "ICA" });

      expect(res.status).toBe(403);
    });

    it(
      "CRÍTICO — Tenant B con un ID real de VistoBueno de Tenant A: ningún verbo (GET vía update, " +
        "UPDATE, UPLOAD, DOWNLOAD) filtra datos ni permite modificar la cadena VistoBueno→Expediente→Lote→Orden de A",
      async () => {
        const actualizacionCruzada = await request(app)
          .patch(`/api/importaciones/vistos-buenos/${vistoBuenoAId}`)
          .set("Authorization", `Bearer ${tokenBAdmin}`)
          .send({ estado: "Rechazado" });
        expect(actualizacionCruzada.status).toBe(404);

        const subidaCruzada = await request(app)
          .post(`/api/importaciones/vistos-buenos/${vistoBuenoAId}/documento`)
          .set("Authorization", `Bearer ${tokenBAdmin}`)
          .attach("archivo", Buffer.from("%PDF-1.4 intento hostil"), {
            filename: "intento.pdf",
            contentType: "application/pdf",
          });
        expect(subidaCruzada.status).toBe(404);

        const descargaCruzada = await request(app)
          .get(`/api/importaciones/vistos-buenos/${vistoBuenoAId}/documento`)
          .set("Authorization", `Bearer ${tokenBAdmin}`);
        expect(descargaCruzada.status).toBe(404);

        // Ninguno de los tres intentos cruzados modificó el estado real.
        const real = await prisma.vistoBuenoAduanero.findUnique({ where: { id: vistoBuenoAId } });
        expect(real?.estado).toBe("Aprobado");
        expect(real?.archivoNombre).toBeNull();

        // La fuga tampoco es posible subiendo por el resto de la cadena: B no
        // ve ni el lote ni la orden de A a través de los endpoints existentes.
        const ordenCruzada = await request(app)
          .get(`/api/importaciones/${ordenAId}`)
          .set("Authorization", `Bearer ${tokenBAdmin}`);
        expect(ordenCruzada.status).toBe(404);
      },
    );

    it("sube y reemplaza el documento de un visto bueno (el archivo anterior se descarta)", async () => {
      const subida = await request(app)
        .post(`/api/importaciones/vistos-buenos/${vistoBuenoAId}/documento`)
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .attach("archivo", Buffer.from("%PDF-1.4 contenido v1"), {
          filename: "visto-v1.pdf",
          contentType: "application/pdf",
        });
      expect(subida.status).toBe(201);
      expect(subida.body.archivo?.nombre).toBe("visto-v1.pdf");

      const reemplazo = await request(app)
        .post(`/api/importaciones/vistos-buenos/${vistoBuenoAId}/documento`)
        .set("Authorization", `Bearer ${tokenAAdmin}`)
        .attach("archivo", Buffer.from("%PDF-1.4 contenido v2"), {
          filename: "visto-v2.pdf",
          contentType: "application/pdf",
        });
      expect(reemplazo.status).toBe(201);
      expect(reemplazo.body.archivo?.nombre).toBe("visto-v2.pdf");

      const descarga = await request(app)
        .get(`/api/importaciones/vistos-buenos/${vistoBuenoAId}/documento`)
        .set("Authorization", `Bearer ${tokenAAdmin}`);
      expect(descarga.status).toBe(200);
    });

    // ---------- Trazabilidad ----------

    it("cada mutación exitosa dejó una entrada real en ImportacionHistorial (historial atómico)", async () => {
      const historial = await prisma.importacionHistorial.findMany({
        where: { ordenCompraId: ordenAId },
      });
      const acciones = historial.map((h) => h.accion);

      expect(acciones).toContain("Expediente aduanero actualizado");
      expect(acciones).toContain("Documento DIM adjuntado");
      expect(acciones).toContain("Documento DIM eliminado");
      expect(acciones).toContain("Visto bueno registrado");
      expect(acciones).toContain("Visto bueno actualizado");
      expect(
        acciones.filter((a) => a === "Documento de visto bueno adjuntado").length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        acciones.filter((a) => a === "Documento de visto bueno reemplazado").length,
      ).toBeGreaterThanOrEqual(1);
    });
  },
);
