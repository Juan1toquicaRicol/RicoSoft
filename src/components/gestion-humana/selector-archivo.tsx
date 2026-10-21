import { useRef } from "react";
import { Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SelectorArchivo({
  etiqueta,
  etiquetaAccesible,
  onArchivo,
}: {
  etiqueta: string;
  etiquetaAccesible: string;
  onArchivo: (archivo: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        hidden
        aria-label={etiquetaAccesible}
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) onArchivo(archivo);
          e.target.value = "";
        }}
      />
      <Button type="button" size="xs" variant="outline" onClick={() => ref.current?.click()}>
        <Paperclip className="h-3 w-3 mr-1" /> {etiqueta}
      </Button>
    </>
  );
}
