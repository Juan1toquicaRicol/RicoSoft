import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { asyncHandler } from "./async-handler";

function crearApp(handler: express.RequestHandler) {
  const app = express();
  app.get("/x", handler);
  // Manejador de errores como el global de app.ts.
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ message: "error controlado", detalle: err.message });
    },
  );
  return app;
}

describe("asyncHandler", () => {
  it("un rechazo del handler llega al manejador de errores (no deja la petición colgada)", async () => {
    const app = crearApp(
      asyncHandler(async () => {
        throw new Error("boom");
      }),
    );
    const res = await request(app).get("/x").timeout(2000);
    expect(res.status).toBe(500);
    expect(res.body.detalle).toBe("boom");
  });

  it("una excepción síncrona dentro del handler también se reenvía", async () => {
    const app = crearApp(
      asyncHandler(() => {
        throw new Error("sync");
      }),
    );
    expect((await request(app).get("/x").timeout(2000)).status).toBe(500);
  });

  it("un handler que responde con normalidad no se altera", async () => {
    const app = crearApp(asyncHandler(async (_req, res) => res.status(200).json({ ok: true })));
    const res = await request(app).get("/x");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
