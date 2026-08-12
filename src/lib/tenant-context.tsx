import React, { createContext, useContext, useEffect, useState } from "react";

export interface Empresa {
  id: string;
  nombre: string;
  nit: string;
  sigla: string;
}

export const EMPRESAS: Empresa[] = [
  { id: "001", nombre: "REPRESENTACION INDUSTRIALES DE COLOMBIA S.A.S", nit: "8050069065", sigla: "RC" },
  { id: "002", nombre: "FLEXIPACK DE COLOMBIA S.A.S", nit: "900215771", sigla: "FL" },
  { id: "003", nombre: "GREEN SOLUTIONS COLOMBIA S.A.S BIC", nit: "901411539", sigla: "GR" },
];

interface TenantContextType {
  empresaActiva: string; // '001' | '002' | '003' | 'ALL'
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
    <TenantContext.Provider value={{ empresaActiva, setEmpresaActiva, empresas: EMPRESAS, empresaActualObj }}>
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
