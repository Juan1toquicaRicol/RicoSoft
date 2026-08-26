import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// Genera una contraseña aleatoria (no una constante predecible como
// "password123") para el superadmin de respaldo. Se imprime una sola vez en
// consola: quien corra el seed debe copiarla e iniciar sesión con ella.
function generarPasswordAleatoria(): string {
    return crypto.randomBytes(18).toString('base64url');
}

const DIA_MS = 24 * 60 * 60 * 1000;
const hoy = () => new Date();
const enDias = (n: number) => new Date(Date.now() + n * DIA_MS);

async function main() {
    console.log('🌱 Iniciando seed...\n');

    // 1. Crear o encontrar el tenant "demo" (hoy es el único tenant real del sistema)
    let tenant = await prisma.tenant.findUnique({
        where: { subdomain: 'demo' },
    });

    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                nombre: 'Empresa Demo S.A.',
                subdomain: 'demo',
            },
        });
        console.log(`✅ Tenant creado: ${tenant.nombre} (${tenant.id})`);
    } else {
        console.log(`ℹ️  Tenant ya existe: ${tenant.nombre} (${tenant.id})`);
    }

    // 2. Solo crear un admin de respaldo si el tenant no tiene NINGÚN
    // superadministrador activo todavía. Si ya hay cuentas reales (como en
    // este ambiente), no se toca nada de usuarios.
    const superadminsActivos = await prisma.user.count({
        where: { tenantId: tenant.id, isSuperadmin: true, activo: true },
    });

    let actor = await prisma.user.findFirst({
        where: { tenantId: tenant.id, isSuperadmin: true, activo: true },
        orderBy: { createdAt: 'asc' },
    });

    if (superadminsActivos === 0) {
        const passwordGenerada = generarPasswordAleatoria();
        const passwordHash = await bcrypt.hash(passwordGenerada, 10);
        actor = await prisma.user.create({
            data: {
                tenantId: tenant.id,
                email: 'admin@demo.com',
                passwordHash,
                nombre: 'Administrador',
                rol: 'ADMIN',
                isSuperadmin: true,
                activo: true,
            },
        });
        console.log(`✅ Usuario admin de respaldo creado: ${actor.email}`);
        console.log(`   Contraseña (solo se muestra esta vez): ${passwordGenerada}`);
        console.log('   Cámbiala en cuanto inicies sesión.');
    } else {
        console.log(`ℹ️  Ya existen ${superadminsActivos} superadministrador(es) activo(s); no se crea admin de respaldo.`);
    }

    if (!actor) {
        throw new Error('No fue posible determinar un usuario actor para el seed de datos.');
    }

    // 3. Departamentos: se reutilizan los que ya existan en el tenant. Solo se
    // crea un set base mínimo si el tenant no tiene ninguno todavía.
    let departamentos = await prisma.departamento.findMany({ where: { tenantId: tenant.id, activo: true } });
    if (departamentos.length === 0) {
        const departamentosBase = ['Sistemas', 'Contabilidad', 'Produccion', 'Gestión Humana', 'Gerencia'];
        for (const nombre of departamentosBase) {
            await prisma.departamento.create({ data: { tenantId: tenant.id, nombre, activo: true } });
        }
        departamentos = await prisma.departamento.findMany({ where: { tenantId: tenant.id, activo: true } });
        console.log(`✅ Departamentos base creados: ${departamentosBase.join(', ')}`);
    } else {
        console.log(`ℹ️  Usando ${departamentos.length} departamento(s) ya existentes en el tenant.`);
    }
    const areaAl = (i: number) => departamentos[i % departamentos.length]?.nombre ?? 'Sistemas';

    // 4. Facturas de demostración: números con prefijo "FE-3" para no chocar
    // con numeración real ya usada en este tenant.
    type FacturaDemo = {
        numero: string; proveedor: string; nit: string; subtotal: number; iva: number;
        estado: 'Pendiente' | 'Aprobada' | 'Rechazada' | 'Pagada'; vence: Date; areaIdx: number;
        prioridad: 'Alta' | 'Media' | 'Baja';
    };
    const proveedores = [
        { nombre: 'Suministros Andinos S.A.S.', nit: '900.123.456-1' },
        { nombre: 'ColombiaHosting', nit: '900.556.234-7' },
        { nombre: 'InfoTech Soluciones', nit: '900.789.012-3' },
        { nombre: 'Distribuidora Nacional de Papelería', nit: '800.445.221-9' },
        { nombre: 'Transportes Rápido Ltda.', nit: '900.223.998-5' },
        { nombre: 'Ferretería Industrial del Cauca', nit: '891.302.775-2' },
    ];
    const facturasDemo: FacturaDemo[] = [
        { numero: 'FE-30001', proveedor: proveedores[0].nombre, nit: proveedores[0].nit, subtotal: 4200000, iva: 798000, estado: 'Pendiente', vence: enDias(-6), areaIdx: 0, prioridad: 'Alta' },
        { numero: 'FE-30002', proveedor: proveedores[1].nombre, nit: proveedores[1].nit, subtotal: 1500000, iva: 285000, estado: 'Pendiente', vence: enDias(-2), areaIdx: 0, prioridad: 'Alta' },
        { numero: 'FE-30003', proveedor: proveedores[2].nombre, nit: proveedores[2].nit, subtotal: 2100000, iva: 399000, estado: 'Pendiente', vence: enDias(9), areaIdx: 0, prioridad: 'Media' },
        { numero: 'FE-30004', proveedor: proveedores[3].nombre, nit: proveedores[3].nit, subtotal: 680000, iva: 129200, estado: 'Pendiente', vence: enDias(14), areaIdx: 3, prioridad: 'Baja' },
        { numero: 'FE-30005', proveedor: proveedores[4].nombre, nit: proveedores[4].nit, subtotal: 3300000, iva: 627000, estado: 'Pendiente', vence: enDias(20), areaIdx: 2, prioridad: 'Media' },
        { numero: 'FE-30006', proveedor: proveedores[5].nombre, nit: proveedores[5].nit, subtotal: 950000, iva: 180500, estado: 'Pendiente', vence: enDias(25), areaIdx: 2, prioridad: 'Baja' },
        { numero: 'FE-30007', proveedor: proveedores[0].nombre, nit: proveedores[0].nit, subtotal: 5600000, iva: 1064000, estado: 'Aprobada', vence: enDias(11), areaIdx: 0, prioridad: 'Alta' },
        { numero: 'FE-30008', proveedor: proveedores[1].nombre, nit: proveedores[1].nit, subtotal: 980000, iva: 186200, estado: 'Aprobada', vence: enDias(16), areaIdx: 0, prioridad: 'Media' },
        { numero: 'FE-30009', proveedor: proveedores[2].nombre, nit: proveedores[2].nit, subtotal: 2750000, iva: 522500, estado: 'Aprobada', vence: enDias(8), areaIdx: 1, prioridad: 'Media' },
        { numero: 'FE-30010', proveedor: proveedores[4].nombre, nit: proveedores[4].nit, subtotal: 1200000, iva: 228000, estado: 'Aprobada', vence: enDias(19), areaIdx: 2, prioridad: 'Baja' },
        { numero: 'FE-30011', proveedor: proveedores[3].nombre, nit: proveedores[3].nit, subtotal: 430000, iva: 81700, estado: 'Pagada', vence: enDias(-40), areaIdx: 3, prioridad: 'Baja' },
        { numero: 'FE-30012', proveedor: proveedores[0].nombre, nit: proveedores[0].nit, subtotal: 6800000, iva: 1292000, estado: 'Pagada', vence: enDias(-35), areaIdx: 0, prioridad: 'Alta' },
        { numero: 'FE-30013', proveedor: proveedores[5].nombre, nit: proveedores[5].nit, subtotal: 1100000, iva: 209000, estado: 'Pagada', vence: enDias(-28), areaIdx: 2, prioridad: 'Media' },
        { numero: 'FE-30014', proveedor: proveedores[1].nombre, nit: proveedores[1].nit, subtotal: 720000, iva: 136800, estado: 'Pagada', vence: enDias(-20), areaIdx: 0, prioridad: 'Media' },
        { numero: 'FE-30015', proveedor: proveedores[2].nombre, nit: proveedores[2].nit, subtotal: 1850000, iva: 351500, estado: 'Rechazada', vence: enDias(-10), areaIdx: 1, prioridad: 'Media' },
        { numero: 'FE-30016', proveedor: proveedores[4].nombre, nit: proveedores[4].nit, subtotal: 3900000, iva: 741000, estado: 'Rechazada', vence: enDias(-3), areaIdx: 2, prioridad: 'Alta' },
        { numero: 'FE-30017', proveedor: proveedores[5].nombre, nit: proveedores[5].nit, subtotal: 560000, iva: 106400, estado: 'Rechazada', vence: enDias(5), areaIdx: 4, prioridad: 'Baja' },
        { numero: 'FE-30018', proveedor: proveedores[3].nombre, nit: proveedores[3].nit, subtotal: 1320000, iva: 250800, estado: 'Pendiente', vence: enDias(-1), areaIdx: 4, prioridad: 'Alta' },
    ];

    let facturasCreadas = 0;
    for (const empresaId of ['RC']) {
        for (const f of facturasDemo) {
            const existe = await prisma.factura.findFirst({ where: { tenantId: tenant.id, empresaId, numero: f.numero } });
            if (existe) continue;

            const historial = [
                { actor: actor.nombre, accion: 'Factura recibida', detalle: 'Ingreso al sistema (dato de demostración)' } as { actor: string; accion: string; detalle: string },
            ];
            if (f.estado === 'Aprobada' || f.estado === 'Pagada') {
                historial.push({ actor: actor.nombre, accion: 'Aprobada', detalle: 'Validado correctamente' });
            }
            if (f.estado === 'Pagada') {
                historial.push({ actor: actor.nombre, accion: 'Pagada', detalle: 'Transferencia procesada' });
            }
            if (f.estado === 'Rechazada') {
                historial.push({ actor: actor.nombre, accion: 'Rechazada', detalle: 'Rechazada en revisión manual' });
            }

            await prisma.factura.create({
                data: {
                    tenantId: tenant.id,
                    empresaId,
                    numero: f.numero,
                    proveedor: f.proveedor,
                    nit: f.nit,
                    area: areaAl(f.areaIdx),
                    responsable: actor.nombre,
                    vence: f.vence,
                    subtotal: f.subtotal,
                    iva: f.iva,
                    total: f.subtotal + f.iva,
                    moneda: 'COP',
                    prioridad: f.prioridad,
                    estado: f.estado,
                    origen: 'Carga manual',
                    historial: { create: historial },
                },
            });
            facturasCreadas++;
        }
    }
    console.log(`✅ Facturas de demostración creadas: ${facturasCreadas} (de ${facturasDemo.length} definidas)`);

    // 5. Solicitudes de compra de demostración
    type SolicitudDemo = {
        item: string; descripcion: string; cantidad: number; valorEstimado: number;
        estado: 'Pendiente' | 'En Cotización' | 'Aprobada' | 'Rechazada' | 'Comprado';
        prioridad: 'Alta' | 'Media' | 'Baja'; areaIdx: number;
    };
    const solicitudesDemo: SolicitudDemo[] = [
        { item: 'Licencias Microsoft 365 (10 puestos)', descripcion: 'Renovación anual de licencias corporativas', cantidad: 10, valorEstimado: 3200000, estado: 'Pendiente', prioridad: 'Alta', areaIdx: 0 },
        { item: 'Sillas ergonómicas', descripcion: 'Reposición de mobiliario de oficina', cantidad: 6, valorEstimado: 2400000, estado: 'Pendiente', prioridad: 'Media', areaIdx: 3 },
        { item: 'Toner impresora multifuncional', descripcion: 'Insumo de oficina agotado', cantidad: 8, valorEstimado: 640000, estado: 'Pendiente', prioridad: 'Baja', areaIdx: 4 },
        { item: 'Servidor NAS 16TB', descripcion: 'Ampliación de respaldo de archivos', cantidad: 1, valorEstimado: 5200000, estado: 'En Cotización', prioridad: 'Alta', areaIdx: 0 },
        { item: 'Uniformes dotación segundo semestre', descripcion: 'Dotación legal de personal operativo', cantidad: 25, valorEstimado: 4800000, estado: 'En Cotización', prioridad: 'Media', areaIdx: 2 },
        { item: 'Mantenimiento preventivo planta eléctrica', descripcion: 'Contrato de mantenimiento semestral', cantidad: 1, valorEstimado: 1800000, estado: 'Aprobada', prioridad: 'Alta', areaIdx: 2 },
        { item: 'Kit de herramientas taller', descripcion: 'Reposición de herramientas dañadas', cantidad: 3, valorEstimado: 950000, estado: 'Aprobada', prioridad: 'Media', areaIdx: 2 },
        { item: 'Cámaras de seguridad adicionales', descripcion: 'Ampliación de cobertura bodega', cantidad: 4, valorEstimado: 2100000, estado: 'Comprado', prioridad: 'Alta', areaIdx: 2 },
        { item: 'Capacitación SST', descripcion: 'Curso de seguridad y salud en el trabajo', cantidad: 20, valorEstimado: 1600000, estado: 'Comprado', prioridad: 'Media', areaIdx: 3 },
        { item: 'Portátiles gama alta', descripcion: 'Renovación de equipos de diseño', cantidad: 2, valorEstimado: 9000000, estado: 'Rechazada', prioridad: 'Media', areaIdx: 0 },
        { item: 'Vehículo utilitario', descripcion: 'Solicitud fuera de presupuesto del trimestre', cantidad: 1, valorEstimado: 68000000, estado: 'Rechazada', prioridad: 'Baja', areaIdx: 2 },
    ];

    let solicitudesCreadas = 0;
    for (const s of solicitudesDemo) {
        const existe = await prisma.solicitudCompra.findFirst({ where: { tenantId: tenant.id, item: s.item } });
        if (existe) continue;

        const resuelto = s.estado === 'Aprobada' || s.estado === 'Rechazada' || s.estado === 'Comprado';
        await prisma.solicitudCompra.create({
            data: {
                tenantId: tenant.id,
                empresaId: 'RC',
                area: areaAl(s.areaIdx),
                solicitante: actor.nombre,
                item: s.item,
                descripcion: s.descripcion,
                cantidad: s.cantidad,
                valorEstimado: s.valorEstimado,
                prioridad: s.prioridad,
                estado: s.estado,
                ...(resuelto
                    ? {
                          fechaResolucion: hoy(),
                          resueltoPorId: actor.id,
                          resueltoPorNombre: actor.nombre,
                          comentarioResolucion:
                              s.estado === 'Rechazada' ? 'Fuera de presupuesto del trimestre' : 'Aprobado en comité de compras',
                      }
                    : {}),
            },
        });
        solicitudesCreadas++;
    }
    console.log(`✅ Solicitudes de compra de demostración creadas: ${solicitudesCreadas} (de ${solicitudesDemo.length} definidas)`);

    // 6. Créditos de clientes de demostración
    type CreditoDemo = { cliente: string; cupo: number; saldo: number; estado: 'Al día' | 'Por vencer' | 'Vencido'; venceEnDias: number };
    const creditosDemo: CreditoDemo[] = [
        { cliente: 'Almacenes Rico S.A.S.', cupo: 20000000, saldo: 14500000, estado: 'Al día', venceEnDias: 30 },
        { cliente: 'Distribuciones El Faro Ltda.', cupo: 15000000, saldo: 15000000, estado: 'Vencido', venceEnDias: -12 },
        { cliente: 'Comercializadora Andina S.A.S.', cupo: 10000000, saldo: 6200000, estado: 'Al día', venceEnDias: 45 },
        { cliente: 'Supermercados La Economía', cupo: 25000000, saldo: 21800000, estado: 'Por vencer', venceEnDias: 5 },
        { cliente: 'Constructora Valle Verde', cupo: 30000000, saldo: 9000000, estado: 'Al día', venceEnDias: 60 },
        { cliente: 'Textiles del Pacífico S.A.S.', cupo: 8000000, saldo: 8000000, estado: 'Vencido', venceEnDias: -25 },
        { cliente: 'Panificadora San Marcos', cupo: 5000000, saldo: 1800000, estado: 'Al día', venceEnDias: 20 },
    ];

    let creditosCreados = 0;
    for (const c of creditosDemo) {
        const existe = await prisma.creditoCliente.findFirst({ where: { tenantId: tenant.id, cliente: c.cliente } });
        if (existe) continue;
        await prisma.creditoCliente.create({
            data: {
                tenantId: tenant.id,
                cliente: c.cliente,
                cupo: c.cupo,
                saldo: c.saldo,
                vence: enDias(c.venceEnDias),
                estado: c.estado,
            },
        });
        creditosCreados++;
    }
    console.log(`✅ Créditos de clientes de demostración creados: ${creditosCreados} (de ${creditosDemo.length} definidos)`);

    console.log('\n🎉 Seed completado.');
}

main()
    .catch((e) => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
