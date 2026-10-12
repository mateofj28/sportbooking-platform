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
        const facility = await this.prisma.facility.findUnique({
            where: { id },
            include: { schedules: true, pricing: { where: { isActive: true } } },
        });
        if (!facility) throw new NotFoundException('Instalación no encontrada');

        const { dayStart, dayEnd } = this.dayWindowUtc(dateStr);
        const [bookings, blockedSlots] = await Promise.all([
            this.prisma.booking.findMany({
                where: {
                    facilityId: id,
                    status: BookingStatus.CONFIRMED,
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

        return this.computeSlots(facility, dateStr, bookings, blockedSlots);
    }

    /**
     * Disponibilidad RESUMIDA de muchas canchas de una sola vez (escalable).
     * Devuelve, por cada cancha filtrada, un resumen liviano sin la lista de slots.
     * Hace solo 3 consultas (canchas, reservas, bloqueos) sin importar la cantidad.
     */
    async getAvailabilitySummary(filters: {
        venueId?: string;
        sportId?: string;
        date: string;
    }) {
        const facilities = await this.prisma.facility.findMany({
            where: {
                isActive: true,
                ...(filters.venueId ? { venueId: filters.venueId } : {}),
                ...(filters.sportId ? { sportId: filters.sportId } : {}),
            },
            include: { schedules: true, pricing: { where: { isActive: true } } },
        });

        if (facilities.length === 0) return [];

        const ids = facilities.map((f) => f.id);
        const { dayStart, dayEnd } = this.dayWindowUtc(filters.date);

        // Dos consultas para TODAS las canchas (evita N+1)
        const [bookings, blockedSlots] = await Promise.all([
            this.prisma.booking.findMany({
                where: {
                    facilityId: { in: ids },
                    status: BookingStatus.CONFIRMED,
                    startDatetime: { gte: dayStart },
                    endDatetime: { lte: dayEnd },
                },
            }),
            this.prisma.blockedSlot.findMany({
                where: {
                    facilityId: { in: ids },
                    startDatetime: { lt: dayEnd },
                    endDatetime: { gt: dayStart },
                },
            }),
        ]);

        // Agrupar reservas/bloqueos por cancha para no recorrer todo cada vez
        const bookingsByFacility = new Map<string, typeof bookings>();
        for (const b of bookings) {
            const arr = bookingsByFacility.get(b.facilityId) || [];
            arr.push(b);
            bookingsByFacility.set(b.facilityId, arr);
        }
        const blockedByFacility = new Map<string, typeof blockedSlots>();
        for (const b of blockedSlots) {
            const arr = blockedByFacility.get(b.facilityId) || [];
            arr.push(b);
            blockedByFacility.set(b.facilityId, arr);
        }

        return facilities.map((facility) => {
            const result = this.computeSlots(
                facility,
                filters.date,
                bookingsByFacility.get(facility.id) || [],
                blockedByFacility.get(facility.id) || [],
            );
            const freeCount = result.slots.filter((s) => s.available).length;
            return {
                facilityId: facility.id,
                available: result.available,
                hasFreeSlots: freeCount > 0,
                freeCount,
                message: result.message,
            };
        });
    }

    /** Ventana del día en UTC real (hora local AR -> UTC). dayEnd cubre madrugada. */
    private dayWindowUtc(dateStr: string) {
        const AR_OFFSET_MIN = 3 * 60; // Argentina está 3h detrás de UTC
        const [year, month, day] = dateStr.split('-').map(Number);
        const arLocalToUtc = (minutesFromMidnight: number) =>
            new Date(Date.UTC(year, month - 1, day, 0, minutesFromMidnight + AR_OFFSET_MIN, 0, 0));
        return { dayStart: arLocalToUtc(0), dayEnd: arLocalToUtc(48 * 60), arLocalToUtc };
    }

    /**
     * Calcula los slots de una cancha para una fecha, con reservas/bloqueos ya cargados.
     * Lógica pura (sin acceso a DB) para poder reutilizarla en modo individual y batch.
     */
    private computeSlots(
        facility: {
            minBookingDuration: number;
            schedules: { dayOfWeek: number; openTime: string; closeTime: string; isActive: boolean }[];
            pricing: { dayOfWeek: number | null; startTime: string; endTime: string }[];
        },
        dateStr: string,
        bookings: { startDatetime: Date; endDatetime: Date }[],
        blockedSlots: { startDatetime: Date; endDatetime: Date }[],
    ): { available: boolean; slots: { time: string; available: boolean }[]; message?: string } {
        const { arLocalToUtc } = this.dayWindowUtc(dateStr);

        // Día de la semana en hora local AR (0=Lunes ... 6=Domingo)
        const jsDay = arLocalToUtc(0).getUTCDay(); // 0=Domingo
        const dayOfWeek = (jsDay + 6) % 7;

        const schedule = facility.schedules.find(
            (s) => s.dayOfWeek === dayOfWeek && s.isActive,
        );
        if (!schedule) {
            return { available: false, slots: [], message: 'Sin horario para este día' };
        }

        const hasPricing = facility.pricing.some(
            (p) => p.dayOfWeek === null || p.dayOfWeek === dayOfWeek,
        );
        if (!hasPricing) {
            return { available: false, slots: [], message: 'Sin tarifa para este día' };
        }

        const [openH, openM] = schedule.openTime.split(':').map(Number);
        const [closeH, closeM] = schedule.closeTime.split(':').map(Number);
        const startMin = openH * 60 + openM;
        let endMin = closeH * 60 + closeM;
        if (endMin <= startMin) endMin += 24 * 60; // cruza medianoche
        const duration = facility.minBookingDuration;

        const dayPricing = facility.pricing.filter(
            (p) => p.dayOfWeek === null || p.dayOfWeek === dayOfWeek,
        );
        const toMin = (t: string) => {
            const [hh, mm] = t.split(':').map(Number);
            return hh * 60 + mm;
        };
        const slotHasPricing = (mInDay: number): boolean =>
            dayPricing.some((p) => {
                const start = toMin(p.startTime);
                const end = toMin(p.endTime);
                if (end <= start) return mInDay >= start || mInDay < end;
                return mInDay >= start && mInDay < end;
            });

        const slots: { time: string; available: boolean }[] = [];
        const now = new Date();

        for (let m = startMin; m + duration <= endMin; m += duration) {
            const mInDay = m % (24 * 60);
            const h = Math.floor(mInDay / 60);
            const min = mInDay % 60;
            const timeStr = `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

            if (!slotHasPricing(mInDay)) continue;

            const slotStart = arLocalToUtc(m);
            const slotEnd = new Date(slotStart.getTime() + duration * 60000);

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
