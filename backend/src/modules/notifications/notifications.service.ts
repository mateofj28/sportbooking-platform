import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role, NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsRepository } from './notifications.repository';

type AuthUser = { id: string; role: Role; venueId?: string | null };

/** Booking con las relaciones que usan los emisores (facility.venue/sport, user). */
type BookingForNotif = {
    id: string;
    startDatetime: Date | string;
    endDatetime: Date | string;
    totalPrice?: any;
    basePrice?: any;
    commissionAmount?: any;
    facility?: {
        name?: string;
        venueId?: string;
        venue?: { id?: string; name?: string };
    };
    user?: { id?: string; firstName?: string; lastName?: string };
};

const AR_OFFSET_MIN = 3 * 60;
const DAYS_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        private readonly repo: NotificationsRepository,
        private readonly prisma: PrismaService,
    ) { }

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

    // ----------------------------------------------------------------------
    // EMISIÓN (best-effort: nunca lanza, no bloquea la operación de negocio)
    // ----------------------------------------------------------------------

    /** Crea una notificación. Si algo falla, loguea y sigue (no propaga). */
    async emit(input: {
        type: NotificationType;
        title: string;
        body: string;
        venueId?: string | null;
        adminOnly?: boolean;
        bookingId?: string | null;
        data?: Record<string, unknown>;
    }): Promise<void> {
        try {
            await this.repo.create({
                type: input.type,
                title: input.title,
                body: input.body,
                venueId: input.venueId ?? null,
                adminOnly: input.adminOnly ?? false,
                bookingId: input.bookingId ?? null,
                data: input.data as Prisma.InputJsonValue,
            });
        } catch (err) {
            this.logger.error(`No se pudo emitir notificación "${input.type}": ${err}`);
        }
    }

    // ---- Helpers de formato en hora Argentina (UTC-3) ----
    private toAr(d: Date | string): Date {
        return new Date(new Date(d).getTime() - AR_OFFSET_MIN * 60000);
    }
    private arDateLabel(d: Date | string): string {
        return this.toAr(d).toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
        });
    }
    private arTime(d: Date | string): string {
        const ar = this.toAr(d);
        let h = ar.getUTCHours();
        const m = ar.getUTCMinutes();
        const ampm = h < 12 ? 'a. m.' : 'p. m.';
        h = h % 12; if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
    }
    private money(v: any): string {
        return `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`;
    }
    private clientName(b: BookingForNotif): string {
        return `${b.user?.firstName ?? ''} ${b.user?.lastName ?? ''}`.trim() || 'Un cliente';
    }
    /** Datos comunes de una reserva para guardar en `data` (render sin más queries). */
    private bookingData(b: BookingForNotif) {
        return {
            bookingId: b.id,
            cliente: this.clientName(b),
            cancha: b.facility?.name ?? '',
            sede: b.facility?.venue?.name ?? '',
            fecha: this.arDateLabel(b.startDatetime),
            horario: `${this.arTime(b.startDatetime)} - ${this.arTime(b.endDatetime)}`,
            base: Number(b.basePrice) || 0,
            total: Number(b.totalPrice) || 0,
            comision: Number(b.commissionAmount) || 0,
        };
    }

    // ---- Emisores por evento ----

    /** N1/N7: nueva reserva. Notifica a la sede y (por scope) al admin general. */
    async notifyBookingCreated(b: BookingForNotif) {
        const venueId = b.facility?.venue?.id ?? b.facility?.venueId ?? null;
        await this.emit({
            type: NotificationType.BOOKING_CREATED,
            title: 'Nueva reserva',
            body: `${this.clientName(b)} reservó ${b.facility?.name ?? 'una cancha'} para el ${this.arDateLabel(b.startDatetime)} a las ${this.arTime(b.startDatetime)}.`,
            venueId,
            bookingId: b.id,
            data: this.bookingData(b),
        });
        // N6: ¿primer booking de este cliente en la sede?
        await this.maybeNotifyNewClient(b, venueId);
    }

    /** N2: reserva pagada. */
    async notifyBookingPaid(b: BookingForNotif) {
        const venueId = b.facility?.venue?.id ?? b.facility?.venueId ?? null;
        await this.emit({
            type: NotificationType.BOOKING_PAID,
            title: 'Reserva pagada',
            body: `${this.clientName(b)} pagó la reserva de ${b.facility?.name ?? 'una cancha'} (${this.money(b.basePrice)}).`,
            venueId,
            bookingId: b.id,
            data: this.bookingData(b),
        });
    }

    /** N3/N5: reserva cancelada (manual o automática). */
    async notifyBookingCancelled(b: BookingForNotif, reason?: string, auto = false) {
        const venueId = b.facility?.venue?.id ?? b.facility?.venueId ?? null;
        await this.emit({
            type: auto ? NotificationType.BOOKING_AUTO_CANCELLED : NotificationType.BOOKING_CANCELLED,
            title: auto ? 'Reserva cancelada por falta de pago' : 'Reserva cancelada',
            body: auto
                ? `Se canceló automáticamente la reserva de ${this.clientName(b)} en ${b.facility?.name ?? 'una cancha'} (${this.arDateLabel(b.startDatetime)}) por falta de pago.`
                : `${this.clientName(b)} canceló su reserva de ${b.facility?.name ?? 'una cancha'} (${this.arDateLabel(b.startDatetime)}).${reason ? ` Motivo: ${reason}` : ''}`,
            venueId,
            bookingId: b.id,
            data: { ...this.bookingData(b), motivo: reason ?? null, auto },
        });
    }

    /** N4: turno fijo creado. */
    async notifyRecurringCreated(args: {
        venueId?: string | null;
        facilityName?: string;
        clientName?: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        createdCount: number;
    }) {
        await this.emit({
            type: NotificationType.RECURRING_CREATED,
            title: 'Nuevo turno fijo',
            body: `${args.clientName || 'Un cliente'} creó un turno fijo en ${args.facilityName || 'una cancha'} los ${DAYS_ES[args.dayOfWeek] ?? ''} de ${args.startTime} a ${args.endTime} (${args.createdCount} fechas).`,
            venueId: args.venueId ?? null,
            data: {
                cancha: args.facilityName ?? '',
                cliente: args.clientName ?? '',
                dia: DAYS_ES[args.dayOfWeek] ?? '',
                horario: `${args.startTime} - ${args.endTime}`,
                fechas: args.createdCount,
            },
        });
    }

    /** N6: primer booking de un cliente en la sede. */
    private async maybeNotifyNewClient(b: BookingForNotif, venueId: string | null) {
        try {
            const userId = b.user?.id;
            if (!userId || !venueId) return;
            const previous = await this.prisma.booking.count({
                where: {
                    userId,
                    facility: { venueId },
                    id: { not: b.id },
                },
            });
            if (previous > 0) return; // no es nuevo
            await this.emit({
                type: NotificationType.NEW_CLIENT,
                title: 'Nuevo cliente',
                body: `${this.clientName(b)} hizo su primera reserva en tu complejo.`,
                venueId,
                data: { cliente: this.clientName(b) },
            });
        } catch (err) {
            this.logger.error(`maybeNotifyNewClient falló: ${err}`);
        }
    }

    /** N8: comisión generada para la empresa (solo admin general). */
    async notifyCommissionEarned(args: { venueName?: string; amount: number }) {
        await this.emit({
            type: NotificationType.COMMISSION_EARNED,
            title: 'Comisión generada',
            body: `Se reconoció ${this.money(args.amount)} de comisión${args.venueName ? ` en ${args.venueName}` : ''}.`,
            adminOnly: true,
            data: { sede: args.venueName ?? '', comision: args.amount },
        });
    }

    /** N9: alta de complejo o cancha (solo admin general). */
    async notifyVenueOrFacilityCreated(args: { label: string }) {
        await this.emit({
            type: NotificationType.VENUE_OR_FACILITY_CREATED,
            title: 'Alta en la plataforma',
            body: args.label,
            adminOnly: true,
            data: { label: args.label },
        });
    }

    /** N10: nuevo usuario registrado (solo admin general). */
    async notifyUserRegistered(args: { name: string; email?: string }) {
        await this.emit({
            type: NotificationType.USER_REGISTERED,
            title: 'Nuevo usuario registrado',
            body: `${args.name} se registró en la plataforma.`,
            adminOnly: true,
            data: { nombre: args.name, email: args.email ?? '' },
        });
    }
}
