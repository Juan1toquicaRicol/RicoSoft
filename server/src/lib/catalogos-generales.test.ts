import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CATALOGOS_GENERALES, sincronizarCatalogosGenerales } from "./catalogos-generales";
import { clavesValidas, leerMetadata } from "./catalogos";

/**
 * `sincronizarCatalogosGenerales` solo usa findFirst/create/update/updateMany
 * de catalogoValor. Este almacén en memoria implementa esas cuatro
 * operaciones con la semántica real (filtro por igualdad), de modo que la
 * prueba ejercita la lógica de sincronización de verdad — no un mock que
 * repita lo que el código ya hace.
 */
interface Fila {
  id: string;
  tipo: string;
  clave: string;
  etiqueta: string;
  descripcion: string | null;
  metadata: string | null;
  orden: number;
  activo: boolean;
  tenantId: string | null;
}

function crearAlmacen(
  inicial: Partial<Fila>[] = [],
  opciones: { ignorarMayusculas?: boolean } = {},
) {
  const filas: Fila[] = inicial.map((f, i) => ({
    id: `id-${i}`,
    tipo: "",
    clave: "",
    etiqueta: "",
    descripcion: null,
    metadata: null,
    orden: 0,
    activo: true,
    tenantId: null,
    ...f,
  }));
  // SQL Server (collation por defecto, p. ej. la imagen de CI) compara texto sin
  // distinguir mayúsculas: `ignorarMayusculas` reproduce ese comportamiento. El
  // filtro `{ not }` cubre `id: { not: ... }` de Prisma.
  const igual = (a: unknown, b: unknown) =>
    opciones.ignorarMayusculas && typeof a === "string" && typeof b === "string"
      ? a.toLowerCase() === b.toLowerCase()
      : a === b;
  const coincide = (f: Fila, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const actual = f[k as keyof Fila];
      if (v !== null && typeof v === "object" && "not" in v) {
        return !igual(actual, (v as { not: unknown }).not);
      }
      return igual(actual, v);
    });
  let secuencia = 1000;

  const cliente = {
    catalogoValor: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        filas.find((f) => coincide(f, where)) ?? null,
      create: async ({ data }: { data: Omit<Fila, "id" | "activo"> & { activo?: boolean } }) => {
        const nueva = { id: `id-${secuencia++}`, activo: true, ...data } as Fila;
        filas.push(nueva);
        return nueva;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) => {
        const fila = filas.find((f) => f.id === where.id)!;
        Object.assign(fila, data);
        return fila;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<Fila>;
      }) => {
        const objetivo = filas.filter((f) => coincide(f, where));
        objetivo.forEach((f) => Object.assign(f, data));
        return { count: objetivo.length };
      },
    },
  } as unknown as PrismaClient;

  return { filas, cliente };
}

const buscar = (filas: Fila[], tipo: string, clave: string) =>
  filas.find((f) => f.tipo === tipo && f.clave === clave && f.tenantId === null);

describe("sincronizarCatalogosGenerales", () => {
  it("en una base vacía crea todo, con orden por tipo, y es idempotente", async () => {
    const { filas, cliente } = crearAlmacen();
    const primera = await sincronizarCatalogosGenerales(cliente);
    expect(primera.creados).toBe(CATALOGOS_GENERALES.length);
    expect(primera.desactivados).toBe(0);

    const segunda = await sincronizarCatalogosGenerales(cliente);
    expect(segunda).toEqual({ creados: 0, enriquecidos: 0, desactivados: 0 });
    expect(filas).toHaveLength(CATALOGOS_GENERALES.length);

    // orden = posición dentro de su propio tipo
    const condiciones = filas.filter((f) => f.tipo === "CONDICION_PAGO").map((f) => f.orden);
    expect(condiciones).toEqual([0, 1, 2, 3, 4]);
  });

  it("en una base con el catálogo ANTERIOR: enriquece, desactiva duplicados heredados y no pierde nada", async () => {
    const { filas, cliente } = crearAlmacen([
      { tipo: "INCOTERM", clave: "FOB", etiqueta: "FOB" },
      { tipo: "MONEDA", clave: "USD", etiqueta: "USD" },
      { tipo: "UNIDAD_MEDIDA", clave: "TON", etiqueta: "TON" },
      { tipo: "UNIDAD_MEDIDA", clave: "SACO25KG", etiqueta: "SACO25KG" },
      { tipo: "UNIDAD_MEDIDA", clave: "KG", etiqueta: "KG" },
      { tipo: "METODO_PAGO", clave: "Transferencia", etiqueta: "Transferencia" },
      { tipo: "METODO_PAGO", clave: "Efectivo", etiqueta: "Efectivo" },
    ]);
    const resultado = await sincronizarCatalogosGenerales(cliente);

    expect(resultado.desactivados).toBe(3); // TON, SACO25KG, Transferencia
    expect(buscar(filas, "UNIDAD_MEDIDA", "TON")!.activo).toBe(false);
    expect(buscar(filas, "UNIDAD_MEDIDA", "SACO25KG")!.activo).toBe(false);
    expect(buscar(filas, "METODO_PAGO", "Transferencia")!.activo).toBe(false);
    // No es un duplicado exacto ni tiene equivalente: se conserva activo.
    expect(buscar(filas, "METODO_PAGO", "Efectivo")!.activo).toBe(true);
    // Nada se borra: las filas heredadas siguen ahí.
    expect(buscar(filas, "UNIDAD_MEDIDA", "TON")).toBeDefined();

    // FOB existía con etiqueta = clave: se enriquece sin cambiar la clave.
    const fob = buscar(filas, "INCOTERM", "FOB")!;
    expect(fob.etiqueta).toBe("FOB - Free On Board");
    expect(fob.descripcion).toBeTruthy();
    expect(leerMetadata(fob.metadata).responsabilidad).toBeTruthy();
    expect(leerMetadata(buscar(filas, "MONEDA", "USD")!.metadata).simbolo).toBe("US$");
  });

  it("tras la sincronización, el texto heredado guardado en datos sigue siendo válido (por alias)", async () => {
    const { filas, cliente } = crearAlmacen([
      { tipo: "UNIDAD_MEDIDA", clave: "TON", etiqueta: "TON" },
      { tipo: "METODO_PAGO", clave: "Cheque", etiqueta: "Cheque" },
    ]);
    await sincronizarCatalogosGenerales(cliente);

    const tenant = "aaaaaaaa-0000-4000-8000-000000000001";
    const unidades = clavesValidas(
      filas.filter((f) => f.tipo === "UNIDAD_MEDIDA"),
      tenant,
    );
    expect(unidades.has("TON")).toBe(true); // heredada, cubierta por el alias de TN
    expect(unidades.has("TN")).toBe(true);
    const metodos = clavesValidas(
      filas.filter((f) => f.tipo === "METODO_PAGO"),
      tenant,
    );
    expect(metodos.has("Cheque")).toBe(true);
    expect(metodos.has("CHEQUE")).toBe(true);
  });

  it("con comparación sin distinguir mayúsculas (SQL Server) no desactiva la fila canónica recién creada", async () => {
    // Regresión del CI: `Transferencia`/`TRANSFERENCIA` y `Cheque`/`CHEQUE` son la
    // MISMA fila para SQL Server, así que desactivar "el duplicado heredado" apagaba
    // la canónica y el pago con "Transferencia" se rechazaba (400).
    const { filas, cliente } = crearAlmacen([], { ignorarMayusculas: true });
    await sincronizarCatalogosGenerales(cliente);

    expect(buscar(filas, "METODO_PAGO", "TRANSFERENCIA")!.activo).toBe(true);
    expect(buscar(filas, "METODO_PAGO", "CHEQUE")!.activo).toBe(true);
    const metodos = clavesValidas(
      filas.filter((f) => f.tipo === "METODO_PAGO"),
      "aaaaaaaa-0000-4000-8000-000000000001",
    );
    for (const valor of ["Transferencia", "TRANSFERENCIA", "Cheque", "CHEQUE", "Efectivo"]) {
      expect(metodos.has(valor)).toBe(true);
    }
  });

  it("agrega alias canónicos faltantes sin borrar metadata existente", async () => {
    const { filas, cliente } = crearAlmacen([
      {
        tipo: "METODO_PAGO",
        clave: "TRANSFERENCIA",
        etiqueta: "Transferencia bancaria",
        metadata: JSON.stringify({ aliases: ["TRF"] }),
      },
      {
        tipo: "METODO_PAGO",
        clave: "CHEQUE",
        etiqueta: "Cheque",
        metadata: JSON.stringify({ aliases: ["CHQ"] }),
      },
    ]);

    await sincronizarCatalogosGenerales(cliente);

    const transferencia = leerMetadata(buscar(filas, "METODO_PAGO", "TRANSFERENCIA")!.metadata);
    const cheque = leerMetadata(buscar(filas, "METODO_PAGO", "CHEQUE")!.metadata);
    expect(transferencia.aliases).toEqual(expect.arrayContaining(["TRF", "Transferencia"]));
    expect(cheque.aliases).toEqual(expect.arrayContaining(["CHQ", "Cheque"]));
    expect(buscar(filas, "METODO_PAGO", "TRANSFERENCIA")!.etiqueta).toBe("Transferencia bancaria");
  });

  it("no pisa lo que un administrador ya personalizó (etiqueta, descripción, metadata, activo)", async () => {
    const { filas, cliente } = crearAlmacen([
      {
        tipo: "INCOTERM",
        clave: "CIF",
        etiqueta: "Mi CIF personalizado",
        descripcion: "Texto propio",
        metadata: JSON.stringify({ responsabilidad: "Propia" }),
        activo: false,
      },
    ]);
    await sincronizarCatalogosGenerales(cliente);
    const cif = buscar(filas, "INCOTERM", "CIF")!;
    expect(cif.etiqueta).toBe("Mi CIF personalizado");
    expect(cif.descripcion).toBe("Texto propio");
    expect(leerMetadata(cif.metadata).responsabilidad).toBe("Propia");
    expect(cif.activo).toBe(false);
  });

  it("no vuelve a desactivar un duplicado heredado que un admin reactivó después", async () => {
    const { filas, cliente } = crearAlmacen([
      { tipo: "UNIDAD_MEDIDA", clave: "TON", etiqueta: "TON" },
    ]);
    await sincronizarCatalogosGenerales(cliente); // introduce TN y desactiva TON
    buscar(filas, "UNIDAD_MEDIDA", "TON")!.activo = true; // el admin lo reactiva
    const segunda = await sincronizarCatalogosGenerales(cliente);
    expect(segunda.desactivados).toBe(0);
    expect(buscar(filas, "UNIDAD_MEDIDA", "TON")!.activo).toBe(true);
  });

  it("solo toca valores GENERALES: un valor propio de un tenant con la misma clave no se modifica", async () => {
    const tenant = "aaaaaaaa-0000-4000-8000-000000000001";
    const { filas, cliente } = crearAlmacen([
      { tipo: "INCOTERM", clave: "FOB", etiqueta: "FOB", tenantId: tenant },
    ]);
    await sincronizarCatalogosGenerales(cliente);
    const propio = filas.find((f) => f.tenantId === tenant)!;
    expect(propio.etiqueta).toBe("FOB");
    expect(propio.descripcion).toBeNull();
    // Y el general se creó aparte.
    expect(buscar(filas, "INCOTERM", "FOB")).toBeDefined();
  });
});
