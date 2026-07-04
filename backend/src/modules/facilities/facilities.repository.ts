import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFacilityDto, UpdateFacilityDto } from './dto/create-facility.dto';

interface FacilityFilters {
    sportId?: string;
    venueId?: string;
    isIndoor?: boolean;
    search?: string;
}

@Injectable()
export class FacilitiesRepository {
    constructor(private prisma: PrismaService) { }

    async findAll(filters: FacilityFilters) {
        const where: Record<string, unknown> = { isActive: true };

        if (filters.sportId) where.sportId = filters.sportId;
        if (filters.venueId) where.venueId = filters.venueId;
        if (filters.isIndoor !== undefined) where.isIndoor = filters.isIndoor;
        if (filters.search) {
            where.name = { contains: filters.search, mode: 'insensitive' };
        }

        return this.prisma.facility.findMany({
            where,
            include: {
                sport: true,
                venue: { select: { id: true, name: true, city: true, address: true } },
            },
            orderBy: { name: 'asc' },
        });
    }

    async findById(id: string) {
        return this.prisma.facility.findUnique({
            where: { id },
            include: {
                sport: true,
                venue: true,
                schedules: { where: { isActive: true } },
                pricing: { where: { isActive: true } },
            },
        });
    }

    async create(data: CreateFacilityDto) {
        return this.prisma.facility.create({
            data,
            include: { sport: true, venue: true },
        });
    }

    async update(id: string, data: UpdateFacilityDto) {
        return this.prisma.facility.update({
            where: { id },
            data,
            include: { sport: true, venue: true },
        });
    }

    async deactivate(id: string) {
        return this.prisma.facility.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
