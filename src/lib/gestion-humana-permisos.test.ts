import { describe, expect, it } from "vitest";

import { puedeAprobarPermiso } from "@/lib/gestion-humana-permisos";

describe("puedeAprobarPermiso (D-04)", () => {
  it("pendiente de un colaborador vigente: se puede aprobar", () => {
    expect(puedeAprobarPermiso({ estado: "Pendiente", colaboradorVigente: true })).toBe(true);
  });

  it("pendiente de un colaborador liquidado o eliminado: no se ofrece aprobar", () => {
    expect(puedeAprobarPermiso({ estado: "Pendiente", colaboradorVigente: false })).toBe(false);
  });

  it("un permiso ya resuelto no se aprueba, sea cual sea el colaborador", () => {
    expect(puedeAprobarPermiso({ estado: "Aprobado", colaboradorVigente: true })).toBe(false);
    expect(puedeAprobarPermiso({ estado: "Rechazado", colaboradorVigente: true })).toBe(false);
  });

  it("si el backend no informa el dato, la UI no bloquea (decide el backend)", () => {
    expect(puedeAprobarPermiso({ estado: "Pendiente", colaboradorVigente: undefined })).toBe(true);
  });
});
