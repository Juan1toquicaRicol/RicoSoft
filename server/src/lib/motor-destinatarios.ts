import { prisma } from "../config/prisma";
import type { TenantPrisma } from "./tenant-prisma";
import { listarUsuariosConPermiso } from "./permissions";

/**
 * Motor genérico de destinatarios (Fase 5.3): convierte destinatarios
 * LÓGICOS (perfil, área, permiso, responsable del registro, jefe de área,
 * usuario) en un Set<userId> concreto, para que cualquier módulo pueda
 * dirigir una alerta sin conocer perfiles/departamentos/permisos por dentro.
 *
 * Principio de esta fase: SOLO se construye y prueba el motor. Ningún
 * evento real (renovación de servicios, objetivo en riesgo, etc.) se
 * dispara todavía — eso es Fase 5.4+. `resolverDestinatarios` no depende de
 * Express/req: recibe tenantId y tenantPrisma explícitos, nunca los infiere.
 */

export const TIPOS_DESTINATARIO_VALIDOS = [
  "USUARIO",
  "PERFIL",
  "AREA",
  "RESPONSABLE_REGISTRO",
  "JEFE_AREA",
  "PERMISO",
] as const;

export type TipoDestinatario = (typeof TIPOS_DESTINATARIO_VALIDOS)[number];

export interface DestinatarioLogico {
  tipo: TipoDestinatario;
  usuarioId?: string | null;
  perfilId?: string | null;
  departamentoId?: string | null;
  permisoClave?: string | null;
}

/**
 * Lo que el módulo que dispara el evento YA sabe sobre el registro que lo
 * originó — el motor nunca conoce Factura/ServicioSuscripcion/etc. por
 * nombre, solo lee estas claves genéricas. `[key: string]: unknown` permite
 * que un módulo futuro adjunte datos propios sin tener que tocar este tipo.
 */
export interface ContextoDestinatario {
  /** Usuario responsable del registro que originó el evento (ej.
   * ServicioSuscripcion.responsableId). null/undefined = sin responsable,
   * el destinatario RESPONSABLE_REGISTRO simplemente no aporta a nadie. */
  responsableId?: string | null;
  /** Departamento/área del registro origen — usado como fallback por
   * JEFE_AREA cuando el ReglaDestinatario no fija un departamentoId propio. */
  departamentoId?: string | null;
  /** Usuario "dueño" puntual del evento, si aplica (distinto de responsable). */
  usuarioId?: string | null;
  [key: string]: unknown;
}

/**
 * Valida que un destinatario lógico tenga exactamente los campos que su
 * `tipo` requiere — usado por el controller al crear/editar una
 * ReglaDestinatario, para no persistir combinaciones inválidas (ej.
 * tipo=PERFIL sin perfilId). Función pura, sin acceso a datos: no verifica
 * que el id referenciado EXISTA (eso lo hace el controller, que sí tiene
 * tenantId/tenantPrisma a mano) — solo la FORMA del destinatario.
 */
export function validarFormaDestinatario(d: DestinatarioLogico): string | null {
  if (!TIPOS_DESTINATARIO_VALIDOS.includes(d.tipo)) {
    return `Tipo de destinatario no válido: "${d.tipo}".`;
  }
  const campos = {
    usuarioId: d.usuarioId ?? null,
    perfilId: d.perfilId ?? null,
    departamentoId: d.departamentoId ?? null,
    permisoClave: d.permisoClave ?? null,
  };
  const otros = (excepto: keyof typeof campos) =>
    Object.entries(campos).filter(([k]) => k !== excepto);

  switch (d.tipo) {
    case "USUARIO":
      if (!campos.usuarioId) return "El destinatario USUARIO requiere un usuario.";
      if (otros("usuarioId").some(([, v]) => v))
        return "El destinatario USUARIO no debe traer perfil, área ni permiso.";
      return null;
    case "PERFIL":
      if (!campos.perfilId) return "El destinatario PERFIL requiere un perfil funcional.";
      if (otros("perfilId").some(([, v]) => v))
        return "El destinatario PERFIL no debe traer usuario, área ni permiso.";
      return null;
    case "AREA":
      if (!campos.departamentoId) return "El destinatario AREA requiere un área (departamento).";
      if (otros("departamentoId").some(([, v]) => v))
        return "El destinatario AREA no debe traer usuario, perfil ni permiso.";
      return null;
    case "PERMISO":
      if (!campos.permisoClave) return "El destinatario PERMISO requiere un código de permiso.";
      if (otros("permisoClave").some(([, v]) => v))
        return "El destinatario PERMISO no debe traer usuario, perfil ni área.";
      return null;
    case "RESPONSABLE_REGISTRO":
      if (Object.values(campos).some((v) => v))
        return "El destinatario RESPONSABLE_REGISTRO no debe traer ningún id — se resuelve del contexto del evento.";
      return null;
    case "JEFE_AREA":
      // departamentoId es OPCIONAL a propósito (ver comentario en
      // schema.prisma): null = usa contexto.departamentoId al resolver.
      if (campos.usuarioId || campos.perfilId || campos.permisoClave)
        return "El destinatario JEFE_AREA solo puede traer, opcionalmente, un área.";
      return null;
    default:
      return "Tipo de destinatario no reconocido.";
  }
}

/** Misma tupla lógica (tipo + el id que le corresponde) — usado para
 * rechazar destinatarios duplicados dentro de una misma regla. Dos
 * destinatarios son "el mismo" si tienen igual tipo Y el mismo id relevante
 * (RESPONSABLE_REGISTRO siempre es igual a sí mismo: solo puede haber uno). */
export function claveLogicaDestinatario(d: DestinatarioLogico): string {
  const valor = d.usuarioId ?? d.perfilId ?? d.departamentoId ?? d.permisoClave ?? "";
  return `${d.tipo}:${valor}`;
}

export function tieneDestinatariosDuplicados(destinatarios: DestinatarioLogico[]): boolean {
  const claves = destinatarios.map(claveLogicaDestinatario);
  return new Set(claves).size !== claves.length;
}

/**
 * Resuelve una lista de destinatarios lógicos (ya persistidos como
 * ReglaDestinatario, o pasados sueltos para pruebas) a un Set<userId real>.
 * Agrupa las consultas por tipo para evitar N+1 — nunca resuelve
 * destinatario por destinatario contra la base.
 *
 * Reglas de "usuario activo": un usuario inactivo, un perfil inactivo o un
 * área inactiva NUNCA aportan destinatarios — se filtran en cada consulta,
 * reutilizando exactamente los mismos campos (`activo`) que ya usa el resto
 * del sistema, sin inventar una definición nueva.
 */
export async function resolverDestinatariosDesdeLista(
  tenantId: string,
  destinatarios: DestinatarioLogico[],
  contexto: ContextoDestinatario = {},
): Promise<Set<string>> {
  const resultado = new Set<string>();
  if (destinatarios.length === 0) return resultado;

  // --- USUARIO + RESPONSABLE_REGISTRO: un solo batch de ids directos ---
  const idsUsuarioDirectos = new Set<string>();
  for (const d of destinatarios) {
    if (d.tipo === "USUARIO" && d.usuarioId) idsUsuarioDirectos.add(d.usuarioId);
  }
  const tieneResponsable = destinatarios.some((d) => d.tipo === "RESPONSABLE_REGISTRO");
  if (tieneResponsable && contexto.responsableId) idsUsuarioDirectos.add(contexto.responsableId);

  if (idsUsuarioDirectos.size > 0) {
    // H6: incluye tanto usuarios NATIVOS de este tenant como usuarios con
    // acceso vía Membresia activa — antes solo el nativo calificaba, así que
    // señalar como destinatario a alguien que solo tiene acceso por
    // membresía nunca lo notificaba.
    const idsConAcceso = await filtrarUsuariosConAccesoAlTenant([...idsUsuarioDirectos], tenantId);
    for (const id of idsConAcceso) resultado.add(id);
  }

  // --- PERFIL ---
  const idsPerfil = [
    ...new Set(
      destinatarios.filter((d) => d.tipo === "PERFIL" && d.perfilId).map((d) => d.perfilId!),
    ),
  ];
  if (idsPerfil.length > 0) {
    const perfiles = await prisma.perfilFuncional.findMany({
      where: { id: { in: idsPerfil }, tenantId, activo: true },
      select: {
        usuarios: { select: { user: { select: { id: true, activo: true } } } },
      },
    });
    const idsUsuariosDePerfil = new Set<string>();
    for (const perfil of perfiles) {
      for (const { user } of perfil.usuarios) {
        if (user.activo) idsUsuariosDePerfil.add(user.id);
      }
    }
    // El perfil ya pertenece a este tenant (whereAlcance de la query de
    // arriba); lo que faltaba validar es que CADA usuario asignado tenga
    // acceso efectivo a este tenant — nativo o vía Membresia (H6).
    if (idsUsuariosDePerfil.size > 0) {
      const idsConAcceso = await filtrarUsuariosConAccesoAlTenant(
        [...idsUsuariosDePerfil],
        tenantId,
      );
      for (const id of idsConAcceso) resultado.add(id);
    }
  }

  // --- AREA (departamento fijo del destinatario) ---
  const idsAreaFija = [
    ...new Set(
      destinatarios
        .filter((d) => d.tipo === "AREA" && d.departamentoId)
        .map((d) => d.departamentoId!),
    ),
  ];
  if (idsAreaFija.length > 0) {
    await agregarUsuariosDeDepartamentos(tenantId, idsAreaFija, resultado);
  }

  // --- JEFE_AREA (departamento del destinatario, o del contexto si no trae uno) ---
  const idsJefeArea = [
    ...new Set(
      destinatarios
        .filter((d) => d.tipo === "JEFE_AREA")
        .map((d) => d.departamentoId || contexto.departamentoId || null)
        .filter((id): id is string => !!id),
    ),
  ];
  if (idsJefeArea.length > 0) {
    const departamentosValidos = await departamentosDelTenant(tenantId, idsJefeArea);
    if (departamentosValidos.length > 0) {
      const perfilesJefe = await prisma.perfilFuncional.findMany({
        where: {
          departamentoId: { in: departamentosValidos },
          tenantId,
          activo: true,
          esJefeDeArea: true,
        },
        select: {
          usuarios: { select: { user: { select: { id: true, activo: true } } } },
        },
      });
      const idsJefesDeArea = new Set<string>();
      for (const perfil of perfilesJefe) {
        for (const { user } of perfil.usuarios) {
          if (user.activo) idsJefesDeArea.add(user.id);
        }
      }
      // H6: mismo caso que PERFIL — un jefe de área con ese perfil asignado
      // puede tener acceso a este tenant solo vía Membresia.
      if (idsJefesDeArea.size > 0) {
        const idsConAcceso = await filtrarUsuariosConAccesoAlTenant([...idsJefesDeArea], tenantId);
        for (const id of idsConAcceso) resultado.add(id);
      }
    }
  }

  // --- PERMISO: reutiliza tal cual listarUsuariosConPermiso, sin duplicar
  // el cálculo de permisos efectivos. ---
  const permisos = [
    ...new Set(
      destinatarios
        .filter((d) => d.tipo === "PERMISO" && d.permisoClave)
        .map((d) => d.permisoClave!),
    ),
  ];
  for (const permiso of permisos) {
    const ids = await listarUsuariosConPermiso(tenantId, permiso);
    for (const id of ids) resultado.add(id);
  }

  return resultado;
}

/** Departamentos GENERAL o propios de este tenant, activos, de entre los
 * ids dados — nunca un departamento exclusivo de otro tenant. */
async function departamentosDelTenant(tenantId: string, ids: string[]): Promise<string[]> {
  const departamentos = await prisma.departamento.findMany({
    where: {
      id: { in: ids },
      activo: true,
      OR: [{ tenantId: null }, { tenantId }],
    },
    select: { id: true },
  });
  return departamentos.map((d) => d.id);
}

async function agregarUsuariosDeDepartamentos(
  tenantId: string,
  departamentoIds: string[],
  resultado: Set<string>,
): Promise<void> {
  const validos = await departamentosDelTenant(tenantId, departamentoIds);
  if (validos.length === 0) return;
  // Los usuarios SIEMPRE se filtran por tenantId, aunque el departamento sea
  // GENERAL (compartido) — un departamento compartido no comparte usuarios.
  // H6: además de los NATIVOS de este departamento, se incluyen los usuarios
  // cuya Membresia activa en este tenant tiene ese mismo departamento propio
  // (ver H1 — Membresia.departamentoId ya es configurable).
  const [nativos, membresias] = await Promise.all([
    prisma.user.findMany({
      where: { departamentoId: { in: validos }, tenantId, activo: true },
      select: { id: true },
    }),
    prisma.membresia.findMany({
      where: {
        departamentoId: { in: validos },
        tenantId,
        activo: true,
        user: { activo: true },
      },
      select: { userId: true },
    }),
  ]);
  for (const u of nativos) resultado.add(u.id);
  for (const m of membresias) resultado.add(m.userId);
}

/** Ids (de entre los dados) de usuarios con acceso EFECTIVO a `tenantId`,
 * activos — ya sea porque es su tenant hogar (User.tenantId) o porque tienen
 * una Membresia activa a ese tenant (con su User hogar también activo). Base
 * compartida de H6: cualquier resolución de destinatarios por id de usuario
 * debe considerar ambos caminos, no solo el nativo. */
async function filtrarUsuariosConAccesoAlTenant(
  ids: string[],
  tenantId: string,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const [nativos, membresias] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, tenantId, activo: true },
      select: { id: true },
    }),
    prisma.membresia.findMany({
      where: { userId: { in: ids }, tenantId, activo: true, user: { activo: true } },
      select: { userId: true },
    }),
  ]);
  return [...new Set([...nativos.map((u) => u.id), ...membresias.map((m) => m.userId)])];
}

/**
 * Resuelve TODAS las ReglaDestinatarios activas de un tenant para un
 * `evento` concreto y une sus destinatarios en un solo Set<userId>. Puede
 * haber más de una regla activa para el mismo evento (ej. una agregada
 * después de otra) — se unen, no se reemplazan.
 */
export async function resolverDestinatarios(
  tenantPrisma: TenantPrisma,
  tenantId: string,
  evento: string,
  contexto: ContextoDestinatario = {},
): Promise<Set<string>> {
  const reglas = await tenantPrisma.reglaDestinatarios.findMany({
    where: { tenantId, evento, activa: true },
    include: { destinatarios: true },
  });
  if (reglas.length === 0) return new Set();

  const todos = reglas.flatMap((r) => r.destinatarios) as DestinatarioLogico[];
  return resolverDestinatariosDesdeLista(tenantId, todos, contexto);
}
