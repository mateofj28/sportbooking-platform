import { PrismaClient, Role, BookingStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const FIRST_NAMES = ['Carlos', 'María', 'Andrés', 'Valentina', 'Santiago', 'Camila', 'Sebastián', 'Laura', 'Mateo', 'Sofía', 'Daniel', 'Isabella', 'Nicolás', 'Mariana', 'Alejandro'];
const LAST_NAMES = ['García', 'Rodríguez', 'Martínez', 'López', 'González', 'Hernández', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Cruz'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log('🌱 Seeding demo data...\n');

  // Create 15 client users
  const passwordHash = await bcrypt.hash('Client123!', 12);
  const users = [];
  for (let i = 0; i < 15; i++) {
    const firstName = FIRST_NAMES[i];
    const lastName = randomItem(LAST_NAMES);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@sportbooking.com`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone: `+57 3${randomInt(10, 99)} ${randomInt(100, 999)} ${randomInt(1000, 9999)}`,
        role: Role.CLIENT,
        emailVerified: true,
      },
    });
    users.push(user);
  }
  console.log(`✅ ${users.length} usuarios creados`);

  // Get existing facilities
  const facilities = await prisma.facility.findMany({ include: { schedules: true, pricing: true } });
  if (facilities.length === 0) {
    console.log('❌ No hay instalaciones. Corre el seed principal primero.');
    return;
  }
  console.log(`📍 ${facilities.length} instalaciones encontradas`);

  // Create 50 bookings spread across last 14 days and next 7 days
  const statuses: BookingStatus[] = [
    BookingStatus.CONFIRMED, BookingStatus.CONFIRMED, BookingStatus.CONFIRMED,
    BookingStatus.PENDING, BookingStatus.PENDING,
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED, BookingStatus.COMPLETED, BookingStatus.COMPLETED, BookingStatus.COMPLETED,
  ];

  const bookings = [];
  const now = new Date();

  for (let i = 0; i < 50; i++) {
    const facility = randomItem(facilities);
    const user = randomItem(users);
    const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });

    // Random day between -14 and +7 days
    const dayOffset = randomInt(-14, 7);
    const bookingDate = new Date(now);
    bookingDate.setDate(now.getDate() + dayOffset);

    // Random hour between 8 and 20
    const startHour = randomInt(8, 20);
    const duration = facility.minBookingDuration;

    bookingDate.setHours(startHour, 0, 0, 0);
    const endDate = new Date(bookingDate.getTime() + duration * 60000);

    // Determine status
    let status: BookingStatus;
    if (dayOffset < -1) {
      status = BookingStatus.COMPLETED;
    } else if (dayOffset < 0) {
      status = randomItem([BookingStatus.COMPLETED, BookingStatus.CANCELLED]);
    } else {
      status = randomItem(statuses);
    }

    // Calculate price
    const pricing = facility.pricing[0];
    const pricePerHour = pricing ? Number(pricing.pricePerHour) : 25;
    const totalPrice = pricePerHour * (duration / 60);

    try {
      const booking = await prisma.booking.create({
        data: {
          facilityId: facility.id,
          userId: user.id,
          startDatetime: bookingDate,
          endDatetime: endDate,
          status,
          totalPrice,
          currency: 'USD',
          notes: randomItem([null, 'Llevar pelotas', 'Somos 8 personas', 'Reserva para torneo', 'Práctica de equipo', null]),
          createdById: status === BookingStatus.CONFIRMED && Math.random() > 0.7 ? admin!.id : user.id,
          cancelledAt: status === BookingStatus.CANCELLED ? new Date() : null,
          cancelledById: status === BookingStatus.CANCELLED ? user.id : null,
          cancellationReason: status === BookingStatus.CANCELLED ? randomItem(['Cambio de planes', 'Clima', 'Lesión', 'No hay quórum']) : null,
        },
      });
      bookings.push(booking);
    } catch {
      // Skip conflicts silently
    }
  }

  console.log(`✅ ${bookings.length} reservas creadas`);

  // Summary
  const pending = bookings.filter(b => b.status === 'PENDING').length;
  const confirmed = bookings.filter(b => b.status === 'CONFIRMED').length;
  const cancelled = bookings.filter(b => b.status === 'CANCELLED').length;
  const completed = bookings.filter(b => b.status === 'COMPLETED').length;
  const totalRevenue = bookings.filter(b => b.status !== 'CANCELLED').reduce((s, b) => s + Number(b.totalPrice), 0);

  console.log(`\n📊 Resumen:`);
  console.log(`   Pendientes: ${pending}`);
  console.log(`   Confirmadas: ${confirmed}`);
  console.log(`   Canceladas: ${cancelled}`);
  console.log(`   Completadas: ${completed}`);
  console.log(`   Ingresos: $${totalRevenue.toFixed(0)}`);
  console.log(`\n🎉 Demo data cargada correctamente!`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
