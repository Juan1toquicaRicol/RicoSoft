import { describe, it, expect } from "vitest";
import {
  DEFINICIONES_TIPOS,
  TIPOS_CANONICOS,
  TIPOS_CATALOGO_VALIDOS,
  aliasesEnConflicto,
  claveCanonica,
  clavesValidas,
  definicionTipo,
  esTipoCatalogoValido,
  esquemaMetadata,
  leerMetadata,
  resolverPrecedencia,
  serializarMetadata,
  validarClaveNueva,
} from "./catalogos";
import { CATALOGOS_GENERALES, DUPLICADOS_HEREDADOS } from "./catalogos-generales";

const TENANT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TENANT_B = "bbbbbbbb-0000-4000-8000-000000000002";

const fila = (
  clave: string,
  tenantId: string | null,
  extra: Partial<{ activo: boolean; orden: number; metadata: string | null }> = {},
) => ({ clave, tenantId, activo: true, orden: 0, metadata: null, ...extra });

describe("resolverPrecedencia (TENANT sobre GENERAL)", () => {
  it("usa el valor GENERAL cuando el tenant no tiene uno propio", () => {
    const r = resolverPrecedencia([fila("FOB", null), fila("CIF", null)], TENANT_A);
    expect(r.map((f) => f.clave)).toEqual(["CIF", "FOB"]);
    expect(r.every((f) => f.tenantId === null)).toBe(true);
  });

  it("el valor del tenant reemplaza al general de la misma clave (sin duplicarlo)", () => {
    const general = { ...fila("COP", null), etiqueta: "General" };
    const propio = { ...fila("COP", TENANT_A), etiqueta: "Propio" };
    const r = resolverPrecedencia([general, propio], TENANT_A);
    expect(r).toHaveLength(1);
    expect(r[0].etiqueta).toBe("Propio");
    // El orden de llegada no cambia el resultado.
    expect(resolverPrecedencia([propio, general], TENANT_A)[0].etiqueta).toBe("Propio");
  });

  it("una fila del tenant DESACTIVADA oculta el valor general solo para ese tenant", () => {
    const filas = [fila("EFECTIVO", null), fila("EFECTIVO", TENANT_A, { activo: false })];
    expect(clavesValidas(filas, TENANT_A).has("EFECTIVO")).toBe(false);
    // Otro tenant sigue viendo el general activo.
    expect(clavesValidas(filas, TENANT_B).has("EFECTIVO")).toBe(true);
  });

  it("aislamiento: ignora filas de OTRO tenant aunque lleguen mezcladas", () => {
    const filas = [fila("GENERAL_1", null), fila("SOLO_B", TENANT_B), fila("SOLO_A", TENANT_A)];
    const claves = resolverPrecedencia(filas, TENANT_A).map((f) => f.clave);
    expect(claves).toContain("SOLO_A");
    expect(claves).toContain("GENERAL_1");
    expect(claves).not.toContain("SOLO_B");
  });

  it("ordena por `orden` y luego por clave", () => {
    const filas = [
      fila("B", null, { orden: 2 }),
      fila("C", null, { orden: 1 }),
      fila("A", null, { orden: 2 }),
    ];
    expect(resolverPrecedencia(filas, TENANT_A).map((f) => f.clave)).toEqual(["C", "A", "B"]);
  });

  it("catálogo sin filas (inexistente o vacío) no produce claves válidas", () => {
    expect(resolverPrecedencia([], TENANT_A)).toEqual([]);
    expect(clavesValidas([], TENANT_A).size).toBe(0);
  });
});

describe("valores inactivos", () => {
  it("un valor inactivo no es válido, ni por clave ni por alias", () => {
    const filas = [
      fila("TN", null, { metadata: JSON.stringify({ aliases: ["TON"] }), activo: false }),
    ];
    const validas = clavesValidas(filas, TENANT_A);
    expect(validas.has("TN")).toBe(false);
    expect(validas.has("TON")).toBe(false);
    expect(claveCanonica(filas, TENANT_A, "TON")).toBeNull();
  });
});

describe("alias de claves heredadas (compatibilidad con datos guardados)", () => {
  const unidades = [
    fila("KG", null),
    fila("TN", null, { metadata: JSON.stringify({ aliases: ["TON"] }) }),
    // El "TON" heredado sigue existiendo pero desactivado (duplicado exacto).
    fila("TON", null, { activo: false }),
  ];

  it("acepta la clave canónica Y el texto heredado guardado en datos históricos", () => {
    const validas = clavesValidas(unidades, TENANT_A);
    expect(validas.has("TN")).toBe(true);
    expect(validas.has("TON")).toBe(true);
    expect(validas.has("KG")).toBe(true);
    expect(validas.has("LIBRA")).toBe(false);
  });

  it("claveCanonica normaliza el alias a la clave vigente", () => {
    expect(claveCanonica(unidades, TENANT_A, "TON")).toBe("TN");
    expect(claveCanonica(unidades, TENANT_A, "TN")).toBe("TN");
    expect(claveCanonica(unidades, TENANT_A, "NOPE")).toBeNull();
  });

  it("aliasesEnConflicto: un alias no puede ser clave ACTIVA de otra fila, pero sí la de una inactiva", () => {
    const existentes = [
      { clave: "KG", tenantId: null, activo: true },
      { clave: "TON", tenantId: null, activo: false },
      { clave: "LT", tenantId: TENANT_B, activo: true },
    ];
    expect(aliasesEnConflicto(["KG"], "TN", existentes, TENANT_A)).toEqual(["KG"]);
    expect(aliasesEnConflicto(["TON"], "TN", existentes, TENANT_A)).toEqual([]);
    expect(aliasesEnConflicto(["TN"], "TN", existentes, TENANT_A)).toEqual(["TN"]);
    // La clave de OTRO tenant no cuenta como conflicto.
    expect(aliasesEnConflicto(["LT"], "TN", existentes, TENANT_A)).toEqual([]);
  });
});

describe("metadata", () => {
  it("es estricta: rechaza claves desconocidas y tipos incorrectos", () => {
    expect(esquemaMetadata.safeParse({ simbolo: "$" }).success).toBe(true);
    expect(esquemaMetadata.safeParse({ inventado: "x" }).success).toBe(false);
    expect(esquemaMetadata.safeParse({ dias: -1 }).success).toBe(false);
    expect(esquemaMetadata.safeParse({ dias: 1.5 }).success).toBe(false);
    expect(esquemaMetadata.safeParse({ aliases: "TON" }).success).toBe(false);
  });

  it("leerMetadata tolera JSON dañado o ajeno sin lanzar", () => {
    expect(leerMetadata(null)).toEqual({});
    expect(leerMetadata("no es json")).toEqual({});
    expect(leerMetadata(JSON.stringify({ cualquier: "cosa" }))).toEqual({});
    expect(leerMetadata(JSON.stringify({ simbolo: "€" }))).toEqual({ simbolo: "€" });
  });

  it("serializarMetadata no persiste objetos vacíos y conserva dias = 0 (contado)", () => {
    expect(serializarMetadata(null)).toBeNull();
    expect(serializarMetadata({})).toBeNull();
    expect(serializarMetadata({ aliases: [] })).toBeNull();
    expect(JSON.parse(serializarMetadata({ dias: 0 })!)).toEqual({ dias: 0 });
  });
});

describe("validarClaveNueva", () => {
  it("los tipos nuevos exigen código estable MAYÚSCULAS_CON_GUION_BAJO", () => {
    expect(validarClaveNueva("CONDICION_PAGO", "CREDITO_45D")).toBeNull();
    expect(validarClaveNueva("CONDICION_PAGO", "credito 45")).not.toBeNull();
    expect(validarClaveNueva("PAIS", "PE")).toBeNull();
    expect(validarClaveNueva("PAIS", "Perú")).not.toBeNull();
  });

  it("los tipos con datos previos no endurecen retroactivamente su formato", () => {
    expect(validarClaveNueva("MONEDA", "NUEVA-abc123")).toBeNull();
    expect(validarClaveNueva("METODO_PAGO", "Efectivo")).toBeNull();
  });

  it("rechaza clave vacía", () => {
    expect(validarClaveNueva("MONEDA", "   ")).not.toBeNull();
  });
});

describe("definición de tipos", () => {
  it("todo tipo válido tiene definición, y los 9 canónicos requeridos existen", () => {
    for (const tipo of TIPOS_CATALOGO_VALIDOS) expect(definicionTipo(tipo)).toBeDefined();
    expect(DEFINICIONES_TIPOS).toHaveLength(TIPOS_CATALOGO_VALIDOS.length);
    expect([...TIPOS_CANONICOS].sort()).toEqual(
      [
        "INCOTERM",
        "MONEDA",
        "PAIS",
        "CONDICION_PAGO",
        "METODO_PAGO",
        "UNIDAD_MEDIDA",
        "MOTIVO_NOVEDAD_DESPACHO",
        "ESTADO_COMERCIAL",
        "TIPO_OPORTUNIDAD",
      ].sort(),
    );
  });

  it("CONDICION_PAGO y METODO_PAGO son tipos separados", () => {
    expect(esTipoCatalogoValido("CONDICION_PAGO")).toBe(true);
    expect(esTipoCatalogoValido("METODO_PAGO")).toBe(true);
    expect(esTipoCatalogoValido("CATALOGO_INEXISTENTE")).toBe(false);
    expect(esTipoCatalogoValido(undefined)).toBe(false);
  });
});

describe("datos semilla GENERALES", () => {
  const porTipo = (tipo: string) => CATALOGOS_GENERALES.filter((s) => s.tipo === tipo);
  const claves = (tipo: string) => porTipo(tipo).map((s) => s.clave);

  it("incluyen exactamente los valores iniciales requeridos", () => {
    expect(claves("INCOTERM")).toEqual(expect.arrayContaining(["FOB", "CIF", "CFR", "DDP", "EXW"]));
    expect(claves("MONEDA")).toEqual(expect.arrayContaining(["COP", "USD", "EUR"]));
    expect(claves("PAIS")).toEqual(expect.arrayContaining(["CO", "US", "CN", "BR", "DE"]));
    expect(claves("CONDICION_PAGO")).toEqual([
      "CONTADO",
      "CREDITO_15D",
      "CREDITO_30D",
      "CREDITO_60D",
      "CREDITO_90D",
    ]);
    expect(claves("METODO_PAGO")).toEqual(
      expect.arrayContaining(["TRANSFERENCIA", "CHEQUE", "CARTA_CREDITO"]),
    );
    expect(claves("UNIDAD_MEDIDA")).toEqual(
      expect.arrayContaining(["KG", "TN", "SACO_25KG", "BIG_BAG"]),
    );
    expect(claves("MOTIVO_NOVEDAD_DESPACHO")).toEqual(
      expect.arrayContaining([
        "FALTANTE",
        "EMPAQUE_AVERIADO",
        "RETRASO_TRANSPORTE",
        "DIFERENCIA_PESAJE",
      ]),
    );
    expect(claves("ESTADO_COMERCIAL").length).toBeGreaterThan(0);
    expect(claves("TIPO_OPORTUNIDAD").length).toBeGreaterThan(0);
  });

  it("la moneda conserva código ISO, nombre y símbolo por separado (el símbolo no identifica)", () => {
    const cop = porTipo("MONEDA").find((s) => s.clave === "COP")!;
    expect(cop.etiqueta).toBe("Peso colombiano");
    expect(cop.metadata?.simbolo).toBe("$");
    for (const m of porTipo("MONEDA")) expect(m.clave).toMatch(/^[A-Z]{3}$/);
  });

  it("los Incoterms de negocio traen descripción y responsabilidad", () => {
    for (const clave of ["FOB", "CIF", "CFR", "DDP", "EXW"]) {
      const s = porTipo("INCOTERM").find((x) => x.clave === clave)!;
      expect(s.descripcion, clave).toBeTruthy();
      expect(s.metadata?.responsabilidad, clave).toBeTruthy();
    }
  });

  it("las condiciones de crédito declaran sus días (para calcular vencimientos sin código nuevo)", () => {
    const dias = Object.fromEntries(
      porTipo("CONDICION_PAGO").map((s) => [s.clave, s.metadata?.dias]),
    );
    expect(dias).toEqual({
      CONTADO: 0,
      CREDITO_15D: 15,
      CREDITO_30D: 30,
      CREDITO_60D: 60,
      CREDITO_90D: 90,
    });
  });

  it("no hay claves repetidas dentro de un tipo y todos los tipos son válidos", () => {
    const vistos = new Set<string>();
    for (const s of CATALOGOS_GENERALES) {
      expect(esTipoCatalogoValido(s.tipo), s.tipo).toBe(true);
      const id = `${s.tipo}/${s.clave}`;
      expect(vistos.has(id), id).toBe(false);
      vistos.add(id);
    }
  });

  it("toda metadata semilla es válida y respeta el formato de clave de su tipo", () => {
    for (const s of CATALOGOS_GENERALES) {
      if (s.metadata) expect(esquemaMetadata.safeParse(s.metadata).success, s.clave).toBe(true);
      const definicion = definicionTipo(s.tipo)!;
      // Los tipos con datos previos conservan sus claves heredadas tal cual;
      // solo se exige el formato a los tipos nuevos.
      if (definicion.claveCodigoEstable) {
        expect(validarClaveNueva(definicion.tipo, s.clave), `${s.tipo}/${s.clave}`).toBeNull();
      }
    }
  });

  it("ningún alias choca con una clave vigente de su mismo tipo (sin ambigüedad)", () => {
    for (const tipo of new Set(CATALOGOS_GENERALES.map((s) => s.tipo))) {
      const filas = porTipo(tipo).map((s) => ({ clave: s.clave, tenantId: null, activo: true }));
      for (const s of porTipo(tipo)) {
        const conflictos = aliasesEnConflicto(s.metadata?.aliases ?? [], s.clave, filas, TENANT_A);
        expect(conflictos, `${tipo}/${s.clave}`).toEqual([]);
      }
    }
  });

  it("cada duplicado heredado tiene su equivalente canónico con el alias correspondiente", () => {
    for (const par of DUPLICADOS_HEREDADOS) {
      const canonica = CATALOGOS_GENERALES.find(
        (s) => s.tipo === par.tipo && s.clave === par.canonica,
      );
      expect(canonica, `${par.tipo}/${par.canonica}`).toBeDefined();
      expect(canonica!.metadata?.aliases, `${par.tipo}/${par.canonica}`).toContain(par.heredada);
    }
  });

  it("conserva las claves heredadas que otros módulos ya validan", () => {
    expect(claves("PAIS_ORIGEN")).toEqual(expect.arrayContaining(["China", "Colombia"]));
    expect(claves("FORMA_PAGO")).toContain("Crédito 30 días");
    expect(claves("FORMA_PAGO_VENTAS")).toEqual(["Contado", "Crédito 1 día"]);
    expect(claves("MOTIVO_NOVEDAD_IMPORTACION")).toContain("Retraso");
    expect(claves("MOTIVO_NOVEDAD_DESPACHO")).toEqual(
      expect.arrayContaining(["DIRECCION_INCORRECTA", "OTRA", "RECHAZO_CLIENTE"]),
    );
  });

  it("los 9 tipos de novedad de despacho que estaban fijos en el código siguen siendo válidos (por clave o alias)", () => {
    const historicos = [
      "PRODUCTO_FALTANTE",
      "DIRECCION_INCORRECTA",
      "CLIENTE_AUSENTE",
      "VEHICULO_NO_DISPONIBLE",
      "MERCANCIA_AVERIADA",
      "ENTREGA_PARCIAL",
      "RECHAZO_CLIENTE",
      "DEVOLUCION",
      "OTRA",
    ];
    const filas = porTipo("MOTIVO_NOVEDAD_DESPACHO").map((s) => ({
      clave: s.clave,
      tenantId: null,
      activo: true,
      orden: 0,
      metadata: serializarMetadata(s.metadata),
    }));
    const validas = clavesValidas(filas, TENANT_A);
    for (const h of historicos) expect(validas.has(h), h).toBe(true);
  });
});
