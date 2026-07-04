import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    // Create admin user
    const adminPassword = await bcrypt.hash('Admin123!', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@sportbooking.com' },
        update: {},
        create: {
            email: 'admin@sportbooking.com',
            passwordHash: adminPassword,
            firstName: 'Admin',
            lastName: 'System',
            role: Role.ADMIN,
            emailVerified: true,
        },
    });

    // Create client user
    const clientPassword = await bcrypt.hash('Client123!', 12);
    const client = await prisma.user.upsert({
        where: { email: 'client@sportbooking.com' },
        update: {},
        create: {
            email: 'client@sportbooking.com',
            passwordHash: clientPassword,
            firstName: 'Juan',
            lastName: 'Pérez',
            role: Role.CLIENT,
            emailVerified: true,
        },
    });

    // Create sports
    const sports = await Promise.all([
        prisma.sport.upsert({
            where: { slug: 'futbol' },
            update: {},
            create: { name: 'Fútbol', slug: 'futbol', icon: 'soccer' },
        }),
        prisma.sport.upsert({
            where: { slug: 'tenis' },
            update: {},
            create: { name: 'Tenis', slug: 'tenis', icon: 'tennis' },
        }),
        prisma.sport.upsert({
            where: { slug: 'padel' },
            update: {},
            create: { name: 'Pádel', slug: 'padel', icon: 'paddle' },
        }),
        prisma.sport.upsert({
            where: { slug: 'basquetbol' },
            update: {},
            create: { name: 'Basquetbol', slug: 'basquetbol', icon: 'basketball' },
        }),
        prisma.sport.upsert({
            where: { slug: 'voleibol' },
            update: {},
            create: { name: 'Voleibol', slug: 'voleibol', icon: 'volleyball' },
        }),
    ]);

    // Create a venue
    const venue = await prisma.venue.upsert({
        where: { slug: 'complejo-deportivo-central' },
        update: {},
        create: {
            name: 'Complejo Deportivo Central',
            slug: 'complejo-deportivo-central',
            description: 'El mejor complejo deportivo de la ciudad',
            address: 'Av. Principal 123',
            city: 'Buenos Aires',
            country: 'Argentina',
        },
    });

    // Link sports to venue
    for (const sport of sports) {
        await prisma.venueSport.upsert({
            where: { venueId_sportId: { venueId: venue.id, sportId: sport.id } },
            update: {},
            create: { venueId: venue.id, sportId: sport.id },
        });
    }

    // Create facilities
    const facility1 = await prisma.facility.create({
        data: {
            venueId: venue.id,
            sportId: sports[0].id, // Fútbol
            name: 'Cancha de Fútbol 5 - A',
            description: 'Cancha de césped sintético para fútbol 5',
            surfaceType: 'césped sintético',
            isIndoor: false,
            capacity: 10,
            minBookingDuration: 60,
            maxBookingDuration: 120,
        },
    });

    const facility2 = await prisma.facility.create({
        data: {
            venueId: venue.id,
            sportId: sports[1].id, // Tenis
            name: 'Cancha de Tenis 1',
            description: 'Cancha de arcilla profesional',
            surfaceType: 'arcilla',
            isIndoor: false,
            capacity: 4,
            minBookingDuration: 60,
            maxBookingDuration: 120,
        },
    });

    const facility3 = await prisma.facility.create({
        data: {
            venueId: venue.id,
            sportId: sports[2].id, // Pádel
            name: 'Cancha de Pádel 1',
            description: 'Cancha de pádel con cristal',
            surfaceType: 'césped sintético',
            isIndoor: true,
            capacity: 4,
            minBookingDuration: 60,
            maxBookingDuration: 90,
        },
    });

    // Create schedules (Mon-Sun 8:00-22:00)
    const facilities = [facility1, facility2, facility3];
    for (const facility of facilities) {
        for (let day = 0; day <= 6; day++) {
            await prisma.schedule.create({
                data: {
                    facilityId: facility.id,
                    dayOfWeek: day,
                    openTime: '08:00',
                    closeTime: '22:00',
                },
            });
        }
    }

    // Create pricing
    for (const facility of facilities) {
        await prisma.pricing.create({
            data: {
                facilityId: facility.id,
                startTime: '08:00',
                endTime: '18:00',
                pricePerHour: 25.0,
                currency: 'USD',
            },
        });
        await prisma.pricing.create({
            data: {
                facilityId: facility.id,
                startTime: '18:00',
                endTime: '22:00',
                pricePerHour: 35.0,
                currency: 'USD',
            },
        });
    }

    console.log('✅ Seed completed!');
    console.log(`   Admin: admin@sportbooking.com / Admin123!`);
    console.log(`   Client: client@sportbooking.com / Client123!`);
    console.log(`   Venue: ${venue.name}`);
    console.log(`   Facilities: ${facilities.length}`);
    console.log(`   Sports: ${sports.length}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
