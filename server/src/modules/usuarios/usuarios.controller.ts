import { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";
import { validarPasswordSegura } from "../../lib/password";
import { esDominioCorporativoValido } from "../../lib/dominios";

const JWT_SECRET = process.env.JWT_SECRET as string;

/**
 * Actualiza el perfil del usuario autenticado. Solo puede modificar sus
 * propios datos: el id se toma exclusivamente de req.user (del JWT), nunca
 * de req.params ni req.body, por lo que no es posible editar a otro usuario
 * manipulando un identificador en la petición (IDOR). Campos administrativos
 * (rol, departamento, permisos, estado, email) no se aceptan aquí: solo se
 * gestionan desde los endpoints administrativos protegidos por permiso.
 */
export const actualizarPerfilPropio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    // Forma del body ya validada por validarBody(actualizarPerfilPropioSchema).
    const { nombre, telefono } = req.body;

    const telefonoLimpio = typeof telefono === "string" ? telefono.trim() : "";
    if (telefonoLimpio && !/^[0-9+()\-\s]{6,20}$/.test(telefonoLimpio)) {
      return res.status(400).json({ message: "El teléfono no tiene un formato válido." });
    }

    const actualizado = await prisma.user.update({
      where: { id: userId },
      data: { nombre: nombre.trim(), telefono: telefonoLimpio || null },
      select: { id: true, nombre: true, email: true, telefono: true },
    });

    await prisma.auditoria.create({
      data: {
        tenantId: req.user!.tenantId,
        usuarioId: userId,
        usuarioAfectado: actualizado.email,
        accion: "PERFIL_ACTUALIZADO",
        detalle: `${actualizado.nombre} actualizó su información de perfil.`,
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al actualizar perfil propio:", error);
    return res.status(500).json({ message: "Error al actualizar el perfil." });
  }
};

/**
 * Cambia la contraseña del usuario autenticado. Requiere confirmar la
 * contraseña actual (comparada contra el hash existente con bcrypt, el mismo
 * mecanismo usado en login/registro) antes de aceptar la nueva.
 */
export const cambiarPasswordPropio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { passwordActual, passwordNueva, confirmarPassword } = req.body;

    if (passwordNueva !== confirmarPassword) {
      return res
        .status(400)
        .json({ message: "La confirmación no coincide con la nueva contraseña." });
    }
    const errorPassword = validarPasswordSegura(passwordNueva);
    if (errorPassword) {
      return res.status(400).json({ message: errorPassword });
    }

    const usuario = await prisma.user.findUnique({ where: { id: userId } });
    if (!usuario) return res.status(404).json({ message: "Usuario no encontrado." });

    const esValida = await bcrypt.compare(passwordActual, usuario.passwordHash);
    if (!esValida) {
      return res.status(401).json({ message: "La contraseña actual no es correcta." });
    }

    // Incrementar tokenVersion invalida cualquier JWT emitido antes de este
    // cambio (robado o de otra sesión activa). Se emite un token nuevo abajo
    // para que la sesión actual del propio usuario no se corte.
    const nuevoHash = await bcrypt.hash(passwordNueva, 10);
    const actualizado = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nuevoHash, tokenVersion: { increment: 1 } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId: usuario.tenantId,
        usuarioId: userId,
        usuarioAfectado: usuario.email,
        accion: "PASSWORD_CAMBIADA",
        detalle: `${usuario.nombre} cambió su contraseña.`,
      },
    });

    // req.user!.tenantId (no usuario.tenantId) a propósito: preserva el
    // tenant de la sesión ACTIVA. usuario.tenantId es siempre el tenant
    // "hogar" — si se usara aquí, alguien que cambia su contraseña estando
    // logueado en una empresa por membresía sería devuelto en silencio a su
    // empresa hogar, sin haberlo pedido.
    const nuevoToken = jwt.sign(
      { sub: actualizado.id, tv: actualizado.tokenVersion, tenantId: req.user!.tenantId },
      JWT_SECRET,
      { expiresIn: "8h" },
    );

    return res.json({ message: "Contraseña actualizada correctamente.", token: nuevoToken });
  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    return res.status(500).json({ message: "Error al cambiar la contraseña." });
  }
};

/**
 * Usuarios activos de un departamento (solo id + nombre), para poblar el
 * selector de "Responsable" en formularios operativos (Facturas, Solicitudes
 * de Compra) una vez elegida el área. No requiere el permiso administrativo
 * "usuarios.ver": cualquier usuario autenticado que registre una factura o
 * solicitud necesita poder elegir a quién asignársela.
 */
export const listarUsuariosPorDepartamento = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { departamentoId } = req.params;

    const usuarios = await prisma.user.findMany({
      where: { tenantId, departamentoId, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    return res.json(usuarios);
  } catch (error) {
    console.error("Error al listar usuarios por departamento:", error);
    return res.status(500).json({ message: "Error al obtener los usuarios del departamento." });
  }
};

export const listarUsuarios = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20),
    );

    const where = {
      tenantId,
      ...(search
        ? {
            OR: [{ nombre: { contains: search } }, { email: { contains: search } }],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          rolId: true,
          activo: true,
          isSuperadmin: true,
          createdAt: true,
          lastLoginAt: true,
          rolRel: { select: { id: true, nombre: true } },
          departamentoId: true,
          departamento: { select: { id: true, nombre: true } },
        },
        orderBy: { nombre: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({ data, total, page, pageSize });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return res.status(500).json({ message: "Error al obtener usuarios." });
  }
};

/**
 * Alta administrativa de usuario. A diferencia del autoregistro público
 * (POST /auth/register), aquí el administrador puede fijar rol y
 * departamento desde el inicio. El tenant nunca sale del body: siempre es el
 * del administrador que ejecuta la acción, para no poder crear un usuario en
 * otra empresa. No acepta `isSuperadmin`: esa bandera no es asignable por
 * API en ningún endpoint del sistema.
 */
export const crearUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    // Forma del body ya validada por validarBody(crearUsuarioSchema).
    const { nombre, email, password, departamentoId, rolId } = req.body;

    if (!esDominioCorporativoValido(email)) {
      return res.status(400).json({
        message: "Solo se permiten correos corporativos autorizados.",
      });
    }
    const errorPassword = validarPasswordSegura(password);
    if (errorPassword) {
      return res.status(400).json({ message: errorPassword });
    }

    const emailLimpio = email.trim().toLowerCase();
    const existente = await prisma.user.findUnique({ where: { email: emailLimpio } });
    if (existente) {
      return res.status(409).json({ message: "Ese correo electrónico ya está en uso." });
    }

    if (departamentoId) {
      const departamento = await prisma.departamento.findFirst({
        where: { id: departamentoId, ...whereAlcance(tenantId) },
      });
      if (!departamento) {
        return res.status(404).json({ message: "El departamento seleccionado no existe." });
      }
    }
    if (rolId) {
      const rol = await prisma.rol.findFirst({
        where: { id: rolId, ...whereAlcance(tenantId), activo: true },
      });
      if (!rol) {
        return res.status(404).json({ message: "El rol seleccionado no existe o está inactivo." });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const nuevo = await prisma.user.create({
      data: {
        tenantId,
        nombre: nombre.trim(),
        email: emailLimpio,
        passwordHash,
        departamentoId: departamentoId || null,
        rolId: rolId || null,
        activo: true,
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        activo: true,
        departamentoId: true,
        departamento: { select: { id: true, nombre: true } },
        rolId: true,
        rolRel: { select: { id: true, nombre: true } },
        createdAt: true,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: nuevo.email,
        accion: "USUARIO_CREADO",
        detalle: `${req.user!.nombre} creó la cuenta de ${nuevo.email}`,
        entidadTipo: "User",
        entidadId: nuevo.id,
        datosNuevos: JSON.stringify({
          nombre: nuevo.nombre,
          email: nuevo.email,
          departamentoId: nuevo.departamentoId,
          rolId: nuevo.rolId,
        }),
      },
    });

    return res.status(201).json(nuevo);
  } catch (error) {
    console.error("Error al crear usuario:", error);
    return res.status(500).json({ message: "Error al crear el usuario." });
  }
};

export const cambiarEstadoUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Forma del body ya validada por validarBody(cambiarEstadoSchema).
    const { activo } = req.body;
    const tenantId = req.user!.tenantId;

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (!activo && usuario.isSuperadmin) {
      const superadminsActivos = await prisma.user.count({
        where: { tenantId, isSuperadmin: true, activo: true },
      });
      if (superadminsActivos <= 1) {
        return res.status(409).json({
          message: "No se puede desactivar al último superadministrador del sistema.",
        });
      }
    }

    const actualizado = await prisma.user.update({
      where: { id },
      data: { activo },
      select: { id: true, nombre: true, email: true, activo: true },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: actualizado.email,
        accion: activo ? "USUARIO_ACTIVADO" : "USUARIO_DESACTIVADO",
        detalle: `${req.user!.nombre} ${activo ? "activó" : "desactivó"} la cuenta de ${actualizado.email}`,
        entidadTipo: "User",
        entidadId: id,
        datosAnteriores: JSON.stringify({ activo: usuario.activo }),
        datosNuevos: JSON.stringify({ activo: actualizado.activo }),
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al cambiar estado del usuario:", error);
    return res.status(500).json({ error: "Error al actualizar estado" });
  }
};

export const asignarRolUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Forma del body ya validada por validarBody(asignarRolSchema).
    const { rolId } = req.body;
    const tenantId = req.user!.tenantId;

    // Nadie puede reasignarse su propio rol, ni siquiera con el permiso
    // usuarios.cambiar_rol: evita que un usuario se otorgue a sí mismo un rol
    // con más privilegios que el que un administrador le asignó.
    if (id === req.user!.id) {
      return res.status(409).json({ message: "No puedes cambiar tu propio rol." });
    }

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (usuario.isSuperadmin) {
      return res
        .status(409)
        .json({ message: "No se puede reasignar el rol de un superadministrador." });
    }

    if (rolId !== null) {
      const rol = await prisma.rol.findFirst({
        where: { id: rolId, ...whereAlcance(tenantId), activo: true },
      });
      if (!rol) {
        return res.status(404).json({ message: "El rol seleccionado no existe o está inactivo." });
      }
    }

    const actualizado = await prisma.user.update({
      where: { id },
      data: { rolId },
      select: {
        id: true,
        nombre: true,
        email: true,
        rolId: true,
        rolRel: { select: { id: true, nombre: true } },
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: actualizado.email,
        accion: "USUARIO_ROL_CAMBIADO",
        detalle: `${req.user!.nombre} asignó el rol "${actualizado.rolRel?.nombre ?? "Sin rol"}" a ${actualizado.email}`,
        entidadTipo: "User",
        entidadId: id,
        datosAnteriores: JSON.stringify({ rolId: usuario.rolId }),
        datosNuevos: JSON.stringify({ rolId: actualizado.rolId }),
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al asignar rol al usuario:", error);
    return res.status(500).json({ message: "Error al asignar el rol." });
  }
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const cambiarEmailUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const tenantId = req.user!.tenantId;

    if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: "El correo electrónico no tiene un formato válido." });
    }
    const emailNuevo = email.trim().toLowerCase();

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (emailNuevo === usuario.email.toLowerCase()) {
      return res.json({ id: usuario.id, nombre: usuario.nombre, email: usuario.email });
    }

    // El email es único a nivel global (no solo por tenant), según el schema.
    const enUso = await prisma.user.findUnique({ where: { email: emailNuevo } });
    if (enUso) {
      return res.status(409).json({ message: "Ese correo electrónico ya está en uso." });
    }

    const actualizado = await prisma.user.update({
      where: { id },
      data: { email: emailNuevo },
      select: { id: true, nombre: true, email: true },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: actualizado.email,
        accion: "USUARIO_EMAIL_CAMBIADO",
        detalle: `${req.user!.nombre} cambió el correo de "${usuario.email}" a "${actualizado.email}"`,
        entidadTipo: "User",
        entidadId: id,
        datosAnteriores: JSON.stringify({ email: usuario.email }),
        datosNuevos: JSON.stringify({ email: actualizado.email }),
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al cambiar el correo del usuario:", error);
    return res.status(500).json({ message: "Error al cambiar el correo electrónico." });
  }
};

/**
 * Restablece la contraseña de otro usuario (acción administrativa). A
 * diferencia de cambiarPasswordPropio, no exige la contraseña actual: quien
 * la ejecuta ya demostró tener el permiso "usuarios.reset_password".
 */
export const resetPasswordUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { passwordNueva } = req.body;
    const tenantId = req.user!.tenantId;

    const errorPassword = validarPasswordSegura(passwordNueva);
    if (errorPassword) {
      return res.status(400).json({ message: errorPassword });
    }

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    // Incrementar tokenVersion cierra cualquier sesión activa de ESE usuario:
    // un reset de contraseña administrativo debe forzarlo a volver a iniciar
    // sesión con la nueva clave, en cualquier dispositivo donde estuviera conectado.
    const nuevoHash = await bcrypt.hash(passwordNueva, 10);
    await prisma.user.update({
      where: { id },
      data: { passwordHash: nuevoHash, tokenVersion: { increment: 1 } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: usuario.email,
        accion: "USUARIO_PASSWORD_RESET",
        detalle: `${req.user!.nombre} restableció la contraseña de ${usuario.email}`,
      },
    });

    return res.json({ message: "Contraseña restablecida correctamente." });
  } catch (error) {
    console.error("Error al restablecer la contraseña:", error);
    return res.status(500).json({ message: "Error al restablecer la contraseña." });
  }
};

/**
 * Elimina permanentemente a un usuario. Un usuario con historial (facturas,
 * solicitudes resueltas, auditoría) no se puede borrar por integridad
 * referencial: se le pide al administrador desactivarlo en su lugar para no
 * perder la trazabilidad de sus acciones pasadas.
 */
export const eliminarUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    if (id === req.user!.id) {
      return res.status(409).json({ message: "No puedes eliminar tu propia cuenta." });
    }

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (usuario.isSuperadmin) {
      const superadminsActivos = await prisma.user.count({
        where: { tenantId, isSuperadmin: true },
      });
      if (superadminsActivos <= 1) {
        return res.status(409).json({
          message: "No se puede eliminar al último superadministrador del sistema.",
        });
      }
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch {
      // Violación de FK: el usuario tiene historial asociado (auditoría,
      // solicitudes resueltas, etc.) y no puede borrarse sin perder trazabilidad.
      return res.status(409).json({
        message:
          "Este usuario tiene historial asociado (auditoría, solicitudes u otros registros) y no se puede eliminar. Desactívalo en su lugar.",
      });
    }

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: usuario.email,
        accion: "USUARIO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó la cuenta de ${usuario.email}`,
        entidadTipo: "User",
        entidadId: id,
        datosAnteriores: JSON.stringify({
          nombre: usuario.nombre,
          email: usuario.email,
          activo: usuario.activo,
        }),
      },
    });

    return res.json({ message: "Usuario eliminado correctamente." });
  } catch (error) {
    console.error("Error al eliminar el usuario:", error);
    return res.status(500).json({ message: "Error al eliminar el usuario." });
  }
};

export const asignarDepartamentoUsuario = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Forma del body ya validada por validarBody(asignarDepartamentoSchema).
    const { departamentoId } = req.body;
    const tenantId = req.user!.tenantId;

    // Aislamiento multi-tenant: no permitir operar sobre usuarios de otra empresa (IDOR)
    const usuario = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado." });
    }

    if (departamentoId !== null) {
      const departamento = await prisma.departamento.findFirst({
        where: { id: departamentoId, ...whereAlcance(tenantId) },
      });
      if (!departamento) {
        return res.status(404).json({ message: "El departamento seleccionado no existe." });
      }
    }

    const actualizado = await prisma.user.update({
      where: { id },
      data: { departamentoId },
      select: {
        id: true,
        nombre: true,
        email: true,
        departamentoId: true,
        departamento: { select: { id: true, nombre: true } },
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: actualizado.email,
        accion: "USUARIO_DEPARTAMENTO_CAMBIADO",
        detalle: `${req.user!.nombre} asignó el departamento "${actualizado.departamento?.nombre ?? "Sin departamento"}" a ${actualizado.email}`,
        entidadTipo: "User",
        entidadId: id,
        datosAnteriores: JSON.stringify({ departamentoId: usuario.departamentoId }),
        datosNuevos: JSON.stringify({ departamentoId: actualizado.departamentoId }),
      },
    });

    return res.json(actualizado);
  } catch (error) {
    console.error("Error al asignar departamento al usuario:", error);
    return res.status(500).json({ message: "Error al asignar el departamento." });
  }
};
