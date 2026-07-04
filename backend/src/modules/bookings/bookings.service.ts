import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingsRepository } from './bookings.repository';
import { CreateBookingDto, ManualBookingDto, CancelBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
    constructor(
        private readonly bookingsRepository: BookingsRepository,
        private readonly prisma: PrismaService,
    ) { }

    async findAll(userId?: string, isAdmin = false, status?: BookingStatus) {
        if (isAdmin) {
            return this.bookingsRepository.findAll(undefined, status);
        }
        return this.bookingsRepository.findAll(userId, status);
    }

    async findById(id: string) {
        const booking = await this.bookingsRepository.findById(id);
        if (!booking) {
            throw new NotFoundException('Booking not found');
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
            currency: 'USD',
            notes: dto.notes,
            createdById: userId,
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
            currency: 'USD',
            notes: dto.notes,
            createdById: adminId,
            status: BookingStatus.CONFIRMED,
        });
    }

    async confirm(id: string) {
        const booking = await this.findById(id);
        if (booking.status !== BookingStatus.PENDING) {
            throw new BadRequestException('Solo se pueden confirmar reservas pendientes');
        }
        return this.bookingsRepository.updateStatus(id, BookingStatus.CONFIRMED);
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
