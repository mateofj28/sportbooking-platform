import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Tareas programadas de reservas.
 * Cancela automáticamente los turnos fijos no pagados cuando falta menos de
 * 24h para el inicio, liberando el horario (la disponibilidad solo cuenta las
 * reservas CONFIRMED, así que al cancelar queda libre).
 */
@Injectable()
export class BookingsCronService {
    private readonly logger = new Logger(BookingsCronService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
    ) { }

    @Cron(CronExpression.EVERY_HOUR)
    async cancelUnpaidRecurringBookings() {
        const now = new Date();
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        // Turnos fijos: reservas confirmadas, pendientes de pago, cuyo inicio
        // ocurre dentro de las próximas 24h (y aún no pasó).
        const toCancel = await this.prisma.booking.findMany({
            where: {
                recurringBookingId: { not: null },
                status: BookingStatus.CONFIRMED,
                paymentStatus: 'PENDING',
                startDatetime: { gt: now, lte: in24h },
            },
            include: {
                facility: { include: { venue: { select: { name: true } } } },
                user: { select: { email: true, firstName: true } },
            },
        });

        if (toCancel.length === 0) return;

        const reason = 'Cancelada automáticamente por falta de pago (menos de 24h de antelación)';
        const result = await this.prisma.booking.updateMany({
            where: { id: { in: toCancel.map((b) => b.id) } },
            data: { status: BookingStatus.CANCELLED, cancelledAt: now, cancellationReason: reason },
        });

        // Avisar por email a cada cliente afectado (best-effort)
        for (const b of toCancel) {
            if (!b.user?.email) continue;
            void this.mailService.sendBookingCancellation({
                email: b.user.email,
                firstName: b.user.firstName || '',
                venueName: b.facility?.venue?.name || '',
                facilityName: b.facility?.name || '',
                dateLabel: this.arDateLabel(b.startDatetime),
                timeLabel: `${this.arTime(b.startDatetime)} - ${this.arTime(b.endDatetime)}`,
                reason,
            });
        }

        this.logger.log(
            `Cancelación automática: ${result.count} reserva(s) de turno fijo sin pago (< 24h) canceladas`,
        );
    }

    /** Fecha larga en hora AR (UTC-3). */
    private arDateLabel(d: Date): string {
        const ar = new Date(new Date(d).getTime() - 3 * 60 * 60000);
        return ar.toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
        });
    }

    /** Hora 12h en hora AR (UTC-3). */
    private arTime(d: Date): string {
        const ar = new Date(new Date(d).getTime() - 3 * 60 * 60000);
        let h = ar.getUTCHours();
        const m = ar.getUTCMinutes();
        const ampm = h < 12 ? 'a. m.' : 'p. m.';
        h = h % 12; if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    /**
     * Marca como COMPLETED las reservas pagadas cuya hora de fin ya pasó.
     * Regla de negocio: si estaba pagada y no se canceló, se asume que se usó.
     */
    @Cron(CronExpression.EVERY_HOUR)
    async completePastPaidBookings() {
        const now = new Date();

        const result = await this.prisma.booking.updateMany({
            where: {
                status: BookingStatus.CONFIRMED,
                paymentStatus: 'PAID',
                endDatetime: { lt: now },
            },
            data: { status: BookingStatus.COMPLETED },
        });

        if (result.count > 0) {
            this.logger.log(`Completado automático: ${result.count} reserva(s) pagada(s) ya pasada(s) marcadas como COMPLETED`);
        }
    }
}
