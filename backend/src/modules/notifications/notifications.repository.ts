import { Injectable } from '@nestjs/common';
import { Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsRepository {
    constructor(private prisma: PrismaService) {}

    /** Crea una notificación. */
    async create(data: {
        type: NotificationType;
        title: string;
        body: string;
        venueId?: string | null;
        adminOnly?: boolean;
        bookingId?: string | null;
        data?: Prisma.InputJsonValue;
    }) {
        return this.prisma.notification.create({
            data: {
                type: data.type,
                title: data.title,
                body: data.body,
                venueId: data.venueId ?? null,
                adminOnly: data.adminOnly ?? false,
                bookingId: data.bookingId ?? null,
                data: data.data,
            },
        });
    }

    /**
     * Lista paginada de notificaciones del scope indicado, más recientes primero.
     * Incluye el flag `read` (si el usuario tiene una lectura registrada).
     */
    async listForUser(
        scopeWhere: Prisma.NotificationWhereInput,
        userId: string,
        page = 1,
        limit = 20,
    ) {
        const take = Math.min(Math.max(limit, 1), 100);
        const skip = (Math.max(page, 1) - 1) * take;

        const [total, rows] = await this.prisma.$transaction([
            this.prisma.notification.count({ where: scopeWhere }),
            this.prisma.notification.findMany({
                where: scopeWhere,
                orderBy: { createdAt: 'desc' },
                skip,
                take,
                include: {
                    reads: { where: { userId }, select: { id: true } },
                },
            }),
        ]);

        const data = rows.map((n) => {
            const { reads, ...rest } = n;
            return { ...rest, read: reads.length > 0 };
        });

        return {
            data,
            meta: { total, page: Math.max(page, 1), limit: take, totalPages: Math.ceil(total / take) },
        };
    }

    /** Cantidad de no leídas por el usuario dentro de su scope. */
    async countUnread(scopeWhere: Prisma.NotificationWhereInput, userId: string) {
        return this.prisma.notification.count({
            where: { ...scopeWhere, reads: { none: { userId } } },
        });
    }

    /**
     * Verifica que la notificación esté dentro del scope del usuario y la marca
     * como leída (idempotente vía upsert por la unique notificationId+userId).
     */
    async markRead(scopeWhere: Prisma.NotificationWhereInput, userId: string, notificationId: string) {
        const notif = await this.prisma.notification.findFirst({
            where: { ...scopeWhere, id: notificationId },
            select: { id: true },
        });
        if (!notif) return null;

        await this.prisma.notificationRead.upsert({
            where: { notificationId_userId: { notificationId, userId } },
            create: { notificationId, userId },
            update: {},
        });
        return { id: notificationId };
    }

    /** Marca como leídas todas las del scope aún no leídas por el usuario. */
    async markAllRead(scopeWhere: Prisma.NotificationWhereInput, userId: string) {
        const unread = await this.prisma.notification.findMany({
            where: { ...scopeWhere, reads: { none: { userId } } },
            select: { id: true },
        });
        if (unread.length === 0) return { count: 0 };

        const result = await this.prisma.notificationRead.createMany({
            data: unread.map((n) => ({ notificationId: n.id, userId })),
            skipDuplicates: true,
        });
        return { count: result.count };
    }
}
