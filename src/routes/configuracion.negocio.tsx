import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { SlidersHorizontal, Percent } from "lucide-react";
import { toast } from "sonner";

import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useConfiguracionInventario, type ConfiguracionInventario } from "@/hooks/use-inventario";
import { useConfiguracionComercial, type ConfiguracionComercial } from "@/hooks/use-proformas";
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
  // Parámetros de negocio — mismos defaults que
  // server/src/lib/parametros-negocio.ts (PARAMETROS_NEGOCIO_DEFECTO):
  // neutros, no activan ninguna restricción nueva solo por existir.
  margenMinimoVentaPct: 0,
  diasMaximosMora: 30,
  porcentajeMaximoUsoCupo: 100,
  toleranciaMermaPesajePct: 0.5,
  diasValidezOferta: 15,
  montoMinimoCotizaciones: 0,
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

/** Parámetros de negocio (solo se almacenan hoy — ver
 * server/src/lib/parametros-negocio.ts): agrupados conceptualmente por
 * Ventas / Crédito / Inventario-Logística / Compras, aunque técnicamente
 * viven en la misma ConfiguracionInventario que los umbrales de arriba. */
interface SeccionParametrosNegocio {
  titulo: string;
  campos: CampoNumerico[];
}

const SECCIONES_PARAMETROS_NEGOCIO: SeccionParametrosNegocio[] = [
  {
    titulo: "Ventas",
    campos: [
      {
        campo: "margenMinimoVentaPct",
        etiqueta: "Margen mínimo de venta (%)",
        ayuda:
          "Margen mínimo esperado en una venta. Solo se almacena: no bloquea ninguna venta todavía.",
        min: 0,
        max: 100,
        step: 0.01,
      },
      {
        campo: "diasValidezOferta",
        etiqueta: "Días de validez estándar de oferta",
        ayuda: "Días que una cotización/oferta se considera vigente por defecto.",
        min: 1,
        max: 365,
      },
    ],
  },
  {
    titulo: "Crédito",
    campos: [
      {
        campo: "diasMaximosMora",
        etiqueta: "Días máximos de mora",
        ayuda: "Días de mora tolerados a un cliente antes de considerarlo en riesgo.",
        min: 0,
        max: 3650,
      },
      {
        campo: "porcentajeMaximoUsoCupo",
        etiqueta: "% máximo de uso de cupo",
        ayuda: "Porcentaje del cupo de crédito que un cliente puede usar.",
        min: 1,
        max: 100,
        step: 0.01,
      },
    ],
  },
  {
    titulo: "Inventario / Logística",
    campos: [
      {
        campo: "toleranciaMermaPesajePct",
        etiqueta: "Tolerancia de merma de pesaje (%)",
        ayuda:
          "Diferencia de peso tolerada entre lo despachado y lo pesado, antes de marcarla como novedad.",
        min: 0,
        max: 20,
        step: 0.01,
      },
    ],
  },
  {
    titulo: "Compras",
    campos: [
      {
        campo: "montoMinimoCotizaciones",
        etiqueta: "Monto mínimo para exigir cotizaciones",
        ayuda:
          "Monto (moneda local) a partir del cual una solicitud de compra debe traer cotizaciones. 0 = sin monto mínimo.",
        min: 0,
        max: 1_000_000_000_000,
        step: 0.01,
      },
    ],
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

        <fieldset className="space-y-5 pt-2 border-t border-slate-100">
          <legend className="text-sm font-semibold text-slate-700 mb-1 pt-4">
            Parámetros de negocio
          </legend>
          <p className="text-xs text-slate-500 -mt-3">
            Se guardan como referencia central; hoy ninguna regla de Ventas, Crédito, Inventario o
            Compras los aplica automáticamente todavía.
          </p>
          {SECCIONES_PARAMETROS_NEGOCIO.map((seccion) => (
            <div key={seccion.titulo} className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {seccion.titulo}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {seccion.campos.map((campo) => (
                  <CampoUmbral
                    key={campo.campo}
                    campo={campo}
                    valor={valores[campo.campo] ?? 0}
                    disabled={loading}
                    onChange={(v) => actualizarCampo(campo.campo, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="success" disabled={guardando || loading}>
            {guardando ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </form>

      <ConfiguracionComercialSection />
    </div>
  );
}

/** Tasas de retención de Ventas/Proformas — modelo y endpoint propios
 * (ConfiguracionComercial), a propósito separados de ConfiguracionInventario
 * de arriba (dominio distinto). Cambiar esto solo afecta proformas NUEVAS:
 * cada proforma ya creada conserva el snapshot de porcentajes con el que se
 * generó (ver Proforma.retencionPct/retencionIvaPct/icaPct en el backend). */
function ConfiguracionComercialSection() {
  const { configuracion, loading, guardar } = useConfiguracionComercial();
  const [valores, setValores] = useState<ConfiguracionComercial>({
    retencionFuentePct: 2.5,
    retencionIvaPct: 15,
    retencionIcaPct: 0.7,
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (configuracion) setValores(configuracion);
  }, [configuracion]);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await guardar(valores);
      toast.success("Retenciones de Ventas actualizadas.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar las retenciones.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form
      onSubmit={handleGuardar}
      className="space-y-4 bg-white p-6 rounded-lg border border-slate-200 shadow-2xs"
    >
      <div>
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Percent className="h-4 w-4 text-blue-600" />
          Retenciones de Ventas (Proformas)
        </h2>
        <p className="text-xs text-slate-500 max-w-2xl mt-1">
          Porcentajes iniciales con los que se crea cada proforma nueva. Cambiarlos no afecta las
          proformas ya creadas: cada una conserva las tasas con las que se generó.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CampoPorcentaje
          etiqueta="Retención en la fuente"
          ayuda="ReteFuente = Total bruto × este %."
          valor={valores.retencionFuentePct}
          disabled={loading}
          onChange={(v) => setValores((prev) => ({ ...prev, retencionFuentePct: v }))}
        />
        <CampoPorcentaje
          etiqueta="Retención de IVA"
          ayuda="ReteIVA = Valor IVA × este % (sobre el impuesto, no sobre el bruto)."
          valor={valores.retencionIvaPct}
          disabled={loading}
          onChange={(v) => setValores((prev) => ({ ...prev, retencionIvaPct: v }))}
        />
        <CampoPorcentaje
          etiqueta="Retención ICA"
          ayuda="ReteICA = Total bruto × este %."
          valor={valores.retencionIcaPct}
          disabled={loading}
          onChange={(v) => setValores((prev) => ({ ...prev, retencionIcaPct: v }))}
        />
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" variant="success" disabled={guardando || loading}>
          {guardando ? "Guardando..." : "Guardar retenciones"}
        </Button>
      </div>
    </form>
  );
}

function CampoPorcentaje({
  etiqueta,
  ayuda,
  valor,
  disabled,
  onChange,
}: {
  etiqueta: string;
  ayuda: string;
  valor: number;
  disabled: boolean;
  onChange: (valor: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700">{etiqueta}</label>
      <Input
        type="number"
        required
        min={0}
        max={100}
        step={0.1}
        value={valor}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="text-xs text-slate-500">{ayuda}</p>
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
