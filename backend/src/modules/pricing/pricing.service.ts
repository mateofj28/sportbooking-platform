import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePricingDto, UpdatePricingDto } from './dto/create-pricing.dto';

// Cierre máximo permitido en madrugada (02:00)
const MAX_OVERNIGHT_CLOSE = 2 * 60; // minutos

/** "HH:MM" -> minutos desde medianoche */
function toMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

/** Rango en minutos [inicio, fin). Si cruza medianoche, extiende el fin +24h */
function rangeMinutes(start: string, end: string): [number, number] {
    const s = toMinutes(start);
    let e = toMinutes(end);
    if (e <= s) e += 24 * 60;
    return [s, e];
}

/** Dos rangos (posiblemente nocturnos) se solapan */
function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    const [aS, aE] = rangeMinutes(startA, endA);
    const [bS, bE] = rangeMinutes(startB, endB);
    return aS < bE && bS < aE;
}

/**
 * Valida un rango. Permite rangos normales o que cruzan medianoche
 * siempre que el cierre no pase de las 02:00.
 */
function validateRange(start: string, end: string) {
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s === e) {
        throw new BadRequestException('La hora de inicio y fin no pueden ser iguales');
    }
    if (e < s && e > MAX_OVERNIGHT_CLOSE) {
        throw new BadRequestException(
            'Las franjas que cruzan medianoche solo pueden terminar hasta las 2:00 AM',
        );
    }
}

@Injectable()
export class PricingService {
    constructor(private prisma: PrismaService) { }

    async findByFacility(facilityId: string) {
        return this.prisma.pricing.findMany({
            where: { facilityId, isActive: true },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });
    }

    async create(facilityId: string, dto: CreatePricingDto) {
        validateRange(dto.startTime, dto.endTime);

        await this.assertNoOverlap(facilityId, dto.dayOfWeek ?? null, dto.startTime, dto.endTime);

        return this.prisma.pricing.create({
            data: { ...dto, facilityId },
        });
    }

    /**
     * Verifica que la franja no se solape con tarifas existentes.
     * Una franja "todos los días" (dayOfWeek null) solapa con cualquier día,
     * y un día específico solapa con las franjas "todos los días".
     */
    private async assertNoOverlap(
        facilityId: string,
        dayOfWeek: number | null,
        startTime: string,
        endTime: string,
        excludeId?: string,
    ) {
        const existing = await this.prisma.pricing.findMany({
            where: { facilityId, isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
        });

        const conflict = existing.find((p) => {
            // Coinciden en día si alguno es "todos los días" (null) o si es el mismo día
            const sameDay =
                dayOfWeek === null || p.dayOfWeek === null || p.dayOfWeek === dayOfWeek;
            if (!sameDay) return false;
            // Se solapan las horas (con soporte de cruce de medianoche)
            return rangesOverlap(startTime, endTime, p.startTime, p.endTime);
        });

        if (conflict) {
            throw new BadRequestException(
                'La franja horaria se superpone con otra tarifa ya configurada para esta instalación',
            );
        }
    }

    async update(id: string, dto: UpdatePricingDto) {
        const pricing = await this.prisma.pricing.findUnique({ where: { id } });
        if (!pricing) throw new NotFoundException('Pricing not found');

        const startTime = dto.startTime ?? pricing.startTime;
        const endTime = dto.endTime ?? pricing.endTime;
        const dayOfWeek = dto.dayOfWeek !== undefined ? dto.dayOfWeek : pricing.dayOfWeek;

        validateRange(startTime, endTime);

        await this.assertNoOverlap(pricing.facilityId, dayOfWeek, startTime, endTime, id);

        return this.prisma.pricing.update({
            where: { id },
            data: dto,
        });
    }

    async remove(id: string) {
        const pricing = await this.prisma.pricing.findUnique({ where: { id } });
        if (!pricing) throw new NotFoundException('Pricing not found');

        return this.prisma.pricing.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
