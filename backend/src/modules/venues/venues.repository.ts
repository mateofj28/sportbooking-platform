import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVenueDto, UpdateVenueDto } from './dto/create-venue.dto';

@Injectable()
export class VenuesRepository {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.venue.findMany({
            where: { isActive: true },
            include: { sports: { include: { sport: true } } },
            orderBy: { name: 'asc' },
        });
    }

    async findById(id: string) {
        return this.prisma.venue.findUnique({
            where: { id },
            include: {
                sports: { include: { sport: true } },
                facilities: { include: { sport: true } },
            },
        });
    }

    async create(data: CreateVenueDto) {
        return this.prisma.venue.create({ data });
    }

    async update(id: string, data: UpdateVenueDto) {
        return this.prisma.venue.update({ where: { id }, data });
    }

    async deactivate(id: string) {
        return this.prisma.venue.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
