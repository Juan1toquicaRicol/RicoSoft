import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Proveedor de envío con Gmail: NUNCA depende de Gmail real. `googleapis` se
 * mockea por completo y cada test controla `users.messages.send`.
 */
const messagesSend = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: vi.fn().mockImplementation(
        class {
          constructor(opts: Record<string, unknown>) {
            Object.assign(this, opts);
          }
        },
      ),
    },
    gmail: vi.fn(() => ({ users: { messages: { send: messagesSend } } })),
  },
}));

const {
  GoogleWorkspaceCorreoSaliente,
  SCOPE_GMAIL_SEND,
  construirMensajeRaw,
  crearProveedorCorreoSalienteDesdeEntorno,
  leerConfigCorreoSaliente,
} = await import("./google-workspace-correo-saliente");
const { CorreoSalienteError } = await import("../../lib/correo-saliente");
const { google } = await import("googleapis");

const JSON_CUENTA = JSON.stringify({
  client_email: "envio@proyecto.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
});

const CONFIG = {
  serviceAccountJson: JSON_CUENTA,
  mailbox: "principal@ricol.com.co",
  from: "no-reply@ricol.com.co",
};

function decodificarRaw(raw: string) {
  const texto = Buffer.from(raw, "base64url").toString("utf-8");
  const [cabecerasTxt, ...resto] = texto.split("\r\n\r\n");
  const cabeceras = Object.fromEntries(
    cabecerasTxt
      .split("\r\n")
      .map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 2)]),
  );
  const cuerpo = Buffer.from(resto.join("\r\n\r\n").replace(/\r\n/g, ""), "base64").toString(
    "utf-8",
  );
  return { cabeceras, cuerpo };
}

beforeEach(() => {
  vi.clearAllMocks();
  messagesSend.mockResolvedValue({ data: { id: "m1" } });
});

describe("leerConfigCorreoSaliente", () => {
  it("devuelve null si falta el JSON o el buzón", () => {
    expect(leerConfigCorreoSaliente({})).toBeNull();
    expect(
      leerConfigCorreoSaliente({ CORREO_SALIENTE_SERVICE_ACCOUNT_JSON: "{}" } as never),
    ).toBeNull();
    expect(
      leerConfigCorreoSaliente({ CORREO_SALIENTE_MAILBOX: "a@ricol.com.co" } as never),
    ).toBeNull();
  });

  it("usa el buzón como remitente si no hay CORREO_SALIENTE_FROM", () => {
    const config = leerConfigCorreoSaliente({
      CORREO_SALIENTE_SERVICE_ACCOUNT_JSON: "{}",
      CORREO_SALIENTE_MAILBOX: " principal@ricol.com.co ",
    } as never);
    expect(config).toEqual({
      serviceAccountJson: "{}",
      mailbox: "principal@ricol.com.co",
      from: "principal@ricol.com.co",
    });
  });

  it("crearProveedorCorreoSalienteDesdeEntorno devuelve null sin configuración completa", () => {
    expect(crearProveedorCorreoSalienteDesdeEntorno({})).toBeNull();
  });
});

describe("construirMensajeRaw", () => {
  it("arma un mensaje UTF-8 con From/To/Subject y cuerpo base64 que se decodifica igual", () => {
    const raw = construirMensajeRaw("no-reply@ricol.com.co", {
      para: "ana@ricol.com.co",
      asunto: "Código de verificación de RicoSoft",
      texto: "Tu código es: 123456\nVence en 10 minutos. Ñandú ✓",
    });
    const { cabeceras, cuerpo } = decodificarRaw(raw);
    expect(cabeceras.From).toBe("no-reply@ricol.com.co");
    expect(cabeceras.To).toBe("ana@ricol.com.co");
    expect(cabeceras["Content-Type"]).toBe("text/plain; charset=UTF-8");
    expect(cabeceras.Subject).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    const asunto = /=\?UTF-8\?B\?(.+)\?=/.exec(cabeceras.Subject)![1];
    expect(Buffer.from(asunto, "base64").toString("utf-8")).toBe(
      "Código de verificación de RicoSoft",
    );
    expect(cuerpo).toBe("Tu código es: 123456\nVence en 10 minutos. Ñandú ✓");
  });

  it("deja el asunto ASCII sin codificar", () => {
    const raw = construirMensajeRaw("a@ricol.com.co", {
      para: "b@ricol.com.co",
      asunto: "Hola",
      texto: "x",
    });
    expect(decodificarRaw(raw).cabeceras.Subject).toBe("Hola");
  });

  it.each([
    ["destinatario con salto de línea (inyección de cabeceras)", "x@ricol.com.co\r\nBcc: z@a.com"],
    ["destinatario con varias direcciones", "a@ricol.com.co,b@ricol.com.co"],
    ["destinatario sin arroba", "no-es-correo"],
  ])("rechaza %s", (_nombre, para) => {
    expect(() =>
      construirMensajeRaw("no-reply@ricol.com.co", { para, asunto: "x", texto: "x" }),
    ).toThrow(CorreoSalienteError);
  });

  it("rechaza un asunto con saltos de línea y un remitente inválido", () => {
    expect(() =>
      construirMensajeRaw("a@ricol.com.co", {
        para: "b@ricol.com.co",
        asunto: "Hola\r\nBcc: z@a.com",
        texto: "x",
      }),
    ).toThrow(CorreoSalienteError);
    expect(() =>
      construirMensajeRaw("remitente\r\ninvalido", {
        para: "b@ricol.com.co",
        asunto: "x",
        texto: "x",
      }),
    ).toThrow(CorreoSalienteError);
  });
});

describe("GoogleWorkspaceCorreoSaliente.enviar", () => {
  it("impersona el buzón real con SOLO el scope gmail.send y envía como el alias", async () => {
    const proveedor = new GoogleWorkspaceCorreoSaliente(CONFIG);
    await proveedor.enviar({ para: "ana@ricol.com.co", asunto: "Hola", texto: "Código 123456" });

    const optsJwt = vi.mocked(google.auth.JWT).mock.calls[0][0] as unknown as Record<
      string,
      unknown
    >;
    expect(optsJwt.subject).toBe("principal@ricol.com.co");
    expect(optsJwt.scopes).toEqual([SCOPE_GMAIL_SEND]);
    expect(SCOPE_GMAIL_SEND).toBe("https://www.googleapis.com/auth/gmail.send");

    const llamada = messagesSend.mock.calls[0][0];
    expect(llamada.userId).toBe("me");
    const { cabeceras, cuerpo } = decodificarRaw(llamada.requestBody.raw);
    expect(cabeceras.From).toBe("no-reply@ricol.com.co");
    expect(cabeceras.To).toBe("ana@ricol.com.co");
    expect(cuerpo).toBe("Código 123456");
  });

  it("reutiliza el cliente en envíos siguientes", async () => {
    const proveedor = new GoogleWorkspaceCorreoSaliente(CONFIG);
    await proveedor.enviar({ para: "a@ricol.com.co", asunto: "1", texto: "x" });
    await proveedor.enviar({ para: "b@ricol.com.co", asunto: "2", texto: "x" });
    expect(google.gmail).toHaveBeenCalledTimes(1);
    expect(messagesSend).toHaveBeenCalledTimes(2);
  });

  it("si Gmail rechaza, lanza CorreoSalienteError sin filtrar destinatario ni código", async () => {
    messagesSend.mockRejectedValue(new Error("unauthorized_client"));
    const proveedor = new GoogleWorkspaceCorreoSaliente(CONFIG);
    const error = await proveedor
      .enviar({ para: "ana@ricol.com.co", asunto: "x", texto: "Código 654321" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CorreoSalienteError);
    expect((error as Error).message).toBe("Gmail rechazó el envío del correo.");
    expect((error as Error).message).not.toMatch(/ana@|654321/);
  });

  it("con un JSON de credenciales inválido lanza CorreoSalienteError y no llama a Gmail", async () => {
    const proveedor = new GoogleWorkspaceCorreoSaliente({
      ...CONFIG,
      serviceAccountJson: "no-json",
    });
    await expect(
      proveedor.enviar({ para: "a@ricol.com.co", asunto: "x", texto: "x" }),
    ).rejects.toThrow("CORREO_SALIENTE_SERVICE_ACCOUNT_JSON no es un JSON válido.");
    expect(messagesSend).not.toHaveBeenCalled();
  });

  it("una dirección inválida falla antes de llamar a Gmail", async () => {
    const proveedor = new GoogleWorkspaceCorreoSaliente(CONFIG);
    await expect(
      proveedor.enviar({ para: "x@ricol.com.co\r\nBcc: z@a.com", asunto: "x", texto: "x" }),
    ).rejects.toBeInstanceOf(CorreoSalienteError);
    expect(messagesSend).not.toHaveBeenCalled();
  });
});
