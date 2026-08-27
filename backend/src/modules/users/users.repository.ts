import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationParams } from '../../common/interfaces/pagination.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersRepository {
    constructor(private prisma: PrismaService) { }

    async findAll(params: PaginationParams) {
        const { page = 1, limit = 10, search } = params;
        const skip = (page - 1) * limit;

        const where = search
            ? {
                OR: [
                    { firstName: { contains: search, mode: 'insensitive' as const } },
                    { lastName: { contains: search, mode: 'insensitive' as const } },
                    { email: { contains: search, mode: 'insensitive' as const } },
                ],
            }
            : {};

        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip,
                take: limit,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                    dni: true,
                    avatarUrl: true,
                    role: true,
                    venueId: true,
                    isActive: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.user.count({ where }),
        ]);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                dni: true,
                avatarUrl: true,
                role: true,
                venueId: true,
                isActive: true,
                createdAt: true,
            },
        });
    }

    async update(id: string, data: any) {
        return this.prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                dni: true,
                avatarUrl: true,
                role: true,
                venueId: true,
                isActive: true,
            },
        });
    }

    async create(data: { email: string; password: string; firstName: string; lastName: string; phone?: string; dni?: string; role?: any; venueId?: string }) {
        const passwordHash = await bcrypt.hash(data.password, 12);
        return this.prisma.user.create({
            data: {
                email: data.email,
                passwordHash,
                firstName: data.firstName,
                lastName: data.lastName,
                phone: data.phone,
                dni: data.dni,
                role: data.role || 'CLIENT',
                venueId: data.venueId || null,
                emailVerified: true,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                dni: true,
                avatarUrl: true,
                role: true,
                venueId: true,
                isActive: true,
            },
        });
    }
}
