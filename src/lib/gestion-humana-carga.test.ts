import { describe, expect, it } from "vitest";

import { cargarSeccionesGestionHumana } from "@/lib/gestion-humana-carga";

describe("cargarSeccionesGestionHumana", () => {
  it("conserva los colaboradores cuando el usuario no puede consultar permisos ni faltas", async () => {
    const resultado = await cargarSeccionesGestionHumana({
      empleados: async () => [{ id: "emp-1" }],
      permisos: async () => {
        throw new Error("Permiso denegado: permisos_laborales.ver");
      },
      faltas: async () => {
        throw new Error("Permiso denegado: faltas.ver");
      },
    });

    expect(resultado.empleados).toEqual({ datos: [{ id: "emp-1" }], error: "" });
    expect(resultado.permisos.error).toContain("permisos_laborales.ver");
    expect(resultado.faltas.error).toContain("faltas.ver");
  });

  it("devuelve los errores de la sección correspondiente sin descartar las demás", async () => {
    const resultado = await cargarSeccionesGestionHumana({
      empleados: async () => {
        throw new Error("Error SQL al listar colaboradores");
      },
      permisos: async () => [{ id: "perm-1" }],
      faltas: async () => [],
    });

    expect(resultado.empleados.error).toBe("Error SQL al listar colaboradores");
    expect(resultado.permisos.datos).toEqual([{ id: "perm-1" }]);
    expect(resultado.faltas.datos).toEqual([]);
  });
});
