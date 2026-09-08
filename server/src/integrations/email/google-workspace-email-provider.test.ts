import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * GoogleWorkspaceEmailProvider — NUNCA depende de Gmail real (§24: "Usar
 * mocks; NO depender del Gmail real en tests"). `googleapis` se mockea por
 * completo: `google.auth.JWT` es un constructor vacío (no firma nada de
 * verdad) y `google.gmail(...)` devuelve un cliente falso cuyos métodos
 * controla cada test.
 */
const usersMessagesList = vi.fn();
const usersMessagesGet = vi.fn();
const usersMessagesAttachmentsGet = vi.fn();

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
    gmail: vi.fn(() => ({
      users: {
        messages: {
          list: usersMessagesList,
          get: usersMessagesGet,
          attachments: { get: usersMessagesAttachmentsGet },
        },
      },
    })),
  },
}));

const { GoogleWorkspaceEmailProvider } = await import("./google-workspace-email-provider");
const { EmailProviderError } = await import("./email-provider");
const { google } = await import("googleapis");

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "bandeja@proyecto.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
});

function base64Url(texto: string): string {
  return Buffer.from(texto, "utf-8").toString("base64url");
}

function mensajeGmailFalso(
  overrides?: Partial<{ id: string; messageId: string; internalDate: string }>,
) {
  return {
    id: overrides?.id ?? "gmail-id-1",
    internalDate: overrides?.internalDate ?? "1700000000000",
    payload: {
      headers: [
        { name: "Message-ID", value: overrides?.messageId ?? "<abc@example.com>" },
        { name: "From", value: "sales@examplesupplier.com" },
        { name: "To", value: "importaciones@ricol.com.co" },
        { name: "Subject", value: "Shipment Confirmation PO-1" },
      ],
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: base64Url("Cuerpo del correo.") } },
        {
          filename: "aviso.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "att-1", size: 1234 },
        },
      ],
    },
  };
}

describe("GoogleWorkspaceEmailProvider", () => {
  beforeEach(() => {
    usersMessagesList.mockReset();
    usersMessagesGet.mockReset();
    usersMessagesAttachmentsGet.mockReset();
    process.env.IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
    process.env.IMPORTACIONES_EMAIL_MAILBOX = "importaciones@ricol.com.co";
  });

  afterEach(() => {
    delete process.env.IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON;
    delete process.env.IMPORTACIONES_EMAIL_MAILBOX;
  });

  it("autenticación: usa JWT con Domain-Wide Delegation, nunca contraseñas de usuario", async () => {
    usersMessagesList.mockResolvedValue({ data: { messages: [] } });
    const provider = new GoogleWorkspaceEmailProvider();

    await provider.listNewMessages(null, 10);

    expect(google.auth.JWT).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "bandeja@proyecto.iam.gserviceaccount.com",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        subject: "importaciones@ricol.com.co",
      }),
    );
  });

  it("error de autenticación: credenciales faltantes lanza EmailProviderError, no revienta el proceso", async () => {
    delete process.env.IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON;
    const provider = new GoogleWorkspaceEmailProvider();

    await expect(provider.listNewMessages(null, 10)).rejects.toBeInstanceOf(EmailProviderError);
  });

  it("error de autenticación: JSON de la cuenta de servicio inválido lanza EmailProviderError", async () => {
    process.env.IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON = "{no es json}";
    const provider = new GoogleWorkspaceEmailProvider();

    await expect(provider.listNewMessages(null, 10)).rejects.toBeInstanceOf(EmailProviderError);
  });

  it("lectura incremental: sin cursor no filtra por fecha; con cursor arma 'after:<segundos>'", async () => {
    usersMessagesList.mockResolvedValue({ data: { messages: [] } });
    const provider = new GoogleWorkspaceEmailProvider();

    await provider.listNewMessages(null, 10);
    expect(usersMessagesList).toHaveBeenCalledWith(expect.objectContaining({ q: undefined }));

    await provider.listNewMessages("1700000000000", 10);
    expect(usersMessagesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: "after:1700000000" }),
    );
  });

  it("Message-ID: mapea el header RFC 5322 (idempotencia), no el id interno de Gmail", async () => {
    usersMessagesList.mockResolvedValue({ data: { messages: [{ id: "gmail-id-1" }] } });
    usersMessagesGet.mockResolvedValue({
      data: mensajeGmailFalso({ messageId: "<real-message-id@example.com>" }),
    });
    const provider = new GoogleWorkspaceEmailProvider();

    const resultado = await provider.listNewMessages(null, 10);

    expect(resultado.messages).toHaveLength(1);
    expect(resultado.messages[0].messageId).toBe("<real-message-id@example.com>");
    expect(resultado.messages[0].providerMessageId).toBe("gmail-id-1");
  });

  it("deduplicación/cursor: descarta mensajes sin Message-ID y avanza el cursor al internalDate más reciente", async () => {
    usersMessagesList.mockResolvedValue({
      data: { messages: [{ id: "gmail-id-1" }, { id: "gmail-id-2" }] },
    });
    usersMessagesGet
      .mockResolvedValueOnce({
        data: mensajeGmailFalso({
          id: "gmail-id-1",
          messageId: "<sin-fecha-mayor@example.com>",
          internalDate: "1700000000000",
        }),
      })
      .mockResolvedValueOnce({
        data: {
          id: "gmail-id-2",
          internalDate: "1700000500000",
          payload: { headers: [], mimeType: "text/plain" },
        },
      });
    const provider = new GoogleWorkspaceEmailProvider();

    const resultado = await provider.listNewMessages(null, 10);

    // El segundo mensaje no tiene Message-ID -> se descarta silenciosamente,
    // no rompe el ciclo completo de ingesta por un mensaje malformado.
    expect(resultado.messages).toHaveLength(1);
    expect(resultado.nextCursor).toBe("1700000000000");
  });

  it("adjuntos: recorre partes MIME anidadas y extrae adjuntos con su attachmentId", async () => {
    usersMessagesList.mockResolvedValue({ data: { messages: [{ id: "gmail-id-1" }] } });
    usersMessagesGet.mockResolvedValue({ data: mensajeGmailFalso() });
    const provider = new GoogleWorkspaceEmailProvider();

    const resultado = await provider.listNewMessages(null, 10);

    expect(resultado.messages[0].attachments).toEqual([
      {
        providerAttachmentId: "att-1",
        filename: "aviso.pdf",
        mimeType: "application/pdf",
        size: 1234,
      },
    ]);
    expect(resultado.messages[0].bodyText).toBe("Cuerpo del correo.");
  });

  it("getAttachmentContent: decodifica base64url (no base64 estándar) del contenido del adjunto", async () => {
    const original = Buffer.from("contenido binario de prueba", "utf-8");
    usersMessagesAttachmentsGet.mockResolvedValue({
      data: { data: original.toString("base64url") },
    });
    const provider = new GoogleWorkspaceEmailProvider();

    const contenido = await provider.getAttachmentContent("gmail-id-1", "att-1");

    expect(contenido.equals(original)).toBe(true);
    expect(usersMessagesAttachmentsGet).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "gmail-id-1", id: "att-1" }),
    );
  });

  it("errores de API: listar mensajes fallido se envuelve en EmailProviderError", async () => {
    usersMessagesList.mockRejectedValue(new Error("500 desde Gmail"));
    const provider = new GoogleWorkspaceEmailProvider();

    await expect(provider.listNewMessages(null, 10)).rejects.toBeInstanceOf(EmailProviderError);
  });

  it("errores de API: obtener el detalle de un mensaje fallido se envuelve en EmailProviderError", async () => {
    usersMessagesList.mockResolvedValue({ data: { messages: [{ id: "gmail-id-1" }] } });
    usersMessagesGet.mockRejectedValue(new Error("404 desde Gmail"));
    const provider = new GoogleWorkspaceEmailProvider();

    await expect(provider.listNewMessages(null, 10)).rejects.toBeInstanceOf(EmailProviderError);
  });

  it("errores de API: descargar un adjunto fallido se envuelve en EmailProviderError", async () => {
    usersMessagesAttachmentsGet.mockRejectedValue(new Error("403 desde Gmail"));
    const provider = new GoogleWorkspaceEmailProvider();

    await expect(provider.getAttachmentContent("gmail-id-1", "att-1")).rejects.toBeInstanceOf(
      EmailProviderError,
    );
  });
});
