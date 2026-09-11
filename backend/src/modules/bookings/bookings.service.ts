import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingsRepository } from './bookings.repository';
import { CreateBookingDto, ManualBookingDto, CancelBookingDto, CreateRecurringBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
    constructor(
        private readonly bookingsRepository: BookingsRepository,
        private readonly prisma: PrismaService,
    ) { }

    async findAll(
        user: { id: string; role: Role; venueId?: string | null },
        status?: BookingStatus,
        page = 1,
        limit = 20,
    ) {
        // ADMIN general: todas las reservas
        if (user.role === Role.ADMIN) {
            return this.bookingsRepository.findAll(undefined, status, page, limit);
        }
        // ADMIN de sede: solo reservas de las instalaciones de su sede
        if (user.role === Role.VENUE_ADMIN && user.venueId) {
            return this.bookingsRepository.findAll(
                undefined,
                status,
                page,
                limit,
                user.venueId,
            );
        }
        // Cliente (o admin de sede sin sede asignada): solo sus reservas
        return this.bookingsRepository.findAll(user.id, status, page, limit);
    }

    async findById(id: string) {
        const booking = await this.bookingsRepository.findById(id);
        if (!booking) {
            throw new NotFoundException('Reserva no encontrada');
        }
        return booking;
    }

    async create(dto: CreateBookingDto, userId: string) {
        const startDatetime = new Date(dto.startDatetime);
        const endDatetime = new Date(dto.endDatetime);

        await this.validateBooking(dto.facilityId, startDatetime, endDatetime);

        const totalPrice = await this.calculatePrice(dto.facilityId, startDatetime, endDatetime);

        return this.bookingsRepository.create({
            facilityId: dto.facilityId,
            userId,
            startDatetime,
            endDatetime,
            totalPrice,
            currency: 'ARS',
            notes: dto.notes,
            createdById: userId,
            status: BookingStatus.CONFIRMED,
        });
    }

    async createManual(dto: ManualBookingDto, adminId: string) {
        const startDatetime = new Date(dto.startDatetime);
        const endDatetime = new Date(dto.endDatetime);

        await this.validateBooking(dto.facilityId, startDatetime, endDatetime);

        const totalPrice = await this.calculatePrice(dto.facilityId, startDatetime, endDatetime);

        return this.bookingsRepository.create({
            facilityId: dto.facilityId,
            userId: dto.userId,
            startDatetime,
            endDatetime,
            totalPrice,
            currency: 'ARS',
            notes: dto.notes,
            createdById: adminId,
            status: BookingStatus.CONFIRMED,
        });
    }

    async cancel(id: string, userId: string, dto: CancelBookingDto) {
        const booking = await this.findById(id);
        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('La reserva ya está cancelada');
        }
        if (booking.status === BookingStatus.COMPLETED) {
            throw new BadRequestException('No se puede cancelar una reserva completada');
        }
        return this.bookingsRepository.cancel(id, userId, dto.reason);
    }

    /**
     * Crea una reserva recurrente (turno fijo): genera una reserva concreta por
     * cada día de la semana coincidente entre startDate y endDate (inclusive).
     * Las fechas en conflicto se saltan y se informan en el resultado.
     *
     * @param actor   usuario autenticado que ejecuta la acción
     * @param dto     datos de la recurrencia
     */
    async createRecurring(
        actor: { id: string; role: Role; venueId?: string | null },
        dto: CreateRecurringBookingDto,
    ) {
        // Zona horaria de Argentina: UTC-3. Interpretamos las horas como hora local AR.
        const AR_OFFSET_MIN = 3 * 60;

        const [startH, startM] = dto.startTime.split(':').map(Number);
        const [endH, endM] = dto.endTime.split(':').map(Number);
        const startMin = startH * 60 + startM;
        let endMin = endH * 60 + endM;
        const crossesMidnight = endMin <= startMin;
        if (crossesMidnight) endMin += 24 * 60;

        // Determinar el cliente destinatario
        let targetUserId = actor.id;
        if (actor.role === Role.VENUE_ADMIN || actor.role === Role.ADMIN) {
            if (dto.userId) targetUserId = dto.userId;
        }

        // Validar acceso del admin de sede sobre la instalación
        const facility = await this.prisma.facility.findUnique({
            where: { id: dto.facilityId },
            include: { venue: true },
        });
        if (!facility) throw new NotFoundException('Instalación no encontrada');
        if (
            actor.role === Role.VENUE_ADMIN &&
            facility.venueId !== actor.venueId
        ) {
            throw new BadRequestException(
                'Solo puedes crear turnos fijos en instalaciones de tu sede',
            );
        }

        // Turno fijo: siempre las próximas 4 ocurrencias del día elegido
        const OCCURRENCES = 4;

        // Parsear fecha base (YYYY-MM-DD) como medianoche UTC
        const [sy, sm, sd] = dto.startDate.split('-').map(Number);
        const base = new Date(Date.UTC(sy, sm - 1, sd));

        // Encontrar la primera fecha (>= base) cuyo día de semana AR coincida
        const arDow = (dt: Date) => ((dt.getUTCDay() + 6) % 7); // 0=Lunes..6=Domingo
        const firstDate = new Date(base);
        for (let i = 0; i < 7 && arDow(firstDate) !== dto.dayOfWeek; i++) {
            firstDate.setUTCDate(firstDate.getUTCDate() + 1);
        }

        // Generar las 4 fechas (semanales)
        const dates: Date[] = [];
        for (let i = 0; i < OCCURRENCES; i++) {
            dates.push(new Date(firstDate.getTime() + i * 7 * 24 * 60 * 60 * 1000));
        }
        const lastDate = dates[dates.length - 1];

        // Crear la entidad de recurrencia (startDate = primera, endDate = última)
        const recurring = await this.prisma.recurringBooking.create({
            data: {
                facilityId: dto.facilityId,
                userId: targetUserId,
                dayOfWeek: dto.dayOfWeek,
                startTime: dto.startTime,
                endTime: dto.endTime,
                startDate: firstDate,
                endDate: lastDate,
                createdById: actor.id,
            },
        });

        const created: { date: string; bookingId: string }[] = [];
        const skipped: { date: string; reason: string }[] = [];

        for (const cursor of dates) {
            const y = cursor.getUTCFullYear();
            const mo = cursor.getUTCMonth();
            const d = cursor.getUTCDate();
            const dateLabel = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            // Hora local AR -> instante UTC real (sumar offset)
            const startDatetime = new Date(Date.UTC(y, mo, d, 0, startMin + AR_OFFSET_MIN));
            const endDatetime = new Date(Date.UTC(y, mo, d, 0, endMin + AR_OFFSET_MIN));

            try {
                await this.validateBooking(dto.facilityId, startDatetime, endDatetime);
                const totalPrice = await this.calculatePrice(dto.facilityId, startDatetime, endDatetime);
                const booking = await this.bookingsRepository.create({
                    facilityId: dto.facilityId,
                    userId: targetUserId,
                    startDatetime,
                    endDatetime,
                    totalPrice,
                    currency: 'ARS',
                    notes: dto.notes,
                    createdById: actor.id,
                    status: BookingStatus.CONFIRMED,
                    recurringBookingId: recurring.id,
                });
                created.push({ date: dateLabel, bookingId: booking.id });
            } catch (err: any) {
                skipped.push({ date: dateLabel, reason: err?.message || 'No disponible' });
            }
        }

        return {
            recurringBookingId: recurring.id,
            totalDates: created.length + skipped.length,
            createdCount: created.length,
            skippedCount: skipped.length,
            created,
            skipped,
        };
    }

    /**
     * Lista los turnos fijos (recurrencias) según el rol:
     * - ADMIN: todos
     * - VENUE_ADMIN: los de las instalaciones de su sede
     * - CLIENT: los propios
     */
    async findRecurring(user: { id: string; role: Role; venueId?: string | null }) {
        const where: Record<string, unknown> = {};
        if (user.role === Role.ADMIN) {
            // sin filtro
        } else if (user.role === Role.VENUE_ADMIN && user.venueId) {
            where.facility = { venueId: user.venueId };
        } else {
            where.userId = user.id;
        }

        const now = new Date();

        const list = await this.prisma.recurringBooking.findMany({
            where,
            include: {
                facility: {
                    include: {
                        sport: true,
                        venue: { select: { id: true, name: true, city: true } },
                    },
                },
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                bookings: {
                    select: { id: true, startDatetime: true, endDatetime: true, status: true },
                    orderBy: { startDatetime: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Agregar contadores útiles para la UI
        return list.map((r) => {
            const upcoming = r.bookings.filter(
                (b) => b.status === BookingStatus.CONFIRMED && new Date(b.startDatetime) >= now,
            );
            return {
                ...r,
                upcomingCount: upcoming.length,
                totalCount: r.bookings.length,
            };
        });
    }

    /**
     * Cancela un turno fijo completo: desactiva la recurrencia y cancela todas
     * las reservas futuras (no completadas ni ya canceladas) de la serie.
     */
    async cancelRecurring(
        id: string,
        user: { id: string; role: Role; venueId?: string | null },
        reason?: string,
    ) {
        const recurring = await this.prisma.recurringBooking.findUnique({
            where: { id },
            include: { facility: true },
        });
        if (!recurring) throw new NotFoundException('Turno fijo no encontrado');

        // Autorización
        if (user.role === Role.CLIENT && recurring.userId !== user.id) {
            throw new BadRequestException('No puedes cancelar este turno fijo');
        }
        if (
            user.role === Role.VENUE_ADMIN &&
            recurring.facility.venueId !== user.venueId
        ) {
            throw new BadRequestException('No puedes cancelar turnos fijos de otra sede');
        }

        const now = new Date();

        // Cancelar todas las reservas futuras confirmadas de la serie
        const futureBookings = await this.prisma.booking.findMany({
            where: {
                recurringBookingId: id,
                status: BookingStatus.CONFIRMED,
                startDatetime: { gte: now },
            },
            select: { id: true },
        });

        await this.prisma.$transaction([
            ...futureBookings.map((b) =>
                this.prisma.booking.update({
                    where: { id: b.id },
                    data: {
                        status: BookingStatus.CANCELLED,
                        cancelledAt: now,
                        cancelledById: user.id,
                        cancellationReason: reason || 'Turno fijo cancelado',
                    },
                }),
            ),
            this.prisma.recurringBooking.update({
                where: { id },
                data: { isActive: false },
            }),
        ]);

        return {
            recurringBookingId: id,
            cancelledCount: futureBookings.length,
        };
    }

    private async validateBooking(
        facilityId: string,
        startDatetime: Date,
        endDatetime: Date,
    ) {
        // Rule 1: No past dates
        if (startDatetime < new Date()) {
            throw new BadRequestException('No se puede reservar en el pasado');
        }

        // Rule 2: End must be after start
        if (endDatetime <= startDatetime) {
            throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
        }

        // Rule 3: Check facility exists and is active
        const facility = await this.prisma.facility.findUnique({
            where: { id: facilityId },
            include: { schedules: true },
        });

        if (!facility) {
            throw new NotFoundException('Instalación no encontrada');
        }

        if (!facility.isActive) {
            throw new BadRequestException('La instalación no está activa');
        }

        // Rule 4: Check duration limits
        const durationMinutes = (endDatetime.getTime() - startDatetime.getTime()) / 60000;

        if (durationMinutes < facility.minBookingDuration) {
            throw new BadRequestException(
                `La duración mínima de reserva es ${facility.minBookingDuration} minutos`,
            );
        }

        if (durationMinutes > facility.maxBookingDuration) {
            throw new BadRequestException(
                `La duración máxima de reserva es ${facility.maxBookingDuration} minutos`,
            );
        }

        // Rule 5: Check within schedule
        const dayOfWeek = (startDatetime.getDay() + 6) % 7; // Convert to 0=Monday
        const schedule = facility.schedules.find(
            (s) => s.dayOfWeek === dayOfWeek && s.isActive,
        );

        if (!schedule) {
            throw new BadRequestException('La instalación está cerrada este día');
        }

        const startTimeStr = startDatetime.toTimeString().slice(0, 5);
        const endTimeStr = endDatetime.toTimeString().slice(0, 5);

        if (startTimeStr < schedule.openTime || endTimeStr > schedule.closeTime) {
            throw new BadRequestException(
                `El horario de atención es ${schedule.openTime} - ${schedule.closeTime}`,
            );
        }

        // Rule 6: Check blocked slots
        const blockedSlot = await this.prisma.blockedSlot.findFirst({
            where: {
                facilityId,
                startDatetime: { lt: endDatetime },
                endDatetime: { gt: startDatetime },
            },
        });

        if (blockedSlot) {
            throw new BadRequestException('Este horario está bloqueado');
        }

        // Rule 7: Check conflicts
        const conflict = await this.bookingsRepository.findConflicting(
            facilityId,
            startDatetime,
            endDatetime,
        );

        if (conflict) {
            throw new ConflictException('Este horario ya está reservado');
        }
    }

    private async calculatePrice(
        facilityId: string,
        startDatetime: Date,
        endDatetime: Date,
    ): Promise<number> {
        const dayOfWeek = (startDatetime.getDay() + 6) % 7;
        const durationHours =
            (endDatetime.getTime() - startDatetime.getTime()) / 3600000;

        const pricing = await this.prisma.pricing.findFirst({
            where: {
                facilityId,
                isActive: true,
                OR: [{ dayOfWeek }, { dayOfWeek: null }],
            },
            orderBy: { dayOfWeek: 'desc' }, // Prefer specific day over null
        });

        if (!pricing) {
            return 0;
        }

        return Number(pricing.pricePerHour) * durationHours;
    }
}
