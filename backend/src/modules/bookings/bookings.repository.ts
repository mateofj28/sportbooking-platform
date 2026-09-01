import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class BookingsRepository {
    constructor(private prisma: PrismaService) { }

    async findAll(userId?: string, status?: BookingStatus, page = 1, limit = 20) {
        const where: Record<string, unknown> = {};
        if (userId) where.userId = userId;
        if (status) where.status = status;

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.booking.findMany({
                where,
                skip,
                take: limit,
                include: {
                    facility: {
                        include: {
                            sport: true,
                            venue: { select: { id: true, name: true, address: true } },
                            pricing: { where: { isActive: true } },
                        },
                    },
                    user: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
                orderBy: { startDatetime: 'desc' },
            }),
            this.prisma.booking.count({ where }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findById(id: string) {
        return this.prisma.booking.findUnique({
            where: { id },
            include: {
                facility: {
                    include: {
                        sport: true,
                        venue: true,
                    },
                },
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    }

    async findConflicting(facilityId: string, startDatetime: Date, endDatetime: Date, excludeId?: string) {
        const where: Record<string, unknown> = {
            facilityId,
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            startDatetime: { lt: endDatetime },
            endDatetime: { gt: startDatetime },
        };

        if (excludeId) {
            where.id = { not: excludeId };
        }

        return this.prisma.booking.findFirst({ where });
    }

    async create(data: {
        facilityId: string;
        userId: string;
        startDatetime: Date;
        endDatetime: Date;
        totalPrice: number;
        currency: string;
        notes?: string;
        createdById: string;
        status?: BookingStatus;
    }) {
        return this.prisma.booking.create({
            data: {
                ...data,
                status: data.status || BookingStatus.PENDING,
            },
            include: {
                facility: { include: { sport: true, venue: true } },
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
    }

    async updateStatus(id: string, status: BookingStatus) {
        return this.prisma.booking.update({
            where: { id },
            data: { status },
        });
    }

    async cancel(id: string, cancelledById: string, reason?: string) {
        return this.prisma.booking.update({
            where: { id },
            data: {
                status: BookingStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelledById,
                cancellationReason: reason,
            },
        });
    }
}
