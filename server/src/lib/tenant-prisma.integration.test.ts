import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../config/prisma";
import { getTenantPrisma } from "./tenant-prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para el mecanismo de
 * enforcement estructural de tenantId (Fase 1 — piloto). Prueba la
 * EXTENSIÓN en sí, directamente, sin pasar por ningún controller: ningún
 * módulo de la aplicación consume tenantPrisma todavía, esto es
 * exclusivamente la verificación del mecanismo antes de migrar nada.
 *
 * Se usa `Proveedor` como modelo de prueba (tenant-scoped, sin nullable,
 * sin semántica GENERAL, ya excluido de casos especiales — ver el
 * comentario de exclusiones en tenant-prisma.ts).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

interface ConIdDto {
  id: string;
}

describe.skipIf(!RUN)("tenant-prisma — enforcement estructural de tenantId (Fase 1 piloto)", () => {
  const sufijo = randomUUID().slice(0, 8);
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    const tenantA = await prisma.tenant.create({
      data: { nombre: `TenantPrisma Test A ${sufijo}`, subdomain: `test-tp-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `TenantPrisma Test B ${sufijo}`, subdomain: `test-tp-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("create: inyecta tenantId automáticamente, sin que el caller lo pase", async () => {
    const tpA = getTenantPrisma(tenantAId);
    const nit = `NIT-CREATE-${sufijo}`;
    // Deliberadamente NO se pasa tenantId en data.
    const proveedor = await tpA.proveedor.create({
      data: { nit, nombre: "Creado sin tenantId" },
    });
    expect(proveedor.tenantId).toBe(tenantAId);
  });

  it("findMany/findFirst/count: filtran automáticamente por el tenant del cliente", async () => {
    const tpA = getTenantPrisma(tenantAId);
    const tpB = getTenantPrisma(tenantBId);
    const nit = `NIT-FINDMANY-${sufijo}`;
    await tpA.proveedor.create({ data: { nit, nombre: "Solo de A" } });

    const desdeA = await tpA.proveedor.findMany({ where: { nit } });
    expect(desdeA).toHaveLength(1);

    const desdeB = await tpB.proveedor.findMany({ where: { nit } });
    expect(desdeB).toHaveLength(0);

    const countA = await tpA.proveedor.count({ where: { nit } });
    const countB = await tpB.proveedor.count({ where: { nit } });
    expect(countA).toBe(1);
    expect(countB).toBe(0);
  });

  it("findUnique: devuelve null si el registro pertenece a otro tenant (aunque el id sea correcto)", async () => {
    const tpA = getTenantPrisma(tenantAId);
    const tpB = getTenantPrisma(tenantBId);
    const nit = `NIT-FINDUNIQUE-${sufijo}`;
    const proveedor = await tpA.proveedor.create({ data: { nit, nombre: "De A" } });

    const desdeA = await tpA.proveedor.findUnique({ where: { id: proveedor.id } });
    expect(desdeA).not.toBeNull();

    const desdeB = await tpB.proveedor.findUnique({ where: { id: proveedor.id } });
    expect(desdeB).toBeNull();
  });

  it("update: NUNCA ejecuta la escritura contra un registro de otro tenant (pre-chequeo, no post-chequeo)", async () => {
    const tpA = getTenantPrisma(tenantAId);
    const tpB = getTenantPrisma(tenantBId);
    const nit = `NIT-UPDATE-${sufijo}`;
    const proveedor = await tpA.proveedor.create({
      data: { nit, nombre: "Nombre Original" },
    });

    await expect(
      tpB.proveedor.update({ where: { id: proveedor.id }, data: { nombre: "Hackeado" } }),
    ).rejects.toThrow();

    // Prueba directa e inequívoca de que la fila NUNCA se tocó: se lee con
    // el cliente base (sin extensión), no con tpA, para no depender del
    // propio mecanismo que se está probando.
    const sinTocar = await prisma.proveedor.findUnique({ where: { id: proveedor.id } });
    expect(sinTocar?.nombre).toBe("Nombre Original");

    // El mismo update, desde el tenant correcto, sí funciona.
    const actualizado = await tpA.proveedor.update({
      where: { id: proveedor.id },
      data: { nombre: "Nombre Actualizado" },
    });
    expect(actualizado.nombre).toBe("Nombre Actualizado");
  });

  it("delete: NUNCA ejecuta la eliminación contra un registro de otro tenant", async () => {
    const tpA = getTenantPrisma(tenantAId);
    const tpB = getTenantPrisma(tenantBId);
    const nit = `NIT-DELETE-${sufijo}`;
    const proveedor = await tpA.proveedor.create({ data: { nit, nombre: "A borrar" } });

    await expect(tpB.proveedor.delete({ where: { id: proveedor.id } })).rejects.toThrow();

    const sigueExistiendo = await prisma.proveedor.findUnique({ where: { id: proveedor.id } });
    expect(sigueExistiendo).not.toBeNull();

    // Desde el tenant correcto sí se puede eliminar.
    await tpA.proveedor.delete({ where: { id: proveedor.id } });
    const yaNoExiste = await prisma.proveedor.findUnique({ where: { id: proveedor.id } });
    expect(yaNoExiste).toBeNull();
  });

  it("updateMany/deleteMany: el where se fusiona con tenantId, nunca lo reemplaza por completo", async () => {
    const tpA = getTenantPrisma(tenantAId);
    const tpB = getTenantPrisma(tenantBId);
    const nitCompartido = `NIT-MASIVO-${sufijo}`;
    await prisma.proveedor.create({
      data: { tenantId: tenantAId, nit: nitCompartido, nombre: "De A" },
    });
    await prisma.proveedor.create({
      data: { tenantId: tenantBId, nit: `${nitCompartido}-B`, nombre: "De B" },
    });

    // updateMany desde B con un where amplio (sin nit) no debe tocar la fila de A.
    const resultado = await tpB.proveedor.updateMany({
      where: {},
      data: { contacto: "Tocado por B" },
    });
    expect(resultado.count).toBe(1); // solo la propia de B

    const filaDeA = await prisma.proveedor.findFirst({
      where: { tenantId: tenantAId, nit: nitCompartido },
    });
    expect(filaDeA?.contacto).toBeNull();
  });

  it("el cliente extendido sigue funcionando correctamente dentro de $transaction (propagación confirmada)", async () => {
    const tpA = getTenantPrisma(tenantAId);
    const nit = `NIT-TX-${sufijo}`;

    const resultado = await tpA.$transaction(async (tx) => {
      const creado = await tx.proveedor.create({ data: { nit, nombre: "Creado en transacción" } });
      return tx.proveedor.findUnique({ where: { id: creado.id } });
    });

    expect(resultado?.tenantId).toBe(tenantAId);
  });

  it("modelos excluidos a propósito (Departamento) NO pasan por este enforcement — siguen con whereAlcance manual", async () => {
    // Confirma que el diseño realmente excluye Departamento/Rol/Modulo:
    // un tenantPrisma no debería alterar su comportamiento (ni inyectar
    // tenantId en create, ni filtrar en findMany) porque no está en
    // MODELOS_TENANT_SCOPED — se prueba negativamente: crear un
    // departamento GENERAL (tenantId null) a través del cliente base sigue
    // siendo visible sin que tenantPrisma lo intercepte de ninguna forma.
    const tpA = getTenantPrisma(tenantAId);
    const nombre = `Depto Excluido ${sufijo}`;
    const general = await prisma.departamento.create({ data: { tenantId: null, nombre } });
    try {
      const desdeExtendido = await tpA.departamento.findMany({ where: { nombre } });
      // Si tenantPrisma NO intercepta Departamento (como debe ser), esta
      // consulta se comporta igual que con el cliente base: encuentra el
      // GENERAL sin que nadie le haya agregado un filtro de tenantId.
      expect(desdeExtendido.some((d: ConIdDto) => d.id === general.id)).toBe(true);
    } finally {
      await prisma.departamento.delete({ where: { id: general.id } });
    }
  });
});
