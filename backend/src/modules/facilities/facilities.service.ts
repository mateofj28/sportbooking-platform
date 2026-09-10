import { Injectable, NotFoundException } from '@nestjs/common';
import { FacilitiesRepository } from './facilities.repository';
import { CreateFacilityDto, UpdateFacilityDto } from './dto/create-facility.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class FacilitiesService {
    constructor(
        private readonly facilitiesRepository: FacilitiesRepository,
        private readonly prisma: PrismaService,
    ) { }

    async findAll(filters: {
        sportId?: string;
        venueId?: string;
        isIndoor?: boolean;
        search?: string;
        includeInactive?: boolean;
        bookableOnly?: boolean;
    }) {
        return this.facilitiesRepository.findAll(filters);
    }

    async findById(id: string) {
        const facility = await this.facilitiesRepository.findById(id);
        if (!facility) {
            throw new NotFoundException('Instalación no encontrada');
        }
        return facility;
    }

    async create(dto: CreateFacilityDto) {
        return this.facilitiesRepository.create(dto);
    }

    async update(id: string, dto: UpdateFacilityDto) {
        await this.findById(id);
        return this.facilitiesRepository.update(id, dto);
    }

    async deactivate(id: string) {
        await this.findById(id);
        return this.facilitiesRepository.deactivate(id);
    }

    async getAvailability(id: string, dateStr: string) {
        // Zona horaria de Argentina: UTC-3. Trabajamos las horas como "hora local AR".
        const AR_OFFSET_MIN = 3 * 60; // Argentina está 3h detrás de UTC

        // dateStr = "YYYY-MM-DD". Parseamos las partes sin depender de la zona del servidor.
        const [year, month, day] = dateStr.split('-').map(Number);

        /** Instante UTC real correspondiente a una hora local AR de la fecha base + dayOffset días */
        const arLocalToUtc = (minutesFromMidnight: number, dayOffset = 0) => {
            // hora local AR -> UTC sumando el offset
            return new Date(Date.UTC(year, month - 1, day + dayOffset, 0, minutesFromMidnight + AR_OFFSET_MIN, 0, 0));
        };

        const facility = await this.prisma.facility.findUnique({
            where: { id },
            include: { schedules: true, pricing: { where: { isActive: true } } },
        });

        if (!facility) throw new NotFoundException('Instalación no encontrada');

        // Día de la semana en hora local AR (0=Lunes ... 6=Domingo)
        const localMidnightUtc = arLocalToUtc(0);
        const jsDay = localMidnightUtc.getUTCDay(); // 0=Domingo
        const dayOfWeek = (jsDay + 6) % 7;

        const schedule = facility.schedules.find(
            (s) => s.dayOfWeek === dayOfWeek && s.isActive,
        );

        if (!schedule) {
            return { available: false, slots: [], message: 'Sin horario para este día' };
        }

        // Regla de negocio: debe existir un precio que aplique a este día
        const hasPricing = facility.pricing.some(
            (p) => p.dayOfWeek === null || p.dayOfWeek === dayOfWeek,
        );

        if (!hasPricing) {
            return { available: false, slots: [], message: 'Sin tarifa para este día' };
        }

        // Rango de apertura en minutos desde medianoche (local AR)
        const [openH, openM] = schedule.openTime.split(':').map(Number);
        const [closeH, closeM] = schedule.closeTime.split(':').map(Number);
        const startMin = openH * 60 + openM;
        let endMin = closeH * 60 + closeM;
        if (endMin <= startMin) endMin += 24 * 60; // cruza medianoche
        const duration = facility.minBookingDuration;

        // Ventana del día (en UTC real) para traer reservas/bloqueos
        const dayStart = arLocalToUtc(0);
        const dayEnd = arLocalToUtc(48 * 60); // hasta el final del día siguiente (cubre slots de madrugada)

        const [bookings, blockedSlots] = await Promise.all([
            this.prisma.booking.findMany({
                where: {
                    facilityId: id,
                    status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                    startDatetime: { gte: dayStart },
                    endDatetime: { lte: dayEnd },
                },
            }),
            this.prisma.blockedSlot.findMany({
                where: {
                    facilityId: id,
                    startDatetime: { lt: dayEnd },
                    endDatetime: { gt: dayStart },
                },
            }),
        ]);

        const slots: { time: string; available: boolean }[] = [];
        const now = new Date();

        for (let m = startMin; m + duration <= endMin; m += duration) {
            const mInDay = m % (24 * 60);
            const h = Math.floor(mInDay / 60);
            const min = mInDay % 60;
            const timeStr = `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

            // Instante UTC real del slot (m ya considera el cruce de medianoche)
            const slotStart = arLocalToUtc(m);
            const slotEnd = new Date(slotStart.getTime() + duration * 60000);

            // ¿Está en el pasado? (comparación de instantes reales)
            if (slotStart <= now) {
                slots.push({ time: timeStr, available: false });
                continue;
            }

            const hasConflict = bookings.some(
                (b) => new Date(b.startDatetime) < slotEnd && new Date(b.endDatetime) > slotStart,
            );

            const isBlocked = blockedSlots.some(
                (b) => new Date(b.startDatetime) < slotEnd && new Date(b.endDatetime) > slotStart,
            );

            slots.push({ time: timeStr, available: !hasConflict && !isBlocked });
        }

        return { available: true, slots };
    }
}
