import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CargosPanel } from "@/components/gestion-humana/cargos-panel";
import { CatalogoSeguridadSocialPanel } from "@/components/gestion-humana/catalogo-seguridad-social-panel";
import type { TipoSeguridadSocial } from "@/hooks/use-seguridad-social";

type Seccion = "cargos" | TipoSeguridadSocial;

const SECCIONES_SS: { valor: TipoSeguridadSocial; etiqueta: string; singular: string }[] = [
  { valor: "EPS", etiqueta: "EPS", singular: "EPS" },
  { valor: "ARL", etiqueta: "ARL", singular: "ARL" },
  { valor: "FONDO_PENSIONES", etiqueta: "Fondos de pensiones", singular: "fondo de pensiones" },
  { valor: "TIPO_CONTRATO", etiqueta: "Tipos de contrato", singular: "tipo de contrato" },
];

/**
 * "Gestión de información" de Gestión Humana: catálogos que alimentan el
 * registro del colaborador (cargos, EPS, ARL y fondos de pensiones). Cada
 * subsección se muestra con su propio permiso.
 */
export function GestionInformacionPanel({
  puedeVerCargos,
  puedeGestionarCargos,
  puedeVerInformacion,
  puedeGestionarInformacion,
}: {
  puedeVerCargos: boolean;
  puedeGestionarCargos: boolean;
  puedeVerInformacion: boolean;
  puedeGestionarInformacion: boolean;
}) {
  const [seccion, setSeccion] = useState<Seccion>(puedeVerCargos ? "cargos" : "EPS");

  return (
    <Tabs value={seccion} onValueChange={(v) => setSeccion(v as Seccion)}>
      <TabsList className="mb-3">
        {puedeVerCargos && (
          <TabsTrigger value="cargos" className="text-xs">
            Cargos
          </TabsTrigger>
        )}
        {puedeVerInformacion &&
          SECCIONES_SS.map((s) => (
            <TabsTrigger key={s.valor} value={s.valor} className="text-xs">
              {s.etiqueta}
            </TabsTrigger>
          ))}
      </TabsList>
      {puedeVerCargos && (
        <TabsContent value="cargos" className="mt-0">
          <CargosPanel puedeGestionar={puedeGestionarCargos} />
        </TabsContent>
      )}
      {puedeVerInformacion &&
        SECCIONES_SS.map((s) => (
          <TabsContent key={s.valor} value={s.valor} className="mt-0">
            <CatalogoSeguridadSocialPanel
              tipo={s.valor}
              titulo={s.etiqueta}
              singular={s.singular}
              puedeGestionar={puedeGestionarInformacion}
            />
          </TabsContent>
        ))}
    </Tabs>
  );
}
