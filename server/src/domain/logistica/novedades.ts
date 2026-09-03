/**
 * Agregación de novedades abiertas de Despacho — Fase 2.1 del Motor de
 * Decisiones (P0 Logística). Función pura: recibe novedades ya consultadas
 * (con el despacho ya incluido para resolver cliente/estado) y calcula
 * antigüedad + recurrencia por tipo/cliente.
 *
 * Deliberadamente NO define un umbral de "hay que escalar esto" (ej. "más
 * de 3 días = escalar") — esa es una decisión de negocio pendiente (ver
 * Fase 2.1, punto 2.3). Esta función solo ordena por antigüedad
 * descendente y deja que quien consuma el resultado decida el corte.
 */

export interface NovedadParaAgregacion {
  id: string;
  despachoId: string;
  tipo: string;
  descripcion: string;
  createdAt: Date;
  clienteNombre: string;
}

export interface NovedadConAntiguedad {
  id: string;
  despachoId: string;
  tipo: string;
  descripcion: string;
  clienteNombre: string;
  createdAt: Date;
  diasAbierta: number;
}

export interface ConteoPorClave {
  clave: string;
  cantidad: number;
}

export interface ResumenNovedadesAbiertas {
  novedades: NovedadConAntiguedad[];
  porTipo: ConteoPorClave[];
  porCliente: ConteoPorClave[];
}

const DIA_MS = 24 * 60 * 60 * 1000;

export function calcularAgregacionNovedades(
  novedades: NovedadParaAgregacion[],
  ahora: Date,
): ResumenNovedadesAbiertas {
  const conAntiguedad: NovedadConAntiguedad[] = novedades
    .map((n) => ({
      id: n.id,
      despachoId: n.despachoId,
      tipo: n.tipo,
      descripcion: n.descripcion,
      clienteNombre: n.clienteNombre,
      createdAt: n.createdAt,
      diasAbierta: Math.max(0, Math.floor((ahora.getTime() - n.createdAt.getTime()) / DIA_MS)),
    }))
    .sort((a, b) => b.diasAbierta - a.diasAbierta);

  const contarPor = (extraerClave: (n: NovedadParaAgregacion) => string): ConteoPorClave[] => {
    const conteo = new Map<string, number>();
    for (const n of novedades) {
      const clave = extraerClave(n);
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    return [...conteo.entries()]
      .map(([clave, cantidad]) => ({ clave, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);
  };

  return {
    novedades: conAntiguedad,
    porTipo: contarPor((n) => n.tipo),
    porCliente: contarPor((n) => n.clienteNombre),
  };
}
