import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailMessage, EmailProvider } from "../../integrations/email/email-provider";

const m = vi.hoisted(() => ({
  buzonFindMany: vi.fn(),
  buzonUpdate: vi.fn(),
  origenFindMany: vi.fn(),
  omitidoFindMany: vi.fn(),
  omitidoCreate: vi.fn(),
  origenCreate: vi.fn(),
  correoFindUnique: vi.fn(),
  correoCreate: vi.fn(),
  correoUpdate: vi.fn(),
  adjuntoFindUnique: vi.fn(),
  adjuntoCreate: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("../../config/prisma", () => {
  const tx = {
    importacionCorreo: { create: m.correoCreate },
    importacionCorreoOrigen: { create: m.origenCreate },
  };
  return {
    prisma: {
      buzonImportaciones: { findMany: m.buzonFindMany, update: m.buzonUpdate },
      importacionCorreoOrigen: { findMany: m.origenFindMany, create: m.origenCreate },
      importacionMensajeOmitido: { findMany: m.omitidoFindMany, create: m.omitidoCreate },
      importacionCorreo: { findUnique: m.correoFindUnique, update: m.correoUpdate, create: m.correoCreate },
      importacionCorreoAdjunto: { findUnique: m.adjuntoFindUnique, create: m.adjuntoCreate },
      user: { findFirst: m.userFindFirst },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock("fs", () => {
  const fake = { mkdirSync: vi.fn(), writeFileSync: vi.fn() };
  return { default: fake, ...fake };
});

const { ejecutarCicloIngestaCorreos, _establecerFabricaProveedorIngestaParaTests } =
  await import("./importaciones-bandeja-ingesta.job");

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTRO_TENANT = "22222222-2222-4222-8222-222222222222";
const RESPONSABLE = "33333333-3333-4333-8333-333333333333";

function buzon(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    direccion: `${id}@ricol.com.co`,
    tenantId: TENANT,
    estado: "ACTIVO",
    etiquetaId: `Label_${id}`,
    responsableUsuarioId: RESPONSABLE,
    correosPorCiclo: 25,
    adjuntosPorCiclo: 50,
    timeoutSegundos: 120,
    ...extra,
  };
}

function mensaje(n: number, adjuntos: string[] = []): EmailMessage {
  return {
    messageId: `<m${n}@test>`,
    providerMessageId: `g${n}`,
    from: "Proveedor <ventas@proveedor.test>",
    to: ["logistica@ricol.com.co"],
    subject: `Correo ${n}`,
    date: new Date(2026, 0, n),
    bodyText: null,
    bodyHtml: null,
    attachments: adjuntos.map((filename, i) => ({
      providerAttachmentId: `a${n}-${i}`,
      filename,
      mimeType: "application/pdf",
      size: 10,
    })),
  };
}

function proveedor(
  mensajes: EmailMessage[],
  opciones: { fallanAdjuntos?: string[]; colgado?: boolean; falla?: boolean } = {},
): EmailProvider & { pedidos: string[]; listados: number } {
  const pedidos: string[] = [];
  const estado = { listados: 0 };
  return {
    pedidos,
    get listados() {
      return estado.listados;
    },
    async listNewMessages() {
      estado.listados++;
      if (opciones.falla) throw new Error("token expirado");
      if (opciones.colgado) return new Promise<never>(() => undefined);
      return { messages: mensajes, nextCursor: null };
    },
    async getAttachmentContent(_m, adjuntoId) {
      pedidos.push(adjuntoId);
      if (opciones.fallanAdjuntos?.includes(adjuntoId)) throw new Error("Gmail no respondió");
      return Buffer.from(`contenido-${adjuntoId}`);
    },
  };
}

/** Un falso por dirección: permite comportamientos distintos por buzón. */
function fabrica(mapa: Record<string, EmailProvider>) {
  return (direccion: string) => {
    const p = mapa[direccion.split("@")[0]];
    if (!p) throw new Error(`sin proveedor para ${direccion}`);
    return p;
  };
}

describe("ingesta por buzón", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED = "true";
    for (const f of [
      m.buzonFindMany,
      m.buzonUpdate,
      m.origenFindMany,
      m.omitidoFindMany,
      m.omitidoCreate,
      m.origenCreate,
      m.correoFindUnique,
      m.correoCreate,
      m.correoUpdate,
      m.adjuntoFindUnique,
      m.adjuntoCreate,
      m.userFindFirst,
    ]) {
      f.mockReset();
    }
    m.buzonFindMany.mockResolvedValue([buzon("logistica")]);
    m.buzonUpdate.mockResolvedValue({});
    m.origenFindMany.mockResolvedValue([]);
    m.omitidoFindMany.mockResolvedValue([]);
    m.origenCreate.mockResolvedValue({});
    m.correoFindUnique.mockResolvedValue(null);
    m.correoCreate.mockImplementation(async ({ data }) => ({ id: `id-${data.messageId}` }));
    m.correoUpdate.mockResolvedValue({});
    m.adjuntoFindUnique.mockResolvedValue(null);
    m.adjuntoCreate.mockResolvedValue({});
    m.userFindFirst.mockResolvedValue({ id: RESPONSABLE });
  });
  afterEach(() => {
    delete process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED;
    _establecerFabricaProveedorIngestaParaTests(null);
    vi.restoreAllMocks();
  });

  it("solo consulta buzones ACTIVOS con etiqueta", async () => {
    _establecerFabricaProveedorIngestaParaTests(fabrica({ logistica: proveedor([]) }));
    await ejecutarCicloIngestaCorreos();
    expect(m.buzonFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { estado: "ACTIVO" } }));
  });

  it("un adjunto que falla deja el correo en ERROR con el detalle", async () => {
    _establecerFabricaProveedorIngestaParaTests(
      fabrica({ logistica: proveedor([mensaje(1, ["a.pdf", "b.pdf"])], { fallanAdjuntos: ["a1-1"] }) }),
    );
    await ejecutarCicloIngestaCorreos();

    expect(m.adjuntoCreate).toHaveBeenCalledTimes(1);
    expect(m.correoUpdate).toHaveBeenCalledTimes(1);
    const { data } = m.correoUpdate.mock.calls[0][0];
    expect(data.estadoProcesamiento).toBe("ERROR");
    expect(data.ultimoError).toContain("b.pdf");
  });

  it("nuevo correo: nace con el tenant, el responsable del buzón y su origen en la misma transacción", async () => {
    _establecerFabricaProveedorIngestaParaTests(fabrica({ logistica: proveedor([mensaje(1)]) }));
    await ejecutarCicloIngestaCorreos();

    const datos = m.correoCreate.mock.calls[0][0].data;
    expect(datos.tenantId).toBe(TENANT);
    expect(datos.responsableUsuarioId).toBe(RESPONSABLE);
    expect(m.origenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ buzonId: "logistica", gmailId: "g1" }),
    });
  });

  it("el tope de adjuntos es por buzón: no trunca un correo, deja el siguiente", async () => {
    m.buzonFindMany.mockResolvedValue([buzon("logistica", { adjuntosPorCiclo: 3 })]);
    const p = proveedor([mensaje(1, ["a", "b"]), mensaje(2, ["c", "d"]), mensaje(3, [])]);
    _establecerFabricaProveedorIngestaParaTests(fabrica({ logistica: p }));
    await ejecutarCicloIngestaCorreos();

    expect(p.pedidos).toEqual(["a1-0", "a1-1"]);
    expect(m.correoCreate).toHaveBeenCalledTimes(1);
  });

  it("si falla la escritura del correo, el buzón se registra con error y no salta a mensajes más nuevos", async () => {
    m.correoCreate.mockRejectedValueOnce(new Error("BD caída"));
    _establecerFabricaProveedorIngestaParaTests(fabrica({ logistica: proveedor([mensaje(1), mensaje(2)]) }));
    await ejecutarCicloIngestaCorreos();

    expect(m.correoCreate).toHaveBeenCalledTimes(1);
    expect(m.buzonUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ultimoError: "Falló la lectura del buzón." }) }),
    );
  });

  it("un mensaje que ya existe en el mismo tenant solo agrega el origen, sin duplicar ni tocar adjuntos", async () => {
    m.correoFindUnique.mockResolvedValueOnce({ id: "existente", tenantId: TENANT });
    const p = proveedor([mensaje(1, ["a.pdf"])]);
    _establecerFabricaProveedorIngestaParaTests(fabrica({ logistica: p }));
    await ejecutarCicloIngestaCorreos();

    expect(m.correoCreate).not.toHaveBeenCalled();
    expect(m.adjuntoCreate).not.toHaveBeenCalled();
    expect(p.pedidos).toEqual([]);
    expect(m.origenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ correoId: "existente", buzonId: "logistica" }),
    });
  });

  it("un mensaje de otra empresa no recibe origen ni cambia de tenant", async () => {
    m.correoFindUnique.mockResolvedValueOnce({ id: "ajeno", tenantId: OTRO_TENANT });
    _establecerFabricaProveedorIngestaParaTests(fabrica({ logistica: proveedor([mensaje(1)]) }));
    await ejecutarCicloIngestaCorreos();

    expect(m.correoCreate).not.toHaveBeenCalled();
    expect(m.origenCreate).not.toHaveBeenCalled();
    expect(m.correoUpdate).not.toHaveBeenCalled();
  });

  it("si un buzón falla, los demás siguen y el fallo queda en ese buzón", async () => {
    m.buzonFindMany.mockResolvedValue([buzon("logistica"), buzon("gisela"), buzon("compras")]);
    _establecerFabricaProveedorIngestaParaTests(
      fabrica({
        logistica: proveedor([], { falla: true }),
        gisela: proveedor([mensaje(1)]),
        compras: proveedor([mensaje(2)]),
      }),
    );
    await ejecutarCicloIngestaCorreos();

    expect(m.correoCreate).toHaveBeenCalledTimes(2);
    const registrosDeFallo = m.buzonUpdate.mock.calls.filter(
      (c) => c[0].where.id === "logistica" && c[0].data.ultimoError,
    );
    expect(registrosDeFallo).toHaveLength(1);
    expect(registrosDeFallo[0][0].data.ultimoError).toBe("Falló la lectura del buzón.");
  });

  it("un buzón que no responde se corta por tiempo de espera y el siguiente sigue", async () => {
    vi.useFakeTimers();
    try {
      m.buzonFindMany.mockResolvedValue([
        buzon("logistica", { timeoutSegundos: 10 }),
        buzon("gisela"),
      ]);
      _establecerFabricaProveedorIngestaParaTests(
        fabrica({ logistica: proveedor([], { colgado: true }), gisela: proveedor([mensaje(1)]) }),
      );
      const ciclo = ejecutarCicloIngestaCorreos();
      await vi.advanceTimersByTimeAsync(10_000);
      await ciclo;

      const error = m.buzonUpdate.mock.calls.find((c) => c[0].where.id === "logistica");
      expect(error?.[0].data.ultimoError).toBe("El buzón no respondió en el tiempo permitido.");
      expect(m.correoCreate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("el responsable inactivo o de otra empresa no se asigna al correo nuevo", async () => {
    m.userFindFirst.mockResolvedValue(null);
    _establecerFabricaProveedorIngestaParaTests(fabrica({ logistica: proveedor([mensaje(1)]) }));
    await ejecutarCicloIngestaCorreos();
    expect(m.correoCreate.mock.calls[0][0].data.responsableUsuarioId).toBeNull();
  });
});
