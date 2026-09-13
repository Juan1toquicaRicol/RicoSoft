import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useConfiguracionInventario, type ConfiguracionInventario } from "@/hooks/use-inventario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/configuracion/negocio")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR),
  component: ConfiguracionNegocioPage,
});

type Valores = Required<ConfiguracionInventario>;

const VALORES_INICIALES: Valores = {
  diasVendible: 30,
  diasExceso: 90,
  diasRupturaCobertura: 5,
  diasSobreCobertura: 60,
  coberturaObjetivoDias: 30,
  factorSeguridad: 1,
  umbralVariabilidadAltaDemanda: 0.5,
  umbralPerdidaRotacionDemanda: 0.3,
  umbralTendenciaFuertePctDemanda: 20,
  umbralAlertaTrmPct: 5,
  plazoCreditoDiasDefecto: 30,
  minimoCotizacionesSolicitud: 3,
};

interface CampoNumerico {
  campo: keyof Valores;
  etiqueta: string;
  ayuda: string;
  min: number;
  max?: number;
  step?: number;
}

const CAMPOS_ORIGINALES: CampoNumerico[] = [
  {
    campo: "diasVendible",
    etiqueta: "Días vendible",
    ayuda: "Antigüedad máxima (días) para considerar un ítem como vendible normalmente.",
    min: 1,
    max: 3650,
  },
  {
    campo: "diasExceso",
    etiqueta: "Días de exceso",
    ayuda:
      "Antigüedad (días) a partir de la cual el inventario se considera en exceso/obsolescencia.",
    min: 1,
    max: 3650,
  },
  {
    campo: "diasRupturaCobertura",
    etiqueta: "Días de ruptura de cobertura",
    ayuda: "Cobertura mínima (días) antes de alertar riesgo de ruptura de stock.",
    min: 1,
    max: 3650,
  },
  {
    campo: "diasSobreCobertura",
    etiqueta: "Días de sobre-cobertura",
    ayuda: "Cobertura (días) a partir de la cual se considera sobre-stock.",
    min: 1,
    max: 3650,
  },
  {
    campo: "coberturaObjetivoDias",
    etiqueta: "Cobertura objetivo (días)",
    ayuda: "Días de cobertura deseados para el cálculo de inventario objetivo.",
    min: 1,
    max: 3650,
  },
  {
    campo: "factorSeguridad",
    etiqueta: "Factor de seguridad",
    ayuda: "Multiplicador sobre el inventario objetivo (1 = sin colchón extra).",
    min: 1,
    max: 5,
    step: 0.1,
  },
];

const CAMPOS_NUEVOS: CampoNumerico[] = [
  {
    campo: "umbralVariabilidadAltaDemanda",
    etiqueta: "Umbral de variabilidad alta de demanda",
    ayuda:
      "Coeficiente de variación a partir del cual la demanda de un ítem se considera muy variable.",
    min: 0,
  },
  {
    campo: "umbralPerdidaRotacionDemanda",
    etiqueta: "Umbral de pérdida de rotación",
    ayuda: "Proporción (0 a 1) de caída de rotación considerada relevante.",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    campo: "umbralTendenciaFuertePctDemanda",
    etiqueta: "Umbral de tendencia fuerte (%)",
    ayuda: "Porcentaje de cambio de demanda considerado una tendencia fuerte.",
    min: 0,
  },
  {
    campo: "umbralAlertaTrmPct",
    etiqueta: "Umbral de alerta de TRM (%)",
    ayuda: "Variación porcentual de la TRM que dispara una alerta.",
    min: 0,
  },
  {
    campo: "plazoCreditoDiasDefecto",
    etiqueta: "Plazo de crédito por defecto (días)",
    ayuda: "Plazo de crédito asumido cuando un cliente/proveedor no tiene uno configurado.",
    min: 1,
  },
  {
    campo: "minimoCotizacionesSolicitud",
    etiqueta: "Mínimo de cotizaciones por solicitud",
    ayuda: "Cantidad mínima de cotizaciones exigidas antes de aprobar una solicitud de compra.",
    min: 1,
  },
];

function ConfiguracionNegocioPage() {
  const { configuracion, loading, error, guardar } = useConfiguracionInventario();
  const [valores, setValores] = useState<Valores>(VALORES_INICIALES);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!configuracion) return;
    setValores({ ...VALORES_INICIALES, ...configuracion });
  }, [configuracion]);

  const actualizarCampo = (campo: keyof Valores, valor: number) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (valores.diasVendible >= valores.diasExceso) {
      toast.error("Días vendible debe ser menor que días de exceso.");
      return;
    }
    setGuardando(true);
    try {
      await guardar(valores);
      toast.success("Configuración de negocio actualizada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar la configuración.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <SlidersHorizontal className="h-6 w-6 text-blue-600" />
          Configuración de negocio
        </h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Umbrales de negocio usados por Inventario, Producción, Planeación y Gerencia para calcular
          riesgo, cobertura y alertas. Cambiarlos afecta lo que el sistema clasifica como normal, en
          riesgo o en exceso para toda la empresa.
        </p>
      </div>

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <form
        onSubmit={handleGuardar}
        className="space-y-6 bg-white p-6 rounded-lg border border-slate-200 shadow-2xs"
      >
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-700 mb-1">
            Umbrales originales (cobertura e inventario objetivo)
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CAMPOS_ORIGINALES.map((campo) => (
              <CampoUmbral
                key={campo.campo}
                campo={campo}
                valor={valores[campo.campo] ?? 0}
                disabled={loading}
                onChange={(v) => actualizarCampo(campo.campo, v)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-4 pt-2 border-t border-slate-100">
          <legend className="text-sm font-semibold text-slate-700 mb-1 pt-4">
            Umbrales adicionales
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CAMPOS_NUEVOS.map((campo) => (
              <CampoUmbral
                key={campo.campo}
                campo={campo}
                valor={valores[campo.campo] ?? 0}
                disabled={loading}
                onChange={(v) => actualizarCampo(campo.campo, v)}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="success" disabled={guardando || loading}>
            {guardando ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CampoUmbral({
  campo,
  valor,
  disabled,
  onChange,
}: {
  campo: CampoNumerico;
  valor: number;
  disabled: boolean;
  onChange: (valor: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700">{campo.etiqueta}</label>
      <Input
        type="number"
        required
        min={campo.min}
        max={campo.max}
        step={campo.step ?? 1}
        value={valor}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="text-xs text-slate-500">{campo.ayuda}</p>
    </div>
  );
}
