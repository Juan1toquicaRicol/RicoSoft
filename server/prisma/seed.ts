import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Iniciando seed...\n');

    // 1. Crear o encontrar el tenant "demo"
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

    // 2. Crear o encontrar el usuario admin
    let admin = await prisma.user.findUnique({
        where: { email: 'admin@demo.com' },
    });

    if (!admin) {
        const passwordHash = await bcrypt.hash('password123', 10);
        admin = await prisma.user.create({
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
        console.log(`✅ Usuario admin creado: ${admin.email} / password123 (superadmin)`);
    } else if (!admin.isSuperadmin) {
        admin = await prisma.user.update({
            where: { id: admin.id },
            data: { isSuperadmin: true },
        });
        console.log(`✅ Usuario admin promovido a superadmin: ${admin.email}`);
    } else {
        console.log(`ℹ️  Usuario admin ya existe: ${admin.email}`);
    }

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