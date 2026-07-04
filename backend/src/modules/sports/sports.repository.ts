import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSportDto, UpdateSportDto } from './dto/create-sport.dto';

@Injectable()
export class SportsRepository {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.sport.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });
    }

    async findById(id: string) {
        return this.prisma.sport.findUnique({ where: { id } });
    }

    async create(data: CreateSportDto) {
        return this.prisma.sport.create({ data });
    }

    async update(id: string, data: UpdateSportDto) {
        return this.prisma.sport.update({ where: { id }, data });
    }

    async deactivate(id: string) {
        return this.prisma.sport.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
