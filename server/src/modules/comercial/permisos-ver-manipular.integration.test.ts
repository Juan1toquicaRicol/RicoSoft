import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

/**
 * Cubre las pruebas mínimas pedidas para el modelo Módulo → Sección →
 * Ver/Manipular, piloto en Comercial (Cotizaciones/Proformas/Pedidos):
 *   1. VER solo permite consultar, nunca modificar.
 *   2. VER + GESTIONAR permite consultar y modificar.
 *   3. Sin VER: backend rechaza (403) y el endpoint agregado no expone nada
 *      de esa sección.
 *   4. Permisos de una sección no dan acceso a otra.
 *   5. Sin ninguna sección Comercial: la bandeja agregada rechaza (403).
 *   6. Aislamiento multi-tenant.
 *   7. asegurarCatalogoSembrado crea los códigos nuevos sin duplicarlos.
 *   8. Los permisos especiales existentes (aprobar, borrado de superadmin)
 *      se conservan intactos.
 *
 * Se salta si RUN_DB_INTEGRATION_TESTS no está en "true", mismo patrón que el
 * resto de la suite (ver comercial.integration.test.ts).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Comercial — permisos Ver/Manipular (Cotizaciones/Proformas/Pedidos)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let otroTenantId: string;
  let tokenSoloVerCotizaciones: string;
  let tokenVerYGestionarCotizaciones: string;
  let tokenSinNada: string;
  let tokenAdmin: string;
  let tokenSoloVerCotizacionesOtroTenant: string;
  let cotizacionIdTenantPrincipal: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  };

  const crearUsuarioConPermisos = async (
    tenant: string,
    nombre: string,
    permisos: string[],
  ): Promise<string> => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const rol = await prisma.rol.create({
      data: {
        tenantId: tenant,
        nombre: `Rol ${nombre}`,
        permisos: JSON.stringify(permisos),
      },
    });
    const email = `${nombre}-${sufijo}@test.ricosoft.local`;
    await prisma.user.create({
      data: {
        tenantId: tenant,
        email,
        passwordHash,
        nombre,
        isSuperadmin: false,
        activo: true,
        rolId: rol.id,
      },
    });
    return login(email);
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenant = await prisma.tenant.create({
      data: { nombre: `Test VerManipular ${sufijo}`, subdomain: `test-vermanip-${sufijo}` },
    });
    const otroTenant = await prisma.tenant.create({
      data: { nombre: `Test VerManipular Otro ${sufijo}`, subdomain: `test-vermanip-otro-${sufijo}` },
    });
    tenantId = tenant.id;
    otroTenantId = otroTenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `admin-vermanip-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin",
        isSuperadmin: true,
        activo: true,
      },
    });
    tokenAdmin = await login(`admin-vermanip-${sufijo}@test.ricosoft.local`);

    tokenSoloVerCotizaciones = await crearUsuarioConPermisos(tenantId, "solo-ver-cot", [
      PERMISOS_SISTEMA.COTIZACIONES_VER,
    ]);
    tokenVerYGestionarCotizaciones = await crearUsuarioConPermisos(tenantId, "ver-gestionar-cot", [
      PERMISOS_SISTEMA.COTIZACIONES_VER,
      PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR,
    ]);
    tokenSinNada = await crearUsuarioConPermisos(tenantId, "sin-nada", []);
    tokenSoloVerCotizacionesOtroTenant = await crearUsuarioConPermisos(
      otroTenantId,
      "otro-tenant-ver-cot",
      [PERMISOS_SISTEMA.COTIZACIONES_VER],
    );

    // Una cotización real en el tenant principal, creada por el admin, para
    // usarla como target de lectura/escritura en los tests de abajo.
    const crear = await request(app)
      .post("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({
        clienteRowId: 9001,
        clienteNombre: "Cliente Ver/Manipular",
        items: [
          {
            descripcion: "Producto",
            cantidad: 1,
            precioUnitario: 1000,
            descuentoPct: 0,
            ivaPct: 19,
          },
        ],
      });
    cotizacionIdTenantPrincipal = crear.body.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantId, otroTenantId];
    await prisma.pedidoComercialItem.deleteMany({
      where: { pedido: { tenantId: { in: tenantIds } } },
    });
    await prisma.pedidoComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proformaItem.deleteMany({ where: { proforma: { tenantId: { in: tenantIds } } } });
    await prisma.proforma.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.cotizacionItem.deleteMany({ where: { cotizacion: { tenantId: { in: tenantIds } } } });
    await prisma.cotizacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.permiso.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.configuracionComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("1. VER solo: puede listar y leer cotizaciones, pero NO crear ni editar", async () => {
    const lista = await request(app)
      .get("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${tokenSoloVerCotizaciones}`);
    expect(lista.status).toBe(200);

    const detalle = await request(app)
      .get(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${tokenSoloVerCotizaciones}`);
    expect(detalle.status).toBe(200);

    const crear = await request(app)
      .post("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${tokenSoloVerCotizaciones}`)
      .send({ clienteRowId: 1, clienteNombre: "X", items: [] });
    expect(crear.status).toBe(403);

    const editar = await request(app)
      .patch(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${tokenSoloVerCotizaciones}`)
      .send({ vendedorNombre: "Nuevo" });
    expect(editar.status).toBe(403);
  });

  it("2. VER + GESTIONAR: puede consultar Y modificar", async () => {
    const detalle = await request(app)
      .get(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${tokenVerYGestionarCotizaciones}`);
    expect(detalle.status).toBe(200);

    const editar = await request(app)
      .patch(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${tokenVerYGestionarCotizaciones}`)
      .send({
        clienteRowId: 9001,
        clienteNombre: "Cliente Ver/Manipular",
        vendedorNombre: "Editado por Manipular",
        items: [
          {
            descripcion: "Producto",
            cantidad: 1,
            precioUnitario: 1000,
            descuentoPct: 0,
            ivaPct: 19,
          },
        ],
      });
    expect(editar.status).toBe(200);
    expect(editar.body.vendedorNombre).toBe("Editado por Manipular");
  });

  it("3. Sin cotizaciones.ver: backend rechaza listar/leer/crear con 403", async () => {
    const lista = await request(app)
      .get("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${tokenSinNada}`);
    expect(lista.status).toBe(403);

    const detalle = await request(app)
      .get(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${tokenSinNada}`);
    expect(detalle.status).toBe(403);
  });

  it("4. Un permiso de una sección no da acceso a otra sección (cotizaciones.ver no habilita Proformas)", async () => {
    const proformas = await request(app)
      .get("/api/proformas")
      .set("Authorization", `Bearer ${tokenSoloVerCotizaciones}`);
    expect(proformas.status).toBe(403);

    const pedidos = await request(app)
      .get("/api/comercial/pedidos")
      .set("Authorization", `Bearer ${tokenSoloVerCotizaciones}`);
    expect(pedidos.status).toBe(403);
  });

  it("5. Sin ninguna sección Comercial: la bandeja agregada /comercial/documentos rechaza con 403", async () => {
    const res = await request(app)
      .get("/api/comercial/documentos")
      .set("Authorization", `Bearer ${tokenSinNada}`);
    expect(res.status).toBe(403);
  });

  it(
    "5b. Con VER de una sola sección, la bandeja agregada solo expone esa sección " +
      "(no filtra por tipo=cotizacion, filtra a nivel de servidor)",
    async () => {
      const res = await request(app)
        .get("/api/comercial/documentos")
        .set("Authorization", `Bearer ${tokenSoloVerCotizaciones}`);
      expect(res.status).toBe(200);
      const tipos = new Set((res.body.items as Array<{ tipo: string }>).map((d) => d.tipo));
      expect(tipos.has("proforma")).toBe(false);
      expect(tipos.has("pedido")).toBe(false);
    },
  );

  it("6. Aislamiento multi-tenant: cotizaciones.ver de un tenant no ve datos de otro tenant", async () => {
    const detalle = await request(app)
      .get(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${tokenSoloVerCotizacionesOtroTenant}`);
    expect([403, 404]).toContain(detalle.status);

    const lista = await request(app)
      .get("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${tokenSoloVerCotizacionesOtroTenant}`);
    expect(lista.status).toBe(200);
    const ids = (lista.body.items ?? lista.body).map?.((c: { id: string }) => c.id) ?? [];
    expect(ids).not.toContain(cotizacionIdTenantPrincipal);
  });

  it("7. asegurarCatalogoSembrado crea los códigos nuevos (ver/manipular) sin duplicarlos", async () => {
    // La reconciliación corre dentro de listarCatalogoPermisos (GET
    // /api/permisos) — dispararla explícitamente antes de comprobar, y
    // llamarla dos veces para confirmar que no duplica filas.
    tokenAdmin = await login(`admin-vermanip-${sufijo}@test.ricosoft.local`);
    const catalogo1 = await request(app)
      .get("/api/permisos")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(catalogo1.status).toBe(200);
    const catalogo2 = await request(app)
      .get("/api/permisos")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(catalogo2.status).toBe(200);

    const nuevosCodigos = [
      PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR,
      PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR,
      PERMISOS_SISTEMA.PROFORMAS_VER,
      PERMISOS_SISTEMA.PROFORMAS_GESTIONAR,
    ];

    for (const codigo of nuevosCodigos) {
      const filas = await prisma.permiso.findMany({ where: { tenantId, codigo } });
      expect(filas.length).toBe(1);
      expect(filas[0].esSistema).toBe(true);
    }
  });

  it("8. Los permisos especiales existentes siguen intactos: aprobar y borrado permanente (superadmin)", async () => {
    // COTIZACIONES_GESTIONAR no debe alcanzar para aprobar — sigue exigiendo
    // el permiso especial COTIZACIONES_APROBAR.
    const aprobar = await request(app)
      .post(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}/aprobar`)
      .set("Authorization", `Bearer ${tokenVerYGestionarCotizaciones}`)
      .send({});
    expect(aprobar.status).toBe(403);

    // El borrado PERMANENTE sigue exigiendo superadmin — VER+GESTIONAR no basta.
    const eliminar = await request(app)
      .delete(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${tokenVerYGestionarCotizaciones}`);
    expect(eliminar.status).toBe(403);
  });

  it("9. GESTIONAR sin VER no autoriza nada: el prerrequisito se exige en el middleware", async () => {
    const token = await crearUsuarioConPermisos(tenantId, "solo-gestionar-cot", [
      PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR,
    ]);

    const crear = await request(app)
      .post("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 1,
        clienteNombre: "X",
        items: [{ descripcion: "P", cantidad: 1, precioUnitario: 1, descuentoPct: 0, ivaPct: 19 }],
      });
    expect(crear.status).toBe(403);

    const lista = await request(app)
      .get("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${token}`);
    expect(lista.status).toBe(403);
  });

  it("10. Un permiso especial (aprobar) depende de VER, no de GESTIONAR: existe el aprobador puro", async () => {
    const token = await crearUsuarioConPermisos(tenantId, "aprobador-puro", [
      PERMISOS_SISTEMA.COTIZACIONES_VER,
      PERMISOS_SISTEMA.COTIZACIONES_APROBAR,
    ]);

    // Puede leer...
    const detalle = await request(app)
      .get(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detalle.status).toBe(200);

    // ...pero NO editar: aprobar no concede escritura ordinaria.
    const editar = await request(app)
      .patch(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ clienteRowId: 9001, clienteNombre: "X", items: [] });
    expect(editar.status).toBe(403);

    // ...ni enviar/anular, que ahora son operaciones de GESTIONAR.
    const enviar = await request(app)
      .post(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}/enviar`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(enviar.status).toBe(403);
  });

  it("11. Crear Proforma desde Cotización exige gestionar en AMBAS secciones (P-02)", async () => {
    // Antes bastaba con cotizaciones.aprobar: la Proforma se creaba invocando
    // el handler de Proformas directamente, saltándose su permiso.
    const soloCotizaciones = await crearUsuarioConPermisos(tenantId, "cot-sin-proformas", [
      PERMISOS_SISTEMA.COTIZACIONES_VER,
      PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR,
      PERMISOS_SISTEMA.COTIZACIONES_APROBAR,
    ]);
    const bloqueado = await request(app)
      .post(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}/proforma`)
      .set("Authorization", `Bearer ${soloCotizaciones}`)
      .send({});
    expect(bloqueado.status).toBe(403);

    // Ninguna proforma pudo colarse a la base por esa vía.
    const proformas = await prisma.proforma.count({ where: { tenantId } });
    expect(proformas).toBe(0);

    // Con gestionar en ambas secciones sí procede.
    const ambas = await crearUsuarioConPermisos(tenantId, "cot-y-proformas", [
      PERMISOS_SISTEMA.COTIZACIONES_VER,
      PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR,
      PERMISOS_SISTEMA.PROFORMAS_VER,
      PERMISOS_SISTEMA.PROFORMAS_GESTIONAR,
    ]);
    const permitido = await request(app)
      .post(`/api/comercial/cotizaciones/${cotizacionIdTenantPrincipal}/proforma`)
      .set("Authorization", `Bearer ${ambas}`)
      .send({});
    expect(permitido.status).toBe(201);
  });

  it("12. Compatibilidad: un rol guardado con el código legacy sigue funcionando", async () => {
    // Rol viejo que todavía tiene "cotizaciones.manipular" (o el CRUD
    // granular previo): expandirLegacy debe concederle el código nuevo sin
    // que nadie tenga que migrar el dato.
    const token = await crearUsuarioConPermisos(tenantId, "rol-legacy", [
      PERMISOS_SISTEMA.COTIZACIONES_VER,
      "cotizaciones.manipular",
    ]);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.user.permisos).toContain(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR);

    // Y la autorización real lo acepta (no solo el cálculo de permisos).
    const crear = await request(app)
      .post("/api/comercial/cotizaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 9002,
        clienteNombre: "Cliente Legacy",
        items: [
          { descripcion: "Producto", cantidad: 1, precioUnitario: 1000, descuentoPct: 0, ivaPct: 19 },
        ],
      });
    expect(crear.status).toBe(201);
  });

  it("13. Migración progresiva: la pantalla de Roles ve el código legacy ya traducido", async () => {
    const rol = await prisma.rol.create({
      data: {
        tenantId,
        nombre: `Rol legacy visible ${sufijo}`,
        permisos: JSON.stringify([PERMISOS_SISTEMA.COTIZACIONES_VER, "cotizaciones.manipular"]),
      },
    });

    const lista = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${tokenAdmin}`);
    expect(lista.status).toBe(200);

    const devuelto = (lista.body as Array<{ id: string; permisos: string[] }>).find(
      (r) => r.id === rol.id,
    );
    // El administrador ve "Cotizaciones · Gestionar" marcado, no un código
    // muerto sin casilla — así el primer guardado migra el rol sin pérdida.
    expect(devuelto?.permisos).toContain(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR);
    expect(devuelto?.permisos).not.toContain("cotizaciones.manipular");

    // El dato en base sigue intacto hasta que alguien guarde el rol.
    const enBase = await prisma.rol.findUnique({ where: { id: rol.id } });
    expect(enBase?.permisos).toContain("cotizaciones.manipular");
  });
});
