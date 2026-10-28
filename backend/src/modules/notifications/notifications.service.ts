import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { NotificationsRepository } from './notifications.repository';

type AuthUser = { id: string; role: Role; venueId?: string | null };

@Injectable()
export class NotificationsService {
    constructor(private readonly repo: NotificationsRepository) {}

    /**
     * Scope de notificaciones según el rol:
     * - VENUE_ADMIN: solo las de su sede (venueId).
     * - ADMIN general: todas (sin filtro de scope).
     */
    private scopeFor(user: AuthUser): Prisma.NotificationWhereInput {
        if (user.role === Role.VENUE_ADMIN && user.venueId) {
            return { venueId: user.venueId };
        }
        // ADMIN general ve todo
        return {};
    }

    async list(user: AuthUser, page = 1, limit = 20) {
        return this.repo.listForUser(this.scopeFor(user), user.id, page, limit);
    }

    async unreadCount(user: AuthUser) {
        const count = await this.repo.countUnread(this.scopeFor(user), user.id);
        return { count };
    }

    async markRead(user: AuthUser, id: string) {
        const res = await this.repo.markRead(this.scopeFor(user), user.id, id);
        return { ok: !!res };
    }

    async markAllRead(user: AuthUser) {
        return this.repo.markAllRead(this.scopeFor(user), user.id);
    }
}
