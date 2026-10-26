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
 * Modo offline: clasifica y extrae con los servicios reales, sin cargar
 * Prisma ni ejecutar los jobs. No valida persistencia, matching ni la UI.
 *
 * Uso sin base de datos:
 *   npx tsx scripts/simular-correo-bandeja.ts --offline --asunto "IMPORTACION"
 *   npx tsx scripts/simular-correo-bandeja.ts --offline --asunto "IMPORT SALES" --adjunto "C:\\ruta\\cotizacion.pdf"
 *
 * Uso con base de datos (requiere una base desechable):
 *   npx tsx scripts/simular-correo-bandeja.ts <texto búsqueda proveedor> [numeroOrden]
 *
 * Ejemplos:
 *   npx tsx scripts/simular-correo-bandeja.ts "Example Supplier"
 *   npx tsx scripts/simular-correo-bandeja.ts "900123456" OCI-2026-001
 *
 * Sin argumentos, lista los primeros proveedores con email configurado para
 * que elijas uno.
 */
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type {
  EmailMessage,
  EmailProvider,
  ListNewMessagesResult,
} from "../src/integrations/email/email-provider";
import { RegexDocumentExtractionProvider } from "../src/integrations/document-extraction/regex-extraction-provider";
import { clasificarCorreo } from "../src/modules/importaciones/importaciones-bandeja-clasificacion.service";

async function mainSinBaseDeDatos(args: string[]): Promise<void> {
  let asunto = "IMPORTACION";
  let remitente = "simulacion@localhost";
  let mostrarValores = false;
  const rutasAdjuntos: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const argumento = args[i];
    if (argumento === "--valores") {
      mostrarValores = true;
    } else if (["--asunto", "--remitente", "--adjunto"].includes(argumento)) {
      const valor = args[++i];
      if (!valor || valor.startsWith("--")) {
        throw new Error(`Falta el valor de ${argumento}.`);
      }
      if (argumento === "--asunto") asunto = valor;
      if (argumento === "--remitente") remitente = valor;
      if (argumento === "--adjunto") rutasAdjuntos.push(valor);
    } else {
      throw new Error(`Opción no reconocida: ${argumento}`);
    }
  }

  const ejemplo = [
    "Shipment Confirmation - PO-12345",
    "500 SACOS DE 25 KG C/U",
    "PESO NETO: 12.500 KG",
    "ETA: 18/10/2026",
    "Incoterm: FOB",
    "Container: ABCD1234567",
  ].join("\n");
  const adjuntos =
    rutasAdjuntos.length > 0
      ? rutasAdjuntos.map((ruta) => {
          const extension = path.extname(ruta).toLowerCase();
          if (extension !== ".pdf" && extension !== ".txt") {
            throw new Error(`Solo se admiten PDF o TXT en modo offline: ${path.basename(ruta)}`);
          }
          return {
            nombre: path.basename(ruta),
            mimeType: extension === ".pdf" ? "application/pdf" : "text/plain",
            contenido: fs.readFileSync(ruta),
          };
        })
      : [
          {
            nombre: "shipping-confirmation.txt",
            mimeType: "text/plain",
            contenido: Buffer.from(ejemplo),
          },
        ];

  const clasificacion = clasificarCorreo({
    asunto,
    remitente,
    nombresAdjuntos: adjuntos.map((adjunto) => adjunto.nombre),
  });
  const extractor = new RegexDocumentExtractionProvider();
  console.log("Simulación offline: sin Gmail, base de datos ni jobs.");
  console.log(`Asunto: ${asunto}`);
  console.log(`Clasificación: ${clasificacion}`);

  for (const adjunto of adjuntos) {
    const resultado = await extractor.extraer(adjunto.contenido, adjunto.mimeType);
    console.log(`\nAdjunto: ${adjunto.nombre} | campos extraídos: ${resultado.campos.length}`);
    for (const campo of resultado.campos) {
      const valor = mostrarValores ? ` = ${JSON.stringify(campo.valor)}` : "";
      console.log(
        `  - ${campo.campo}${valor} | página ${campo.pagina ?? "—"} | ${resultado.motorUsado}`,
      );
    }
  }

  console.log(
    "\nAlcance: clasificación y extracción. Proveedor, tenant, orden, persistencia y bandeja requieren base de datos.",
  );
  if (!mostrarValores)
    console.log(
      "Para inspeccionar valores localmente, repite con --valores; evita compartir datos sensibles.",
    );
}

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

async function mainConBaseDeDatos() {
  await import("dotenv/config");
  const { prisma } = await import("../src/config/prisma");
  const { _establecerProviderParaTests, ejecutarCicloIngestaCorreos } =
    await import("../src/modules/importaciones/importaciones-bandeja-ingesta.job");
  const { ejecutarCicloProcesamientoCorreos } =
    await import("../src/modules/importaciones/importaciones-bandeja-procesamiento.job");
  try {
    const busqueda = process.argv[2];
    const numeroOrdenArg = process.argv[3];

    if (!busqueda) {
      const proveedores = await prisma.proveedor.findMany({
        where: { email: { not: null }, activo: true },
        select: { id: true, tenantId: true, nombre: true, nit: true, email: true },
        take: 15,
      });
      console.log(
        "Uso: npx tsx scripts/simular-correo-bandeja.ts <nombre o NIT del proveedor> [numeroOrden]\n",
      );
      console.log("Proveedores disponibles (con email configurado):\n");
      for (const p of proveedores) {
        console.log(`  - ${p.nombre} | NIT ${p.nit} | ${p.email} | tenant ${p.tenantId}`);
      }
      if (proveedores.length === 0) {
        console.log(
          "  (Ninguno. Configúrale un email a un proveedor primero — Configuración → Proveedores.)",
        );
      }
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
      throw new Error(
        `No se encontró ningún proveedor activo con email que coincida con "${busqueda}".`,
      );
    }

    let numeroOrden = numeroOrdenArg;
    if (!numeroOrden) {
      const orden = await prisma.ordenCompraIntl.findFirst({
        where: { tenantId: proveedor.tenantId, proveedorId: proveedor.id, eliminado: false },
        orderBy: { createdAt: "desc" },
      });
      if (!orden) {
        throw new Error(
          `"${proveedor.nombre}" no tiene ninguna Orden de Compra Internacional todavía. Créala primero, o pasa un numeroOrden explícito como segundo argumento.`,
        );
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

    console.log(
      `\nSimulando correo de "${proveedor.nombre}" <${proveedor.email}> sobre la orden ${numeroOrden}...\n`,
    );

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
        console.log(
          `  - ${ext.campo}: "${ext.valorExtraido}" (página ${ext.pagina ?? "—"}, motor ${ext.motorUsado})`,
        );
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
  } finally {
    await prisma.$disconnect();
  }
}

const accion =
  process.argv[2] === "--offline"
    ? mainSinBaseDeDatos(process.argv.slice(3))
    : mainConBaseDeDatos();

accion.catch((error) => {
  console.error("Error en la simulación:", error);
  process.exitCode = 1;
});
