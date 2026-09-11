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

        // Parsear fechas base (YYYY-MM-DD)
        const [sy, sm, sd] = dto.startDate.split('-').map(Number);
        const [ey, em, ed] = dto.endDate.split('-').map(Number);
        const rangeStart = new Date(Date.UTC(sy, sm - 1, sd));
        const rangeEnd = new Date(Date.UTC(ey, em - 1, ed));

        if (rangeEnd < rangeStart) {
            throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
        }

        // Límite de seguridad: máximo ~6 meses
        const maxMs = 190 * 24 * 60 * 60 * 1000;
        if (rangeEnd.getTime() - rangeStart.getTime() > maxMs) {
            throw new BadRequestException('El rango máximo permitido es de 6 meses');
        }

        // Crear la entidad de recurrencia
        const recurring = await this.prisma.recurringBooking.create({
            data: {
                facilityId: dto.facilityId,
                userId: targetUserId,
                dayOfWeek: dto.dayOfWeek,
                startTime: dto.startTime,
                endTime: dto.endTime,
                startDate: rangeStart,
                endDate: rangeEnd,
                createdById: actor.id,
            },
        });

        const created: { date: string; bookingId: string }[] = [];
        const skipped: { date: string; reason: string }[] = [];

        // Iterar día por día en el rango
        for (
            let cursor = new Date(rangeStart);
            cursor <= rangeEnd;
            cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
        ) {
            // dayOfWeek local AR (0=Lunes..6=Domingo). Como cursor es medianoche UTC
            // de la fecha, el día calendario AR coincide con la fecha nominal.
            const jsDay = cursor.getUTCDay(); // 0=Domingo
            const arDayOfWeek = (jsDay + 6) % 7;
            if (arDayOfWeek !== dto.dayOfWeek) continue;

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
