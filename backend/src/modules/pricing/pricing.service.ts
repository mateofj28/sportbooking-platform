import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePricingDto, UpdatePricingDto } from './dto/create-pricing.dto';

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
        // La hora de fin debe ser posterior a la de inicio
        if (dto.startTime >= dto.endTime) {
            throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
        }

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
            // Se solapan las horas
            return startTime < p.endTime && endTime > p.startTime;
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

        if (startTime >= endTime) {
            throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
        }

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
