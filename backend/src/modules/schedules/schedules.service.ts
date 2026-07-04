import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/create-schedule.dto';

@Injectable()
export class SchedulesService {
    constructor(private prisma: PrismaService) { }

    async findByFacility(facilityId: string) {
        return this.prisma.schedule.findMany({
            where: { facilityId, isActive: true },
            orderBy: { dayOfWeek: 'asc' },
        });
    }

    async create(facilityId: string, dto: CreateScheduleDto) {
        return this.prisma.schedule.create({
            data: { ...dto, facilityId },
        });
    }

    async update(id: string, dto: UpdateScheduleDto) {
        const schedule = await this.prisma.schedule.findUnique({ where: { id } });
        if (!schedule) throw new NotFoundException('Schedule not found');

        return this.prisma.schedule.update({
            where: { id },
            data: dto,
        });
    }

    async remove(id: string) {
        const schedule = await this.prisma.schedule.findUnique({ where: { id } });
        if (!schedule) throw new NotFoundException('Schedule not found');

        return this.prisma.schedule.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
