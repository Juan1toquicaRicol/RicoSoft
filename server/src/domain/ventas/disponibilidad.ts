import type { ExistenciaItemSiesa } from "../../modules/integraciones-siesa/siesa-inventario.service";
import type { ComponenteBomSiesa } from "../../modules/integraciones-siesa/siesa-manufactura.service";
import { calcularCapacidadProductivaSiesa } from "../planeacion/capacidad-productiva";
import {
  calcularNecesidadesAbastecimientoSiesa,
  type NecesidadAbastecimientoSiesa,
} from "../../lib/abastecimiento-siesa";

/**
 * Disponibilidad comercial — responde "¿PUEDO VENDER ESTO?" para un
 * producto y una cantidad solicitada por un cliente. Es la pieza central
 * del módulo Ventas (Centro Operativo Comercial): NO recalcula ninguna
 * fórmula — reutiliza tal cual capacidad-productiva.ts (Centro de
 * Decisiones) y abastecimiento-siesa.ts, solo con un único ítem/cantidad en
 * vez del lote completo de producción recomendada.
 *
 * Reglas de estado:
 * - "disponible": existencia libre (existente - comprometida) alcanza sola.
 * - "requiere_produccion": no alcanza la existencia libre, pero la
 *   capacidad productiva real (según BOM + materia prima disponible) cubre
 *   el déficit completo.
 * - "requiere_produccion_y_compra": la capacidad productiva no alcanza —
 *   falta materia prima; se listan los componentes específicos y cuánto
 *   falta de cada uno (mismo cálculo que Etapa K / abastecimiento).
 * - "requiere_compra_directa": el producto NO tiene receta en Siesa (no se
 *   fabrica, se compra ya terminado) — no hay forma de "producir" el
 *   déficit, la única vía es comprarlo.
 */
export type EstadoDisponibilidadComercial =
  "disponible" | "requiere_produccion" | "requiere_produccion_y_compra" | "requiere_compra_directa";

export interface DisponibilidadComercial {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadSolicitada: number;
  cantidadExistente: number;
  cantidadComprometida: number;
  /** max(0, existente - comprometida) — lo que realmente se puede prometer hoy sin tocar producción. */
  disponibleLibre: number;
  /** max(0, solicitada - disponibleLibre). */
  deficit: number;
  estado: EstadoDisponibilidadComercial;
  /** Null cuando el producto no tiene receta (no se puede "producir"). */
  capacidadProductiva: number | null;
  materialLimitante: string | null;
  /** Parte del déficit que ni produciendo al máximo se cubre — 0 si no aplica. */
  deficitProductivo: number;
  necesidadesCompra: NecesidadAbastecimientoSiesa[];
}

export function calcularDisponibilidadComercial(
  itemRowId: number,
  cantidadSolicitada: number,
  existencias: ExistenciaItemSiesa[],
  bom: ComponenteBomSiesa[],
): DisponibilidadComercial {
  const item = existencias.find((e) => e.itemRowId === itemRowId);
  const cantidadExistente = item?.cantidadExistente ?? 0;
  const cantidadComprometida = item?.cantidadComprometida ?? 0;
  const disponibleLibre = Math.max(0, cantidadExistente - cantidadComprometida);
  const deficit = Math.max(0, cantidadSolicitada - disponibleLibre);

  const base = {
    itemRowId,
    descripcion: item?.descripcion ?? null,
    referencia: item?.referencia ?? null,
    unidadMedida: item?.unidadMedida ?? null,
    cantidadSolicitada,
    cantidadExistente,
    cantidadComprometida,
    disponibleLibre,
    deficit,
  };

  if (deficit <= 0) {
    return {
      ...base,
      estado: "disponible",
      capacidadProductiva: null,
      materialLimitante: null,
      deficitProductivo: 0,
      necesidadesCompra: [],
    };
  }

  // Se reutiliza calcularCapacidadProductivaSiesa (Centro de Decisiones) con
  // un único ítem sintético cuya "producción recomendada" es el déficit —
  // misma fórmula, mismo resultado que tendría en el lote completo.
  const [capacidad] = calcularCapacidadProductivaSiesa(
    [
      {
        itemRowId,
        descripcion: item?.descripcion ?? null,
        referencia: item?.referencia ?? null,
        unidadMedida: null,
        demandaProyectada: 0,
        pedidosComprometidos: 0,
        inventarioDisponible: 0,
        cantidadPendienteEntrar: 0,
        produccionRecomendada: deficit,
        // Ítem sintético (no viene del pronóstico real) — sin historial que
        // respalde una confianza, se marca explícitamente como tal.
        ventaPromedioMensual: 0,
        tendenciaPct: null,
        mesesConVenta: 0,
        confianza: "baja" as const,
      },
    ],
    bom,
    existencias,
  );

  if (capacidad.capacidadMaxima === null) {
    return {
      ...base,
      estado: "requiere_compra_directa",
      capacidadProductiva: null,
      materialLimitante: null,
      deficitProductivo: 0,
      necesidadesCompra: [],
    };
  }

  if (capacidad.deficitProductivo <= 0) {
    return {
      ...base,
      estado: "requiere_produccion",
      capacidadProductiva: capacidad.capacidadMaxima,
      materialLimitante: capacidad.materialLimitante?.descripcion ?? null,
      deficitProductivo: 0,
      necesidadesCompra: [],
    };
  }

  const necesidadesCompra = calcularNecesidadesAbastecimientoSiesa(
    [
      {
        itemRowId,
        descripcion: item?.descripcion ?? null,
        referencia: item?.referencia ?? null,
        unidadMedida: null,
        demandaProyectada: 0,
        pedidosComprometidos: 0,
        inventarioDisponible: 0,
        cantidadPendienteEntrar: 0,
        produccionRecomendada: deficit,
        // Ítem sintético (no viene del pronóstico real) — sin historial que
        // respalde una confianza, se marca explícitamente como tal.
        ventaPromedioMensual: 0,
        tendenciaPct: null,
        mesesConVenta: 0,
        confianza: "baja" as const,
      },
    ],
    bom,
    existencias,
  );

  return {
    ...base,
    estado: "requiere_produccion_y_compra",
    capacidadProductiva: capacidad.capacidadMaxima,
    materialLimitante: capacidad.materialLimitante?.descripcion ?? null,
    deficitProductivo: capacidad.deficitProductivo,
    necesidadesCompra,
  };
}
