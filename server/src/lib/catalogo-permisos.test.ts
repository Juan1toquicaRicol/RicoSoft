import { describe, it, expect } from "vitest";
import { PERMISOS_SISTEMA, PERMISOS_LEGACY } from "./permissions";
import {
  CATALOGO_MODULOS,
  DEPENDENCIAS_PERMISO,
  codigosDeclarados,
  construirDependencias,
  listarPermisosResueltos,
  moduloPermiso,
  nombrePermiso,
  permisoClaveDeModulo,
  resolverPermiso,
} from "./catalogo-permisos";

/**
 * Lo que convierte la jerarquía en una fuente única REAL y no en una segunda
 * lista que se desincroniza: si alguien agrega un permiso a PERMISOS_SISTEMA
 * sin ubicarlo en una sección, o declara una sección cuyo prefijo ya no
 * existe, estos tests fallan.
 */
describe("Catálogo jerárquico Módulo → Sección → Permisos", () => {
  const vigentes = Object.values(PERMISOS_SISTEMA).filter((c) => !(c in PERMISOS_LEGACY));

  it("cubre exactamente los códigos vigentes: ninguno sin sección", () => {
    const declarados = new Set(codigosDeclarados());
    const sinSeccion = vigentes.filter((c) => !declarados.has(c));
    expect(sinSeccion).toEqual([]);
  });

  it("no declara códigos que no existan en PERMISOS_SISTEMA", () => {
    const vigentesSet = new Set<string>(vigentes);
    const inexistentes = codigosDeclarados().filter((c) => !vigentesSet.has(c));
    expect(inexistentes).toEqual([]);
  });

  it("cada código pertenece a una sola sección", () => {
    const resueltos = listarPermisosResueltos();
    expect(new Set(resueltos.map((p) => p.codigo)).size).toBe(resueltos.length);
  });

  it("no hay claves de módulo ni de sección duplicadas", () => {
    const modulos = CATALOGO_MODULOS.map((m) => m.clave);
    expect(new Set(modulos).size).toBe(modulos.length);
    const secciones = CATALOGO_MODULOS.flatMap((m) => m.secciones.map((s) => s.clave));
    expect(new Set(secciones).size).toBe(secciones.length);
  });

  it("toda sección declarada reclama al menos un código (no hay secciones muertas)", () => {
    const porSeccion = new Map<string, number>();
    for (const p of listarPermisosResueltos()) {
      porSeccion.set(p.seccionClave, (porSeccion.get(p.seccionClave) ?? 0) + 1);
    }
    const vacias = CATALOGO_MODULOS.flatMap((m) => m.secciones)
      .map((s) => s.clave)
      .filter((clave) => !porSeccion.has(clave));
    expect(vacias).toEqual([]);
  });

  it("clasifica por sufijo: ver / gestionar / especial", () => {
    expect(resolverPermiso(PERMISOS_SISTEMA.COTIZACIONES_VER)?.tipo).toBe("ver");
    expect(resolverPermiso(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR)?.tipo).toBe("gestionar");
    expect(resolverPermiso(PERMISOS_SISTEMA.COTIZACIONES_APROBAR)?.tipo).toBe("especial");
  });

  it("separa las secciones que comparten prefijo (Importaciones)", () => {
    expect(resolverPermiso(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_VER)?.seccionClave).toBe(
      "importaciones_requisitos",
    );
    expect(resolverPermiso(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER)?.seccionClave).toBe(
      "importaciones_correos",
    );
    expect(resolverPermiso(PERMISOS_SISTEMA.IMPORTACIONES_VER)?.seccionClave).toBe("importaciones");
    expect(resolverPermiso(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR)?.seccionClave).toBe(
      "importaciones",
    );
  });

  it("las dependencias que usa el middleware son exactamente las derivadas", () => {
    expect(DEPENDENCIAS_PERMISO).toEqual(construirDependencias());
  });

  it("solo las secciones marcadas exigeVer generan dependencias", () => {
    const derivadas = construirDependencias();
    // Comercial migrado: gestionar y especiales dependen de ver.
    expect(derivadas[PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR]).toBe(
      PERMISOS_SISTEMA.COTIZACIONES_VER,
    );
    expect(derivadas[PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_CONFIRMAR]).toBe(
      PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER,
    );
    // Módulos aún no migrados: sin cambio de comportamiento.
    expect(derivadas[PERMISOS_SISTEMA.FACTURAS_CREAR]).toBeUndefined();
    expect(derivadas[PERMISOS_SISTEMA.SOLICITUDES_APROBAR]).toBeUndefined();
    // Un VER nunca depende de nada.
    expect(derivadas[PERMISOS_SISTEMA.COTIZACIONES_VER]).toBeUndefined();
  });

  it("genera nombres legibles, sin guiones bajos crudos", () => {
    expect(nombrePermiso(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER)).toBe(
      "Pedidos comerciales · Ver",
    );
    expect(nombrePermiso(PERMISOS_SISTEMA.COTIZACIONES_APROBAR)).toBe("Cotizaciones · Aprobar");
    expect(nombrePermiso(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_CREAR)).toBe(
      "Requisitos de proveedor · Requisitos Crear",
    );
    for (const codigo of vigentes) {
      expect(nombrePermiso(codigo)).not.toMatch(/_/);
    }
  });

  it("agrupa por módulo de negocio, no por prefijo del código", () => {
    expect(moduloPermiso(PERMISOS_SISTEMA.COTIZACIONES_VER)).toBe("Comercial");
    expect(moduloPermiso(PERMISOS_SISTEMA.PROFORMAS_VER)).toBe("Comercial");
    expect(moduloPermiso(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER)).toBe("Comercial");
    expect(moduloPermiso(PERMISOS_SISTEMA.VENTAS_VER)).toBe("Comercial");
    expect(moduloPermiso(PERMISOS_SISTEMA.EMPLEADOS_VER)).toBe("Gestión Humana");
    expect(moduloPermiso(PERMISOS_SISTEMA.BIOMETRICO_VER)).toBe("Gestión Humana");
  });

  it("deriva el permiso de menú de un módulo como el OR de los VER de sus secciones", () => {
    const comercial = permisoClaveDeModulo("comercial");
    expect(comercial).toContain(PERMISOS_SISTEMA.COTIZACIONES_VER);
    expect(comercial).toContain(PERMISOS_SISTEMA.PROFORMAS_VER);
    expect(comercial).toContain(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER);
    expect(permisoClaveDeModulo("inexistente")).toBeNull();
  });
});
