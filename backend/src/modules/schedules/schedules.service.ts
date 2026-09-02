import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/create-schedule.dto';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

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
        // La hora de cierre debe ser posterior a la de apertura
        if (dto.openTime >= dto.closeTime) {
            throw new BadRequestException('La hora de cierre debe ser posterior a la de apertura');
        }

        // No permitir horarios solapados el mismo día para la misma instalación
        const sameDay = await this.prisma.schedule.findMany({
            where: { facilityId, dayOfWeek: dto.dayOfWeek, isActive: true },
        });

        const overlaps = sameDay.some(
            (s) => dto.openTime < s.closeTime && dto.closeTime > s.openTime,
        );

        if (overlaps) {
            throw new BadRequestException(
                `Ya existe un horario para ${DAY_NAMES[dto.dayOfWeek] ?? 'ese día'} que se superpone con el rango indicado`,
            );
        }

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
