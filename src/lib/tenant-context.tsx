import React, { createContext, useContext, useEffect, useState } from "react";

export interface Empresa {
  id: string;
  nombre: string;
  nit: string;
  sigla: string;
}

export const EMPRESAS: Empresa[] = [
  {
    id: "RC",
    nombre: "REPRESENTACION INDUSTRIALES DE COLOMBIA S.A.S",
    nit: "8050069065",
    sigla: "RICOL",
  },
  { id: "FL", nombre: "FLEXIPACK DE COLOMBIA S.A.S", nit: "900215771", sigla: "FLEXIPACK" },
  { id: "GR", nombre: "GREEN SOLUTIONS COLOMBIA S.A.S BIC", nit: "901411539", sigla: "GREEN" },
];

/**
 * Abreviatura legible de una empresa (RICOL/FLEXIPACK/GREEN) a partir de su
 * empresaId técnico (RC/FL/GR) — para mostrar en cualquier lugar donde hoy
 * se mostraba el id crudo (badges, campos "Empresa ID"). Si el id no
 * coincide con ninguna empresa conocida, se muestra tal cual en vez de
 * ocultar el dato.
 */
export function siglaEmpresa(empresaId: string): string {
  return EMPRESAS.find((e) => e.id === empresaId)?.sigla || empresaId;
}

/**
 * A qué empresa (RC/FL/GR) corresponde el TENANT actual, a partir de su
 * nombre real (ej. "REPRESENTACION INDUSTRIALES DE COLOMBIA RICOL S.A.S").
 * En este despliegue cada tenant es una de las 3 empresas del grupo — esto
 * es lo que de verdad determina "en qué empresa estoy" para el usuario
 * (empresaActiva, más abajo, es un filtro de solo-lectura aparte que nunca
 * se activa desde ningún control de la UI). Devuelve null si el nombre del
 * tenant no coincide con ninguna empresa conocida (útil como señal para no
 * autocompletar y dejar elegir manualmente).
 */
export function empresaIdDeTenant(tenantNombre: string | undefined | null): string | null {
  if (!tenantNombre) return null;
  const nombreEnMayus = tenantNombre.toUpperCase();
  return EMPRESAS.find((e) => nombreEnMayus.includes(e.sigla))?.id ?? null;
}

/**
 * Abreviatura corta del tenant actual (RICOL/FLEXIPACK/GREEN) para mostrar
 * en vez de la razón social completa (ej. "Estás en RICOL" en vez de
 * "Estás en: Representación Industriales de Colombia RICOL S.A.S."). Si el
 * nombre no coincide con ninguna empresa conocida, se muestra tal cual.
 */
export function abreviarNombreTenant(tenantNombre: string): string {
  const id = empresaIdDeTenant(tenantNombre);
  return id ? siglaEmpresa(id) : tenantNombre;
}

interface TenantContextType {
  empresaActiva: string; // 'RC' | 'FL' | 'GR' | 'ALL'
  setEmpresaActiva: (id: string) => void;
  empresas: Empresa[];
  empresaActualObj: Empresa | undefined;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [empresaActiva, setEmpresaActivaState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ricosoft_empresa_activa") || "ALL";
    }
    return "ALL";
  });

  const setEmpresaActiva = (id: string) => {
    setEmpresaActivaState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("ricosoft_empresa_activa", id);
    }
  };

  const empresaActualObj = EMPRESAS.find((e) => e.id === empresaActiva);

  return (
    <TenantContext.Provider
      value={{ empresaActiva, setEmpresaActiva, empresas: EMPRESAS, empresaActualObj }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant debe ser utilizado dentro de un TenantProvider");
  }
  return context;
}
