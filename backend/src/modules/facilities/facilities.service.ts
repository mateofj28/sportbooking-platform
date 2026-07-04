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
    }) {
        return this.facilitiesRepository.findAll(filters);
    }

    async findById(id: string) {
        const facility = await this.facilitiesRepository.findById(id);
        if (!facility) {
            throw new NotFoundException('Facility not found');
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
            include: { schedules: true },
        });

        if (!facility) throw new NotFoundException('Instalación no encontrada');

        const date = new Date(dateStr);
        const dayOfWeek = (date.getDay() + 6) % 7;
        const schedule = facility.schedules.find(
            (s) => s.dayOfWeek === dayOfWeek && s.isActive,
        );

        if (!schedule) {
            return { available: false, slots: [], message: 'Cerrado este día' };
        }

        // Generate all possible slots
        const [openH, openM] = schedule.openTime.split(':').map(Number);
        const [closeH, closeM] = schedule.closeTime.split(':').map(Number);
        const startMin = openH * 60 + openM;
        const endMin = closeH * 60 + closeM;
        const duration = facility.minBookingDuration;

        // Get existing bookings for that day
        const dayStart = new Date(dateStr);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dateStr);
        dayEnd.setHours(23, 59, 59, 999);

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
        const isToday = date.toDateString() === now.toDateString();

        for (let m = startMin; m + duration <= endMin; m += duration) {
            const h = Math.floor(m / 60);
            const min = m % 60;
            const timeStr = `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

            // Check if in the past for today
            if (isToday && (h * 60 + min) <= (now.getHours() * 60 + now.getMinutes())) {
                slots.push({ time: timeStr, available: false });
                continue;
            }

            // Check conflicts with bookings
            const slotStart = new Date(dateStr);
            slotStart.setHours(h, min, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + duration * 60000);

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
