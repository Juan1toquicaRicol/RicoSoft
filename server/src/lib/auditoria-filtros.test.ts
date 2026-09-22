import { describe, it, expect } from "vitest";
import {
  MODULOS_AUDITORIA,
  construirWhereAuditoria,
  derivarModulo,
  derivarResultado,
  validarFiltroAuditoria,
} from "./auditoria-filtros";

const TENANT = "aaaaaaaa-0000-4000-8000-000000000001";

describe("derivarModulo / derivarResultado", () => {
  it("clasifica las acciones reales que escribe el sistema", () => {
    const casos: Record<string, string> = {
      LOGIN_FALLIDO: "AUTENTICACION",
      PASSWORD_CAMBIADA: "AUTENTICACION",
      USUARIO_ROL_CAMBIADO: "SEGURIDAD",
      PERMISO_EDITADO: "SEGURIDAD",
      PERMISO_LABORAL_SOLICITADO: "GESTION_HUMANA",
      CATALOGO_VALOR_CREADO: "CATALOGOS",
      PUBLICACION_ARCHIVOS_ADJUNTADOS: "PUBLICACIONES",
      PROFORMA_ANULADA: "COMERCIAL",
      SOLICITUD_COMPRA_CREADA: "COMPRAS",
      PAGO_REGISTRADO: "FACTURACION",
      IMPORTACION_CORREO_REPROCESADO: "IMPORTACIONES",
      NOVEDAD_REGISTRADA: "LOGISTICA",
      PARAMETROS_NEGOCIO_ACTUALIZADOS: "INVENTARIO",
      SINCRONIZACION_SIESA_INICIADA: "INTEGRACIONES",
      AUDITORIA_EXPORTADA: "AUDITORIA",
      ALGO_NUEVO_QUE_NADIE_CLASIFICO: "OTROS",
    };
    for (const [accion, modulo] of Object.entries(casos)) {
      expect(derivarModulo(accion).clave, accion).toBe(modulo);
    }
  });

  it("PERMISO_LABORAL_* (RR. HH.) no se confunde con PERMISO_* de seguridad", () => {
    expect(derivarModulo("PERMISO_LABORAL_ACTUALIZADO").clave).toBe("GESTION_HUMANA");
    expect(derivarModulo("PERMISO_CREADO").clave).toBe("SEGURIDAD");
  });

  it("el resultado es FALLIDO solo para acciones que registran un fallo", () => {
    expect(derivarResultado("LOGIN_FALLIDO")).toBe("FALLIDO");
    expect(derivarResultado("ERROR")).toBe("FALLIDO");
    expect(derivarResultado("SINCRONIZACION_ERROR_PARCIAL")).toBe("FALLIDO");
    expect(derivarResultado("PROFORMA_CREADA")).toBe("EXITOSO");
    // "RECHAZADA" es un estado de negocio, no un fallo del sistema.
    expect(derivarResultado("SOLICITUD_RECHAZADA")).toBe("EXITOSO");
  });

  it("ningún prefijo se repite entre módulos (una acción cae en uno solo)", () => {
    const vistos = new Map<string, string>();
    for (const m of MODULOS_AUDITORIA) {
      for (const p of m.prefijos) {
        expect(vistos.has(p), `${p} en ${m.clave} y ${vistos.get(p)}`).toBe(false);
        vistos.set(p, m.clave);
      }
    }
  });
});

describe("validarFiltroAuditoria", () => {
  it("acepta filtros vacíos y rangos válidos", () => {
    expect(validarFiltroAuditoria({})).toBeNull();
    expect(validarFiltroAuditoria({ desde: "2026-09-01", hasta: "2026-09-30" })).toBeNull();
    expect(validarFiltroAuditoria({ modulo: "OTROS" })).toBeNull();
    expect(validarFiltroAuditoria({ modulo: "COMERCIAL" })).toBeNull();
  });

  it("rechaza fechas mal formadas, rango invertido y módulo desconocido", () => {
    expect(validarFiltroAuditoria({ desde: "01/09/2026" })).toMatch(/desde/);
    expect(validarFiltroAuditoria({ hasta: "2026-13-45" })).toMatch(/hasta/);
    expect(validarFiltroAuditoria({ desde: "2026-09-30", hasta: "2026-09-01" })).toMatch(
      /posterior/,
    );
    expect(validarFiltroAuditoria({ modulo: "INEXISTENTE" })).toMatch(/modulo/);
  });
});

describe("construirWhereAuditoria — aislamiento por tenant", () => {
  const condiciones = (where: ReturnType<typeof construirWhereAuditoria>) =>
    where.AND as Record<string, unknown>[];

  it("el tenant de la sesión es SIEMPRE la primera condición, con cualquier combinación de filtros", () => {
    const filtros = [
      {},
      { desde: "2026-09-01" },
      { modulo: "COMERCIAL", accion: "CREADA", usuarioId: "u1" },
      { modulo: "OTROS" },
      { entidadTipo: "Factura", entidadId: "f1" },
    ];
    for (const f of filtros) {
      expect(condiciones(construirWhereAuditoria(TENANT, f))[0]).toEqual({ tenantId: TENANT });
    }
  });

  it("un filtro no puede sobrescribir el tenant (no existe un campo tenantId en el filtro)", () => {
    const where = construirWhereAuditoria(TENANT, {
      accion: "x",
      // @ts-expect-error — aunque alguien lo intente colar, no forma parte del contrato
      tenantId: "otro-tenant",
    });
    expect(JSON.stringify(where)).not.toContain("otro-tenant");
  });

  it("aplica rango de fechas inclusivo en UTC", () => {
    const c = condiciones(
      construirWhereAuditoria(TENANT, { desde: "2026-09-01", hasta: "2026-09-30" }),
    );
    expect(c).toContainEqual({ createdAt: { gte: new Date("2026-09-01T00:00:00.000Z") } });
    expect(c).toContainEqual({ createdAt: { lte: new Date("2026-09-30T23:59:59.999Z") } });
  });

  it("desde y hasta conviven (AND explícito: ninguna condición pisa a la otra)", () => {
    const c = condiciones(
      construirWhereAuditoria(TENANT, {
        desde: "2026-09-01",
        hasta: "2026-09-30",
        accion: "CREAD",
      }),
    );
    expect(c).toHaveLength(4); // tenant + gte + lte + accion
  });

  it("el módulo se traduce a prefijos de acción; OTROS excluye todos los prefijos conocidos", () => {
    const comercial = JSON.stringify(construirWhereAuditoria(TENANT, { modulo: "COMERCIAL" }));
    expect(comercial).toContain('"startsWith":"PROFORMA_"');
    expect(comercial).not.toContain('"startsWith":"FACTURA_"');

    const otros = construirWhereAuditoria(TENANT, { modulo: "OTROS" });
    const cond = condiciones(otros).at(-1) as { NOT: { OR: unknown[] } };
    expect(cond.NOT.OR).toHaveLength(MODULOS_AUDITORIA.flatMap((m) => m.prefijos).length);
  });
});
