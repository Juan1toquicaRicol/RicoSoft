import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailMessage, EmailProvider } from "../../integrations/email/email-provider";

const {
  correoFindUnique,
  correoFindFirst,
  correoCreate,
  correoUpdate,
  adjuntoFindUnique,
  adjuntoCreate,
} = vi.hoisted(() => ({
  correoFindUnique: vi.fn(),
  correoFindFirst: vi.fn(),
  correoCreate: vi.fn(),
  correoUpdate: vi.fn(),
  adjuntoFindUnique: vi.fn(),
  adjuntoCreate: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    importacionCorreo: {
      findUnique: correoFindUnique,
      findFirst: correoFindFirst,
      create: correoCreate,
      update: correoUpdate,
    },
    importacionCorreoAdjunto: { findUnique: adjuntoFindUnique, create: adjuntoCreate },
  },
}));
vi.mock("fs", () => {
  const fake = { mkdirSync: vi.fn(), writeFileSync: vi.fn() };
  return { default: fake, ...fake };
});

const { ejecutarCicloIngestaCorreos, _establecerProviderParaTests } =
  await import("./importaciones-bandeja-ingesta.job");

function mensaje(n: number, adjuntos: string[] = []): EmailMessage {
  return {
    messageId: `<m${n}@test>`,
    providerMessageId: `g${n}`,
    from: "Proveedor <ventas@proveedor.test>",
    to: ["departamento.sistemas@ricol.com.co"],
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
  fallanAdjuntos: string[] = [],
): EmailProvider & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    pedidos,
    async listNewMessages() {
      return { messages: mensajes, nextCursor: null };
    },
    async getAttachmentContent(_m, adjuntoId) {
      pedidos.push(adjuntoId);
      if (fallanAdjuntos.includes(adjuntoId)) throw new Error("Gmail no respondió");
      return Buffer.from(`contenido-${adjuntoId}`);
    },
  };
}

describe("ingesta de correos", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED = "true";
    process.env.IMPORTACIONES_MAX_ATTACHMENTS_PER_RUN = "3";
    for (const f of [
      correoFindUnique,
      correoFindFirst,
      correoCreate,
      correoUpdate,
      adjuntoFindUnique,
      adjuntoCreate,
    ]) {
      f.mockReset();
    }
    correoFindUnique.mockResolvedValue(null);
    correoFindFirst.mockResolvedValue(null);
    adjuntoFindUnique.mockResolvedValue(null);
    correoCreate.mockImplementation(async ({ data }) => ({ id: `id-${data.messageId}` }));
    adjuntoCreate.mockResolvedValue({});
    correoUpdate.mockResolvedValue({});
  });
  afterEach(() => {
    delete process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED;
    delete process.env.IMPORTACIONES_MAX_ATTACHMENTS_PER_RUN;
    vi.restoreAllMocks();
  });

  it("un adjunto que falla deja el correo en ERROR con el detalle, no lo omite en silencio", async () => {
    _establecerProviderParaTests(proveedor([mensaje(1, ["a.pdf", "b.pdf"])], ["a1-1"]));
    await ejecutarCicloIngestaCorreos();

    expect(adjuntoCreate).toHaveBeenCalledTimes(1); // a.pdf sí quedó guardado
    expect(correoUpdate).toHaveBeenCalledTimes(1);
    const { data } = correoUpdate.mock.calls[0][0];
    expect(data.estadoProcesamiento).toBe("ERROR");
    expect(data.ultimoError).toContain("b.pdf");
  });

  it("sin fallos el correo queda PENDIENTE (no se actualiza a ERROR)", async () => {
    _establecerProviderParaTests(proveedor([mensaje(1, ["a.pdf"])]));
    await ejecutarCicloIngestaCorreos();
    expect(adjuntoCreate).toHaveBeenCalledTimes(1);
    expect(correoUpdate).not.toHaveBeenCalled();
  });

  it("el tope de adjuntos es por corrida: no trunca un correo, deja el siguiente para la próxima", async () => {
    const p = proveedor([mensaje(1, ["a", "b"]), mensaje(2, ["c", "d"]), mensaje(3, [])]);
    _establecerProviderParaTests(p);
    await ejecutarCicloIngestaCorreos();

    expect(p.pedidos).toEqual(["a1-0", "a1-1"]); // el correo 2 (2 adjuntos) excede el tope de 3
    expect(correoCreate).toHaveBeenCalledTimes(1);
  });

  it("si falla la escritura del correo, la corrida se corta y no salta a mensajes más nuevos", async () => {
    correoCreate.mockRejectedValueOnce(new Error("BD caída"));
    _establecerProviderParaTests(proveedor([mensaje(1), mensaje(2)]));
    await ejecutarCicloIngestaCorreos();
    expect(correoCreate).toHaveBeenCalledTimes(1);
  });

  it("un mensaje ya ingerido se omite sin duplicar", async () => {
    correoFindUnique.mockResolvedValueOnce({ id: "existente" });
    _establecerProviderParaTests(proveedor([mensaje(1, ["a.pdf"])]));
    await ejecutarCicloIngestaCorreos();
    expect(correoCreate).not.toHaveBeenCalled();
  });
});
