/**
 * Fase 5.4 — precarga la ReglaDestinatarios del evento
 * SERVICIO_RENOVACION_PROXIMA con dos destinatarios PERFIL fijos: Tesorería y
 * Recepción de Facturas. Es un seed/backfill de datos, NO una migración de
 * esquema (el esquema ya existe desde Fase 5.3) — sigue el mismo patrón que
 * scripts/backfill-siesa-terceros.ts: usa `prisma` directo (no tenantPrisma,
 * porque corre fuera de un request) filtrando tenantId a mano en cada
 * consulta, y es seguro de ejecutar varias veces.
 *
 * Reglas de idempotencia y seguridad (no negociables, ver Fase 5.4):
 *  - Si el tenant YA tiene alguna ReglaDestinatarios para este evento (la
 *    haya creado este script antes o un administrador a mano), NO se toca —
 *    ni se agregan destinatarios faltantes ni se modifica nada. Se reporta y
 *    se pasa al siguiente tenant.
 *  - NUNCA crea PerfilFuncional. Solo busca los que ya existan.
 *  - Si un tenant no tiene el perfil "Tesorería" o "Recepción de Facturas",
 *    no falla el proceso completo: se documenta ese caso puntual y se sigue
 *    con los demás tenants (la regla se crea igual con los destinatarios que
 *    sí se pudieron resolver, o no se crea si no se resolvió ninguno).
 *  - Si el nombre del perfil es ambiguo dentro del tenant (existe en más de
 *    un Departamento), NO se elige ninguno arbitrariamente — se reporta como
 *    ambiguo y se omite ese destinatario puntual.
 *
 * Uso: npx tsx scripts/seed-regla-destinatarios-renovacion-servicios.ts
 */
import "dotenv/config";
import { prisma } from "../src/config/prisma";

const EVENTO = "SERVICIO_RENOVACION_PROXIMA";
const NOMBRES_PERFILES_DESTINATARIOS = ["Tesorería", "Recepción de Facturas"] as const;

async function resolverPerfilPorNombre(tenantId: string, nombre: string) {
  const candidatos = await prisma.perfilFuncional.findMany({
    where: { tenantId, nombre, activo: true },
    select: {
      id: true,
      nombre: true,
      departamentoId: true,
      departamento: { select: { nombre: true } },
    },
  });

  if (candidatos.length === 0) {
    return { estado: "no_encontrado" as const };
  }
  if (candidatos.length > 1) {
    return {
      estado: "ambiguo" as const,
      areas: candidatos.map((c) => c.departamento.nombre),
    };
  }
  return {
    estado: "resuelto" as const,
    perfilId: candidatos[0].id,
    area: candidatos[0].departamento.nombre,
  };
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, nombre: true } });

  let tenantsOmitidosPorReglaExistente = 0;
  let tenantsCreados = 0;
  let tenantsSinNingunPerfil = 0;

  for (const tenant of tenants) {
    const reglaExistente = await prisma.reglaDestinatarios.findFirst({
      where: { tenantId: tenant.id, evento: EVENTO },
      select: { id: true },
    });

    if (reglaExistente) {
      console.log(
        `ℹ️  [${tenant.nombre}] Ya existe una ReglaDestinatarios para "${EVENTO}" (id=${reglaExistente.id}) — se conserva sin cambios.`,
      );
      tenantsOmitidosPorReglaExistente++;
      continue;
    }

    const destinatariosACrear: { tipo: "PERFIL"; perfilId: string }[] = [];

    for (const nombrePerfil of NOMBRES_PERFILES_DESTINATARIOS) {
      const resultado = await resolverPerfilPorNombre(tenant.id, nombrePerfil);

      if (resultado.estado === "no_encontrado") {
        console.log(
          `⚠️  [${tenant.nombre}] No tiene un perfil funcional activo llamado "${nombrePerfil}" — se omite ese destinatario.`,
        );
        continue;
      }
      if (resultado.estado === "ambiguo") {
        console.log(
          `⚠️  [${tenant.nombre}] Tiene más de un perfil "${nombrePerfil}" (áreas: ${resultado.areas.join(", ")}) — ambiguo, se omite ese destinatario. Resuélvelo manualmente desde /configuracion/reglas-destinatarios.`,
        );
        continue;
      }
      console.log(`✅ [${tenant.nombre}] "${nombrePerfil}" resuelto (área: ${resultado.area}).`);
      destinatariosACrear.push({ tipo: "PERFIL", perfilId: resultado.perfilId });
    }

    if (destinatariosACrear.length === 0) {
      console.log(
        `⚠️  [${tenant.nombre}] Ningún perfil de la lista pudo resolverse — NO se crea la regla para este tenant (quedaría sin destinatarios).`,
      );
      tenantsSinNingunPerfil++;
      continue;
    }

    const regla = await prisma.reglaDestinatarios.create({
      data: {
        tenantId: tenant.id,
        evento: EVENTO,
        activa: true,
        destinatarios: { create: destinatariosACrear },
      },
    });
    console.log(
      `✅ [${tenant.nombre}] ReglaDestinatarios creada (id=${regla.id}) con ${destinatariosACrear.length} destinatario(s).`,
    );
    tenantsCreados++;
  }

  console.log(
    `\nResumen: ${tenantsCreados} tenant(s) con regla creada, ${tenantsOmitidosPorReglaExistente} omitido(s) por ya tener una regla, ${tenantsSinNingunPerfil} sin ningún perfil resoluble.`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error en el seed de ReglaDestinatarios de renovación de servicios:", e);
  process.exit(1);
});
