import { afterEach, describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import {
  contenidoCoincideConMime,
  tipoArchivoPublicacion,
  uploadArchivosPublicacion,
  validarPublicacionIdParaArchivo,
} from "./upload.middleware";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj");
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(4)]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("tipoArchivoPublicacion", () => {
  it("clasifica foto, video y documento; rechaza lo que no está permitido", () => {
    expect(tipoArchivoPublicacion("image/png")).toBe("IMAGEN");
    expect(tipoArchivoPublicacion("video/mp4")).toBe("VIDEO");
    expect(tipoArchivoPublicacion("application/pdf")).toBe("DOCUMENTO");
    expect(tipoArchivoPublicacion(DOCX)).toBe("DOCUMENTO");
    // SVG y HTML podrían ejecutar script al abrirse inline: no se admiten.
    expect(tipoArchivoPublicacion("image/svg+xml")).toBeNull();
    expect(tipoArchivoPublicacion("text/html")).toBeNull();
  });
});

describe("contenidoCoincideConMime", () => {
  it("acepta cada tipo cuando los primeros bytes coinciden con lo declarado", () => {
    expect(contenidoCoincideConMime(PNG, "image/png")).toBe(true);
    expect(contenidoCoincideConMime(PDF, "application/pdf")).toBe(true);
    expect(contenidoCoincideConMime(GIF, "image/gif")).toBe(true);
    expect(contenidoCoincideConMime(MP4, "video/mp4")).toBe(true);
    expect(contenidoCoincideConMime(MP4, "video/quicktime")).toBe(true);
    expect(contenidoCoincideConMime(WEBM, "video/webm")).toBe(true);
    expect(contenidoCoincideConMime(ZIP, DOCX)).toBe(true);
    expect(contenidoCoincideConMime(OLE, "application/msword")).toBe(true);
  });

  it("rechaza un ejecutable que declara ser imagen, video o documento", () => {
    for (const mime of ["image/png", "video/mp4", "application/pdf", DOCX, "application/msword"]) {
      expect(contenidoCoincideConMime(EXE, mime)).toBe(false);
    }
  });

  it("rechaza contenido real de un tipo declarado como otro", () => {
    expect(contenidoCoincideConMime(PNG, "video/mp4")).toBe(false);
    expect(contenidoCoincideConMime(PDF, "image/png")).toBe(false);
    expect(contenidoCoincideConMime(MP4, "video/webm")).toBe(false);
  });

  it("no lanza con buffers vacíos/cortos y rechaza mimes desconocidos", () => {
    expect(contenidoCoincideConMime(Buffer.alloc(0), "video/mp4")).toBe(false);
    expect(contenidoCoincideConMime(Buffer.from([0x1a]), "video/webm")).toBe(false);
    expect(contenidoCoincideConMime(PNG, "image/svg+xml")).toBe(false);
  });
});

describe("uploadArchivosPublicacion (multipart real, sin BD)", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const recibidos: Express.Multer.File[] = [];

  const app = express();
  app.post(
    "/:id/archivos",
    validarPublicacionIdParaArchivo,
    uploadArchivosPublicacion,
    (req, res) => {
      recibidos.push(...((req as express.Request & { files?: Express.Multer.File[] }).files ?? []));
      res.status(201).json({ recibidos: recibidos.length });
    },
  );

  afterEach(() => {
    // La ruta real mueve los archivos; aquí se limpian los que quedaron en _tmp.
    for (const f of recibidos.splice(0)) fs.rmSync(f.path, { force: true });
  });

  it("acepta varios archivos válidos de tipos distintos en una sola solicitud", async () => {
    const res = await request(app)
      .post(`/${ID}/archivos`)
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" })
      .attach("archivos", MP4, { filename: "clip.mp4", contentType: "video/mp4" })
      .attach("archivos", PDF, { filename: "acta.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.recibidos).toBe(3);
  });

  it("rechaza y no deja nada en disco si UN archivo tiene contenido que no coincide con su tipo", async () => {
    // Se registran los unlink de ESTA solicitud (la carpeta _tmp es compartida
    // con otras suites en paralelo, contar sus archivos no es confiable).
    const borrados: string[] = [];
    const spy = vi.spyOn(fs, "unlink").mockImplementation(((ruta: fs.PathLike, cb: () => void) => {
      borrados.push(String(ruta));
      fs.rmSync(String(ruta), { force: true });
      cb?.();
    }) as unknown as typeof fs.unlink);

    try {
      const res = await request(app)
        .post(`/${ID}/archivos`)
        .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" })
        .attach("archivos", EXE, { filename: "virus.pdf", contentType: "application/pdf" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/virus\.pdf/);
      // Todo-o-nada: se borran los DOS archivos, también la foto válida que
      // venía en la misma solicitud.
      expect(borrados).toHaveLength(2);
      expect(borrados.some((r) => fs.existsSync(r))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("los mensajes de error conservan tildes y ñ del nombre del archivo", async () => {
    const res = await request(app).post(`/${ID}/archivos`).attach("archivos", EXE, {
      filename: "Presentación año.pdf",
      contentType: "application/pdf",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Presentación año.pdf");
  });

  it("rechaza un tipo no permitido (HTML) declarado en el multipart", async () => {
    const res = await request(app)
      .post(`/${ID}/archivos`)
      .attach("archivos", Buffer.from("<script>alert(1)</script>"), {
        filename: "x.html",
        contentType: "text/html",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tipo no permitido/i);
  });

  it("rechaza más de 10 archivos en una sola solicitud", async () => {
    let req = request(app).post(`/${ID}/archivos`);
    for (let i = 0; i < 11; i++) {
      req = req.attach("archivos", PNG, { filename: `f${i}.png`, contentType: "image/png" });
    }
    const res = await req;

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hasta 10 archivos/);
  });

  it("rechaza un id que no es UUID antes de tocar el disco (path traversal)", async () => {
    const res = await request(app)
      .post("/no-es-uuid/archivos")
      .attach("archivos", PNG, { filename: "foto.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/identificador/i);
  });
});
