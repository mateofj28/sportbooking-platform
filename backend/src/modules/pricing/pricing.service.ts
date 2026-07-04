import { Injectable, NotFoundException } from '@nestjs/common';
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
        return this.prisma.pricing.create({
            data: { ...dto, facilityId },
        });
    }

    async update(id: string, dto: UpdatePricingDto) {
        const pricing = await this.prisma.pricing.findUnique({ where: { id } });
        if (!pricing) throw new NotFoundException('Pricing not found');

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
