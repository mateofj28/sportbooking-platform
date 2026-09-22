import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tareas programadas de reservas.
 * Cancela automáticamente los turnos fijos no pagados cuando falta menos de
 * 24h para el inicio, liberando el horario (la disponibilidad solo cuenta las
 * reservas CONFIRMED, así que al cancelar queda libre).
 */
@Injectable()
export class BookingsCronService {
    private readonly logger = new Logger(BookingsCronService.name);

    constructor(private readonly prisma: PrismaService) { }

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
            select: { id: true },
        });

        if (toCancel.length === 0) return;

        const result = await this.prisma.booking.updateMany({
            where: { id: { in: toCancel.map((b) => b.id) } },
            data: {
                status: BookingStatus.CANCELLED,
                cancelledAt: now,
                cancellationReason: 'Cancelada automáticamente por falta de pago (menos de 24h de antelación)',
            },
        });

        this.logger.log(
            `Cancelación automática: ${result.count} reserva(s) de turno fijo sin pago (< 24h) canceladas`,
        );
    }
}
