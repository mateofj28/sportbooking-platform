import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/create-schedule.dto';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Cierre máximo permitido en madrugada (02:00)
const MAX_OVERNIGHT_CLOSE = 2 * 60; // minutos

/** "HH:MM" -> minutos desde medianoche */
function toMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Devuelve el rango en minutos [inicio, fin). Si cruza medianoche (cierre <= apertura),
 * el fin se extiende sumando 24h para poder comparar intervalos linealmente.
 */
function rangeMinutes(open: string, close: string): [number, number] {
    const start = toMinutes(open);
    let end = toMinutes(close);
    if (end <= start) end += 24 * 60; // cruza medianoche
    return [start, end];
}

/** Dos rangos (posiblemente nocturnos) se solapan */
function rangesOverlap(openA: string, closeA: string, openB: string, closeB: string): boolean {
    const [aS, aE] = rangeMinutes(openA, closeA);
    const [bS, bE] = rangeMinutes(openB, closeB);
    return aS < bE && bS < aE;
}

/**
 * Valida un rango horario. Permite rangos normales (cierre > apertura) y
 * rangos que cruzan medianoche siempre que el cierre no pase de las 02:00.
 * Lanza BadRequestException si es inválido.
 */
function validateRange(open: string, close: string) {
    const start = toMinutes(open);
    const end = toMinutes(close);
    if (start === end) {
        throw new BadRequestException('La hora de apertura y cierre no pueden ser iguales');
    }
    if (end < start) {
        // Cruza medianoche: solo permitido hasta las 02:00
        if (end > MAX_OVERNIGHT_CLOSE) {
            throw new BadRequestException(
                'Los horarios que cruzan medianoche solo pueden cerrar hasta las 2:00 AM',
            );
        }
    }
}

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
        validateRange(dto.openTime, dto.closeTime);

        // No permitir horarios solapados el mismo día para la misma instalación
        const sameDay = await this.prisma.schedule.findMany({
            where: { facilityId, dayOfWeek: dto.dayOfWeek, isActive: true },
        });

        const overlaps = sameDay.some(
            (s) => rangesOverlap(dto.openTime, dto.closeTime, s.openTime, s.closeTime),
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

        const dayOfWeek = dto.dayOfWeek ?? schedule.dayOfWeek;
        const openTime = dto.openTime ?? schedule.openTime;
        const closeTime = dto.closeTime ?? schedule.closeTime;

        validateRange(openTime, closeTime);

        // Validar solapamiento con otros horarios del mismo día (excluyendo el actual)
        const sameDay = await this.prisma.schedule.findMany({
            where: { facilityId: schedule.facilityId, dayOfWeek, isActive: true, id: { not: id } },
        });

        const overlaps = sameDay.some(
            (s) => rangesOverlap(openTime, closeTime, s.openTime, s.closeTime),
        );

        if (overlaps) {
            throw new BadRequestException(
                `Ya existe un horario para ${DAY_NAMES[dayOfWeek] ?? 'ese día'} que se superpone con el rango indicado`,
            );
        }

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
