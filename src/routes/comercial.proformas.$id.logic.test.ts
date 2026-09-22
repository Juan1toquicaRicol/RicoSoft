import { describe, expect, it } from "vitest";
import {
  calcularCortesDePagina,
  calcularEmpaquePlocks,
  calcularTotalPaginas,
  esTenantGreenSolutions,
  esValorMostrable,
  formatearFechaProforma,
  formatearHoraProforma,
  resolverEncabezadoCorporativoProforma,
  valorONulo,
  type SeccionMedida,
} from "./comercial.proformas.$id.logic";
import { calcularTotalesProformaPreview } from "@/lib/proforma-calculo";

describe("formatearFechaProforma", () => {
  it("formatea la fecha de la Proforma 3903 real (createdAt UTC) como dd/mm/aaaa en huso de Bogotá", () => {
    // Dato real: server/prisma → Proforma 3903, GRUPO COMESA SAS,
    // createdAt = 2026-09-18T20:58:09.969Z (20:58 UTC = 15:58 Bogotá).
    expect(formatearFechaProforma("2026-09-18T20:58:09.969Z")).toBe("18/09/2026");
  });

  it("siempre usa 2 dígitos de día/mes y 4 de año, sin depender del locale por defecto", () => {
    expect(formatearFechaProforma("2026-01-05T12:00:00.000Z")).toBe("05/01/2026");
  });
});

describe("formatearHoraProforma", () => {
  it("formatea la hora de la Proforma 3903 real como 3:58 p.m. (no 20:58, no 'PM' en mayúsculas)", () => {
    expect(formatearHoraProforma("2026-09-18T20:58:09.969Z")).toBe("3:58 p.m.");
  });

  it("distingue a.m. de p.m. correctamente", () => {
    expect(formatearHoraProforma("2026-09-18T14:05:00.000Z")).toBe("9:05 a.m."); // 14:05 UTC = 09:05 Bogotá
  });

  it("nunca deja fecha y hora pegadas en un solo string", () => {
    const hora = formatearHoraProforma("2026-09-18T20:58:09.969Z");
    expect(hora).not.toMatch(/\d{4}/); // sin año/fecha mezclada
    expect(hora).toMatch(/^\d{1,2}:\d{2} [ap]\.m\.$/);
  });
});

describe("esValorMostrable / valorONulo", () => {
  it("oculta null, undefined y string vacío", () => {
    expect(esValorMostrable(null)).toBe(false);
    expect(esValorMostrable(undefined)).toBe(false);
    expect(esValorMostrable("")).toBe(false);
    expect(esValorMostrable("   ")).toBe(false);
  });

  it("oculta placeholders residuales como '.', '-', '--' (dato real: contacto de la Proforma 3903 = '.')", () => {
    expect(esValorMostrable(".")).toBe(false);
    expect(esValorMostrable("-")).toBe(false);
    expect(esValorMostrable("--")).toBe(false);
    expect(esValorMostrable("—")).toBe(false);
  });

  it("muestra valores reales, incluida la NIT de la Proforma 3903", () => {
    expect(esValorMostrable("901029156")).toBe(true);
    expect(esValorMostrable("3122596483")).toBe(true);
    expect(esValorMostrable("CR 37 10 197")).toBe(true);
  });

  it("valorONulo recorta espacios y devuelve null cuando no es mostrable", () => {
    expect(valorONulo("  3122596483  ")).toBe("3122596483");
    expect(valorONulo(".")).toBeNull();
    expect(valorONulo(null)).toBeNull();
  });
});

/** Reconstruye los tramos [inicio, fin) de cada página a partir de las
 * secciones y los cortes, para poder afirmar la propiedad que de verdad
 * importa: que la unión de todos los tramos cubre EXACTAMENTE
 * [primerTop, últimoBottom] sin huecos (nada de contenido perdido) y sin
 * solapes (nada repetido en dos páginas). */
function tramosDePagina(secciones: SeccionMedida[], cortes: number[]) {
  const limites = [secciones[0].top, ...cortes, secciones[secciones.length - 1].bottom];
  const tramos: { inicio: number; fin: number }[] = [];
  for (let i = 0; i < limites.length - 1; i++) {
    tramos.push({ inicio: limites[i], fin: limites[i + 1] });
  }
  return tramos;
}

describe("calcularCortesDePagina / calcularTotalPaginas", () => {
  it("un documento que cabe completo en el alto de una página da 1 sola página (caso real: Proforma 3903, 1 ítem)", () => {
    const secciones: SeccionMedida[] = [
      { top: 0, bottom: 40 }, // encabezado
      { top: 40, bottom: 90 }, // cliente
      { top: 90, bottom: 110 }, // condiciones comerciales
      { top: 110, bottom: 140 }, // tabla (1 fila)
      { top: 140, bottom: 160 }, // totales
      { top: 160, bottom: 180 }, // retenciones
      { top: 180, bottom: 230 }, // observaciones + firmas + pie
    ];
    expect(calcularTotalPaginas(secciones, 260)).toBe(1);
    expect(calcularCortesDePagina(secciones, 260)).toEqual([]);
  });

  it("nunca corta una sección a la mitad cuando cada sección cabe sola: los cortes caen justo en el top de una sección", () => {
    const secciones: SeccionMedida[] = [
      { top: 0, bottom: 100 },
      { top: 100, bottom: 200 },
      { top: 200, bottom: 300 },
      { top: 300, bottom: 350 },
    ];
    const cortes = calcularCortesDePagina(secciones, 150);
    expect(cortes.length).toBeGreaterThan(0);
    const tops = secciones.map((s) => s.top);
    for (const corte of cortes) {
      expect(tops).toContain(corte);
    }
    expect(calcularTotalPaginas(secciones, 150)).toBe(cortes.length + 1);
  });

  it("REGRESIÓN: una sección más alta que una página (ej. una tabla de ítems larga) se reparte en varias páginas — antes se perdía contenido en silencio", () => {
    // Reproduce el bug real encontrado generando un PDF de verdad con 45
    // ítems sintéticos: la tabla de ítems sola medía ~500mm (más de una
    // página de 260mm de alto útil). La versión anterior de este algoritmo
    // (calcularSaltosDePagina, basada en índices de sección) dejaba esa
    // sección completa "flotando" y, al dibujarla, el tramo que no cabía en
    // el alto físico de la página simplemente no aparecía en ninguna
    // página — ni en esa ni en la siguiente. Ver también la nota en
    // descargarPdf (comercial.proformas.$id.tsx).
    const secciones: SeccionMedida[] = [
      { top: 0, bottom: 40 }, // encabezado
      { top: 40, bottom: 90 }, // cliente
      { top: 90, bottom: 120 }, // condiciones comerciales
      { top: 120, bottom: 620 }, // tabla de ítems — 500mm, más que una página
      { top: 620, bottom: 650 }, // totales
      { top: 650, bottom: 680 }, // retenciones
      { top: 680, bottom: 700 }, // observaciones
      { top: 700, bottom: 750 }, // firmas + pie
    ];
    const altoPagina = 260;
    const cortes = calcularCortesDePagina(secciones, altoPagina);
    const tramos = tramosDePagina(secciones, cortes);

    // Propiedad crítica: la unión de los tramos cubre TODO el documento,
    // sin huecos (nada de contenido perdido) y sin solapes.
    expect(tramos[0].inicio).toBe(0);
    expect(tramos[tramos.length - 1].fin).toBe(750);
    for (let i = 0; i < tramos.length - 1; i++) {
      expect(tramos[i].fin).toBe(tramos[i + 1].inicio); // sin huecos ni solapes
    }

    // Ningún tramo puede ser más alto que una página física.
    for (const tramo of tramos) {
      expect(tramo.fin - tramo.inicio).toBeLessThanOrEqual(altoPagina + 1e-9);
    }

    // 3 páginas: [0-260) cabecera+cliente+condiciones+primer tramo de la
    // tabla, [260-520) segundo tramo completo de la tabla, [520-750) resto
    // de la tabla + totales/retenciones/observaciones/firmas/pie.
    expect(tramos.length).toBe(3);
    expect(calcularTotalPaginas(secciones, altoPagina)).toBe(tramos.length);
  });

  it("una sola sección más alta que una página se reparte en tantas páginas como haga falta (antes se dejaba entera, ahora nunca pierde contenido)", () => {
    const secciones: SeccionMedida[] = [{ top: 0, bottom: 500 }];
    // 500 / 260 → necesita 2 páginas, no 1.
    expect(calcularTotalPaginas(secciones, 260)).toBe(2);
    const cortes = calcularCortesDePagina(secciones, 260);
    expect(cortes).toEqual([260]);
  });

  it("varias secciones que exceden claramente una página producen más de una página", () => {
    const secciones: SeccionMedida[] = Array.from({ length: 20 }, (_, i) => ({
      top: i * 30,
      bottom: i * 30 + 30,
    }));
    const total = calcularTotalPaginas(secciones, 260);
    expect(total).toBeGreaterThan(1);
    expect(total).toBeLessThanOrEqual(20);
  });

  it("secciones vacías da 1 página por defecto (nunca 0 ni negativo)", () => {
    expect(calcularTotalPaginas([], 260)).toBe(1);
    expect(calcularCortesDePagina([], 260)).toEqual([]);
  });
});

/** Extensión del formato de proforma de Ricol a Flexipack/Green Solutions
 * (mismo tenant real que usa la app — ver Tenant en la BD de desarrollo):
 * Ricol conserva exactamente su encabezado actual, Flexipack y Green
 * obtienen su propia razón social/NIT reales (nunca inventados, nunca
 * prestados de otra empresa), y un tenant que no es ninguna de las 3
 * nunca hereda por accidente el encabezado de Ricol. */
describe("resolverEncabezadoCorporativoProforma", () => {
  it("Ricol: conserva el encabezado completo y exacto que el documento siempre mostró", () => {
    const encabezado = resolverEncabezadoCorporativoProforma(
      "Representaciones Industriales de Colombia RICOL S.A.S.",
    );
    expect(encabezado.razonSocial).toBe("Representaciones Industriales de Colombia RICOL S.A.S.");
    expect(encabezado.nit).toBe("805.006.906-5");
    expect(encabezado.regimenFiscal).toBe("IVA Régimen Común · No Gran Contribuyente");
    expect(encabezado.sedes).toHaveLength(3);
    expect(encabezado.sedes?.[0]).toEqual({
      etiqueta: "Principal (Yumbo)",
      texto: "CL 15 N° 27A-176 BL 9 BG 4 Acopi · PBX (57-2) 695 4565",
    });
    expect(encabezado.web).toBe("www.ricol.com.co");
    expect(encabezado.correo).toBe("servicioalcliente@ricol.com.co");
    expect(encabezado.actividadesIca).toContain("ICA 7.7x1000 Cali");
  });

  it("Flexipack: usa su propia razón social y NIT reales (EMPRESAS), sin datos de Ricol", () => {
    const encabezado = resolverEncabezadoCorporativoProforma("Flexipack de Colombia S.A.S");
    expect(encabezado.razonSocial).toBe("FLEXIPACK DE COLOMBIA S.A.S");
    expect(encabezado.nit).toBe("900215771");
    // Sin datos inventados: RicoSoft no tiene dirección/teléfono/correo/
    // régimen fiscal/ICA de Flexipack en ninguna fuente todavía.
    expect(encabezado.regimenFiscal).toBeUndefined();
    expect(encabezado.sedes).toBeUndefined();
    expect(encabezado.web).toBeUndefined();
    expect(encabezado.correo).toBeUndefined();
    expect(encabezado.actividadesIca).toBeUndefined();
    // Nunca contaminado con el texto de Ricol.
    expect(encabezado.razonSocial).not.toContain("RICOL");
    expect(encabezado.nit).not.toBe("805.006.906-5");
  });

  it("Green Solutions: usa su propia razón social y NIT reales (EMPRESAS), sin datos de Ricol ni Flexipack", () => {
    const encabezado = resolverEncabezadoCorporativoProforma("Green Solutions Colombia SAS BIC");
    expect(encabezado.razonSocial).toBe("GREEN SOLUTIONS COLOMBIA S.A.S BIC");
    expect(encabezado.nit).toBe("901411539");
    expect(encabezado.regimenFiscal).toBeUndefined();
    expect(encabezado.sedes).toBeUndefined();
    expect(encabezado.razonSocial).not.toContain("RICOL");
    expect(encabezado.razonSocial).not.toContain("FLEXIPACK");
    expect(encabezado.nit).not.toBe("900215771");
  });

  it("las 3 empresas producen razón social y NIT distintos entre sí (aislamiento, no un valor compartido)", () => {
    const ricol = resolverEncabezadoCorporativoProforma(
      "Representaciones Industriales de Colombia RICOL S.A.S.",
    );
    const flexipack = resolverEncabezadoCorporativoProforma("Flexipack de Colombia S.A.S");
    const green = resolverEncabezadoCorporativoProforma("Green Solutions Colombia SAS BIC");
    const nits = [ricol.nit, flexipack.nit, green.nit];
    expect(new Set(nits).size).toBe(3);
    const razonesSociales = [ricol.razonSocial, flexipack.razonSocial, green.razonSocial];
    expect(new Set(razonesSociales).size).toBe(3);
  });

  it("un tenant que no es Ricol/Flexipack/Green (demo, prueba) nunca cae al encabezado de Ricol", () => {
    const encabezado = resolverEncabezadoCorporativoProforma("Empresa Demo S.A.");
    expect(encabezado.razonSocial).toBe("Empresa Demo S.A.");
    expect(encabezado.nit).toBe("");
    expect(encabezado.regimenFiscal).toBeUndefined();
    expect(encabezado.sedes).toBeUndefined();
    expect(encabezado.razonSocial).not.toContain("RICOL");
  });

  it("tenant sin nombre (null/undefined) no revienta y tampoco muestra datos de Ricol", () => {
    expect(resolverEncabezadoCorporativoProforma(null).razonSocial).toBe("Empresa no identificada");
    expect(resolverEncabezadoCorporativoProforma(undefined).nit).toBe("");
  });
});

/** Campo "Paquetes" exclusivo de Green Solutions — cada paquete tiene
 * exactamente 32 plocks, y se suma 1% de desperdicio de construcción ANTES
 * de calcular paquetes completos (microaudit 2026-09-22 "desperdicio de
 * construcción"). Secuencia obligatoria: cantidad × 1.01 → CEIL(.../32) →
 * paquetes × 32. Casos obligatorios del encargo (1, 31, 32, 64, 1000, 1025,
 * 2000) más los casos de borde (0, negativo, decimal, NaN, Infinity). */
describe("calcularEmpaquePlocks", () => {
  it("1 plock -> 1.01 con desperdicio -> 1 paquete / 32 plocks documentados", () => {
    const r = calcularEmpaquePlocks(1);
    expect(r.cantidadSolicitada).toBe(1);
    expect(r.cantidadConDesperdicio).toBeCloseTo(1.01, 10);
    expect(r.paquetes).toBe(1);
    expect(r.cantidadDocumentada).toBe(32);
  });

  it("31 plocks -> 31.31 con desperdicio -> 1 paquete / 32 plocks documentados", () => {
    const r = calcularEmpaquePlocks(31);
    expect(r.cantidadConDesperdicio).toBeCloseTo(31.31, 10);
    expect(r.paquetes).toBe(1);
    expect(r.cantidadDocumentada).toBe(32);
  });

  it("32 plocks -> 32.32 con desperdicio -> 2 paquetes / 64 plocks documentados (el desperdicio empuja a un paquete más, aunque 32 sea exactamente divisible)", () => {
    const r = calcularEmpaquePlocks(32);
    expect(r.cantidadConDesperdicio).toBeCloseTo(32.32, 10);
    expect(r.paquetes).toBe(2);
    expect(r.cantidadDocumentada).toBe(64);
  });

  it("64 plocks -> 64.64 con desperdicio -> 3 paquetes / 96 plocks documentados", () => {
    const r = calcularEmpaquePlocks(64);
    expect(r.cantidadConDesperdicio).toBeCloseTo(64.64, 10);
    expect(r.paquetes).toBe(3);
    expect(r.cantidadDocumentada).toBe(96);
  });

  it("1000 plocks -> 1010 con desperdicio -> 32 paquetes / 1024 plocks documentados", () => {
    const r = calcularEmpaquePlocks(1000);
    expect(r.cantidadConDesperdicio).toBe(1010);
    expect(r.paquetes).toBe(32);
    expect(r.cantidadDocumentada).toBe(1024);
  });

  it("1025 plocks -> 1035.25 con desperdicio -> 33 paquetes / 1056 plocks documentados", () => {
    const r = calcularEmpaquePlocks(1025);
    expect(r.cantidadConDesperdicio).toBeCloseTo(1035.25, 10);
    expect(r.paquetes).toBe(33);
    expect(r.cantidadDocumentada).toBe(1056);
  });

  it("2000 plocks -> 2020 con desperdicio -> 64 paquetes / 2048 plocks documentados", () => {
    const r = calcularEmpaquePlocks(2000);
    expect(r.cantidadConDesperdicio).toBe(2020);
    expect(r.paquetes).toBe(64);
    expect(r.cantidadDocumentada).toBe(2048);
  });

  it("el desperdicio se aplica ANTES de redondear a paquetes, nunca después (secuencia obligatoria)", () => {
    // Si se calcularan paquetes primero (CEIL(1000/32)=32 -> 1024) y LUEGO
    // se le sumara el 1% a la cantidad ya redondeada, el resultado sería
    // distinto (y estaría mal). La secuencia correcta da 1024 igual en este
    // caso puntual, pero el de 32 plocks (arriba) es el que demuestra la
    // diferencia real: con la secuencia incorrecta dnría 1 paquete/32, con
    // la correcta da 2 paquetes/64.
    const conSecuenciaCorrecta = calcularEmpaquePlocks(32);
    expect(conSecuenciaCorrecta.paquetes).not.toBe(Math.ceil(32 / 32)); // no se queda en el paquete "sin desperdicio"
  });

  it("nunca produce paquetes decimales: siempre un entero, incluso con cantidades decimales de entrada", () => {
    const { paquetes, cantidadDocumentada } = calcularEmpaquePlocks(1000.5);
    expect(Number.isInteger(paquetes)).toBe(true);
    expect(Number.isInteger(cantidadDocumentada)).toBe(true);
  });

  it("cantidad = 0 -> todo en 0 (nunca negativo, nunca NaN)", () => {
    expect(calcularEmpaquePlocks(0)).toEqual({
      cantidadSolicitada: 0,
      cantidadConDesperdicio: 0,
      paquetes: 0,
      cantidadDocumentada: 0,
    });
  });

  it("cantidad negativa -> nunca paquetes negativos, cae a 0", () => {
    const { paquetes, cantidadDocumentada } = calcularEmpaquePlocks(-5);
    expect(paquetes).toBe(0);
    expect(cantidadDocumentada).toBe(0);
    expect(paquetes).toBeGreaterThanOrEqual(0);
  });

  it("un valor inválido (NaN) no genera un cálculo incorrecto: nunca propaga NaN/Infinity", () => {
    const r = calcularEmpaquePlocks(NaN);
    expect(Number.isNaN(r.paquetes)).toBe(false);
    expect(Number.isNaN(r.cantidadDocumentada)).toBe(false);
    expect(Number.isNaN(r.cantidadConDesperdicio)).toBe(false);
    expect(r.paquetes).toBe(0);
    expect(r.cantidadDocumentada).toBe(0);
  });

  it("Infinity no se propaga al resultado", () => {
    const { paquetes, cantidadDocumentada, cantidadConDesperdicio } =
      calcularEmpaquePlocks(Infinity);
    expect(Number.isFinite(paquetes)).toBe(true);
    expect(Number.isFinite(cantidadDocumentada)).toBe(true);
    expect(Number.isFinite(cantidadConDesperdicio)).toBe(true);
  });

  it("cantidad documentada siempre es múltiplo de 32, para cualquier entrada válida", () => {
    for (const v of [1, 5, 17, 31, 32, 33, 63, 64, 65, 100, 500, 1000, 1025, 2000, 9999]) {
      const { cantidadDocumentada } = calcularEmpaquePlocks(v);
      expect(cantidadDocumentada % 32).toBe(0);
    }
  });
});

/** Cálculos económicos de Green Solutions (subtotal/IVA/totales) — deben
 * usar `cantidadDocumentada`, NUNCA la cantidad solicitada original ni la
 * intermedia con desperdicio sin redondear. Reutiliza
 * calcularTotalesProformaPreview (el mismo cálculo ya usado por el diálogo
 * de creación de la proforma) exactamente como lo hace el componente de
 * impresión — ninguna fórmula de descuento/IVA/retención nueva. */
describe("cálculos económicos de Green con cantidadDocumentada (comercial.proformas.$id.tsx)", () => {
  const encabezadoSinRetenciones = {
    aplicaRetencion: false,
    retencionPct: 0,
    aplicaRetencionIva: false,
    retencionIvaPct: 0,
    aplicaIca: false,
    icaPct: 0,
  };

  it("1000 plocks solicitados a $100/plock -> el subtotal usa 1024 (documentada), no 1000 ni 1010", () => {
    const cantidadSolicitada = 1000;
    const precioUnitario = 100;
    const { cantidadConDesperdicio, cantidadDocumentada } =
      calcularEmpaquePlocks(cantidadSolicitada);
    expect(cantidadDocumentada).toBe(1024);

    const totalesConDocumentada = calcularTotalesProformaPreview(
      [{ cantidad: cantidadDocumentada, precioUnitario, descuentoPct: 0, ivaPct: 0 }],
      encabezadoSinRetenciones,
    );
    const totalesConSolicitada = calcularTotalesProformaPreview(
      [{ cantidad: cantidadSolicitada, precioUnitario, descuentoPct: 0, ivaPct: 0 }],
      encabezadoSinRetenciones,
    );
    const totalesConDesperdicioSinRedondear = calcularTotalesProformaPreview(
      [{ cantidad: cantidadConDesperdicio, precioUnitario, descuentoPct: 0, ivaPct: 0 }],
      encabezadoSinRetenciones,
    );

    // El subtotal correcto es 1024 × 100 = 102400 — ni 1000×100=100000 ni
    // 1010×100=101000.
    expect(totalesConDocumentada.subtotal).toBe(102400);
    expect(totalesConDocumentada.subtotal).not.toBe(totalesConSolicitada.subtotal);
    expect(totalesConDocumentada.subtotal).not.toBe(totalesConDesperdicioSinRedondear.subtotal);
  });

  it("el IVA y el total también reflejan la cantidad documentada, no la solicitada", () => {
    const { cantidadDocumentada } = calcularEmpaquePlocks(2000); // -> 2048
    const totales = calcularTotalesProformaPreview(
      [{ cantidad: cantidadDocumentada, precioUnitario: 50, descuentoPct: 0, ivaPct: 19 }],
      encabezadoSinRetenciones,
    );
    expect(totales.subtotal).toBe(2048 * 50);
    expect(totales.iva).toBeCloseTo(2048 * 50 * 0.19, 6);
    expect(totales.total).toBeCloseTo(totales.subtotal + totales.iva, 6);
  });
});

/** Exclusividad de Green Solutions: la columna "Paquetes" solo debe activarse
 * para el tenant de Green — nunca para Ricol/Flexipack ni por ningún otro
 * mecanismo (nombre de usuario, permiso, id hardcodeado). */
describe("esTenantGreenSolutions", () => {
  it("Ricol -> false (no muestra Paquetes)", () => {
    expect(esTenantGreenSolutions("Representaciones Industriales de Colombia RICOL S.A.S.")).toBe(
      false,
    );
  });

  it("Flexipack -> false (no muestra Paquetes)", () => {
    expect(esTenantGreenSolutions("Flexipack de Colombia S.A.S")).toBe(false);
  });

  it("Green Solutions -> true (sí muestra Paquetes)", () => {
    expect(esTenantGreenSolutions("Green Solutions Colombia SAS BIC")).toBe(true);
  });

  it("tenant desconocido (demo/pruebas) -> false", () => {
    expect(esTenantGreenSolutions("Empresa Demo S.A.")).toBe(false);
  });

  it("sin nombre de tenant (null/undefined) -> false, nunca revienta", () => {
    expect(esTenantGreenSolutions(null)).toBe(false);
    expect(esTenantGreenSolutions(undefined)).toBe(false);
  });
});
