/**
 * Simulación local de la Bandeja Inteligente — SIN Gmail real. Inyecta un
 * correo falso (con un adjunto de texto tipo "Shipping Confirmation") al
 * mismo pipeline de ingesta+procesamiento que corre en producción, usando el
 * punto de inyección que ya usan los tests automáticos
 * (_establecerProviderParaTests). Sirve para validar clasificación,
 * extracción y matching sin depender de credenciales de Google Workspace.
 *
 * NO modifica nada fuera de las tablas propias de la Bandeja
 * (ImportacionCorreo/Adjunto/Extraccion/Excepcion) — no toca Gmail, no envía
 * nada, no requiere IMPORTACIONES_EMAIL_SYNC_ENABLED en el .env real (el
 * script prende el flag solo en memoria, para esta ejecución).
 *
 * Uso:
 *   npx tsx scripts/simular-correo-bandeja.ts <texto búsqueda proveedor> [numeroOrden]
 *
 * Ejemplos:
 *   npx tsx scripts/simular-correo-bandeja.ts "Example Supplier"
 *   npx tsx scripts/simular-correo-bandeja.ts "900123456" OCI-2026-001
 *
 * Sin argumentos, lista los primeros proveedores con email configurado para
 * que elijas uno.
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { prisma } from "../src/config/prisma";
import type { EmailMessage, EmailProvider, ListNewMessagesResult } from "../src/integrations/email/email-provider";
import { _establecerProviderParaTests, ejecutarCicloIngestaCorreos } from "../src/modules/importaciones/importaciones-bandeja-ingesta.job";
import { ejecutarCicloProcesamientoCorreos } from "../src/modules/importaciones/importaciones-bandeja-procesamiento.job";

class ProviderDeSimulacion implements EmailProvider {
  constructor(
    private readonly mensaje: EmailMessage,
    private readonly contenidoAdjunto: Buffer,
    private readonly providerAttachmentId: string,
  ) {}

  async listNewMessages(): Promise<ListNewMessagesResult> {
    return { messages: [this.mensaje], nextCursor: null };
  }

  async getAttachmentContent(_providerMessageId: string, attachmentId: string): Promise<Buffer> {
    if (attachmentId !== this.providerAttachmentId) throw new Error("Adjunto no encontrado.");
    return this.contenidoAdjunto;
  }
}

async function main() {
  const busqueda = process.argv[2];
  const numeroOrdenArg = process.argv[3];

  if (!busqueda) {
    const proveedores = await prisma.proveedor.findMany({
      where: { email: { not: null }, activo: true },
      select: { id: true, tenantId: true, nombre: true, nit: true, email: true },
      take: 15,
    });
    console.log("Uso: npx tsx scripts/simular-correo-bandeja.ts <nombre o NIT del proveedor> [numeroOrden]\n");
    console.log("Proveedores disponibles (con email configurado):\n");
    for (const p of proveedores) {
      console.log(`  - ${p.nombre} | NIT ${p.nit} | ${p.email} | tenant ${p.tenantId}`);
    }
    if (proveedores.length === 0) {
      console.log("  (Ninguno. Configúrale un email a un proveedor primero — Configuración → Proveedores.)");
    }
    await prisma.$disconnect();
    return;
  }

  const proveedor = await prisma.proveedor.findFirst({
    where: {
      activo: true,
      email: { not: null },
      OR: [{ nombre: { contains: busqueda } }, { nit: { contains: busqueda } }],
    },
  });
  if (!proveedor || !proveedor.email) {
    console.error(`No se encontró ningún proveedor activo con email que coincida con "${busqueda}".`);
    await prisma.$disconnect();
    process.exit(1);
  }

  let numeroOrden = numeroOrdenArg;
  if (!numeroOrden) {
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { tenantId: proveedor.tenantId, proveedorId: proveedor.id, eliminado: false },
      orderBy: { createdAt: "desc" },
    });
    if (!orden) {
      console.error(
        `"${proveedor.nombre}" no tiene ninguna Orden de Compra Internacional todavía. Créala primero, o pasa un numeroOrden explícito como segundo argumento.`,
      );
      await prisma.$disconnect();
      process.exit(1);
    }
    numeroOrden = orden.numeroOrden;
  }

  const sufijo = randomUUID().slice(0, 8);
  const providerAttachmentId = randomUUID();
  const textoAdjunto = [
    `Shipment Confirmation - ${numeroOrden}`,
    `Supplier: ${proveedor.nombre}`,
    `PO: ${numeroOrden}`,
    "500 SACOS DE 25 KG C/U",
    "PESO NETO: 12.500 KG",
    "ETA: 18/10/2026",
    "Incoterm: FOB",
    "Container: ABCD1234567",
  ].join("\n");

  const mensaje: EmailMessage = {
    messageId: `<simulacion-${sufijo}@localhost>`,
    providerMessageId: randomUUID(),
    from: proveedor.email,
    to: ["importaciones@ricol.com.co"],
    subject: `Shipping Confirmation - Order ${numeroOrden}`,
    date: new Date(),
    bodyText: `Estimados, adjuntamos la confirmación de embarque de la orden ${numeroOrden}.`,
    bodyHtml: null,
    attachments: [
      {
        providerAttachmentId,
        filename: "shipping-confirmation.txt",
        mimeType: "text/plain",
        size: textoAdjunto.length,
      },
    ],
  };

  console.log(`\nSimulando correo de "${proveedor.nombre}" <${proveedor.email}> sobre la orden ${numeroOrden}...\n`);

  _establecerProviderParaTests(
    new ProviderDeSimulacion(mensaje, Buffer.from(textoAdjunto, "utf-8"), providerAttachmentId),
  );
  process.env.IMPORTACIONES_EMAIL_SYNC_ENABLED = "true";
  process.env.IMPORTACIONES_PROCESSING_ENABLED = "true";

  await ejecutarCicloIngestaCorreos();
  await ejecutarCicloProcesamientoCorreos();

  const correo = await prisma.importacionCorreo.findUniqueOrThrow({
    where: { messageId: mensaje.messageId },
    include: {
      adjuntos: { include: { extracciones: true } },
      excepciones: true,
      proveedor: { select: { nombre: true } },
      ordenCompra: { select: { numeroOrden: true } },
    },
  });

  console.log("── Resultado ──────────────────────────────────────────");
  console.log(`Correo ID:            ${correo.id}`);
  console.log(`Estado:               ${correo.estadoProcesamiento}`);
  console.log(`Clasificación:        ${correo.clasificacion ?? "—"}`);
  console.log(`Proveedor detectado:  ${correo.proveedor?.nombre ?? "(ninguno)"}`);
  console.log(`Orden detectada:      ${correo.ordenCompra?.numeroOrden ?? "(ninguna)"}`);
  console.log(`Último error:         ${correo.ultimoError ?? "—"}`);

  for (const adjunto of correo.adjuntos) {
    console.log(`\nAdjunto: ${adjunto.nombreOriginal} (${adjunto.estadoExtraccion})`);
    for (const ext of adjunto.extracciones) {
      console.log(`  - ${ext.campo}: "${ext.valorExtraido}" (página ${ext.pagina ?? "—"}, motor ${ext.motorUsado})`);
    }
  }

  if (correo.excepciones.length > 0) {
    console.log("\nExcepciones generadas:");
    for (const exc of correo.excepciones) {
      console.log(`  - [${exc.tipo}] ${exc.descripcion} (estado: ${exc.estado})`);
    }
  }

  console.log(`\nVer en la UI: /importaciones/bandeja/${correo.id}`);
  console.log("──────────────────────────────────────────────────────\n");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Error en la simulación:", error);
  await prisma.$disconnect();
  process.exit(1);
});
