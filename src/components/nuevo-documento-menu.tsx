import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProformaDialog } from "@/components/proforma-dialog";
import { hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

/** Punto de entrada para crear documentos desde Gestión Comercial. Hoy solo
 * se pueden crear Proformas desde aquí: las Cotizaciones y los Pedidos ya no
 * se crean en esta pantalla (el Pedido nace de una Proforma ACEPTADA desde el
 * detalle de la Proforma). Se oculta si el usuario no tiene
 * `proformas.gestionar`. */
export function NuevoDocumentoMenu() {
  const { user } = useSession();
  const [abierto, setAbierto] = useState(false);

  if (!hasPermission(user, PERMISOS_SISTEMA.PROFORMAS_GESTIONAR)) return null;

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setAbierto(true)}>
        <Plus className="h-3.5 w-3.5" /> Nueva proforma
      </Button>
      <ProformaDialog open={abierto} onOpenChange={setAbierto} />
    </>
  );
}
