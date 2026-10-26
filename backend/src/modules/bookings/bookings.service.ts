import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { BookingStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingsRepository } from './bookings.repository';
import { MailService, BookingEmailData } from '../mail/mail.service';
import { CreateBookingDto, ManualBookingDto, CancelBookingDto, CreateRecurringBookingDto } from './dto/create-booking.dto';

/** "19:00" -> "7:00 p. m." (formato español sin cero adelante) */
function formatTime12h(time: string): string {
    if (!time) return '';
    const [rawH, m] = time.split(':').map(Number);
    const h = ((rawH % 24) + 24) % 24;
    const ampm = h < 12 ? 'a. m.' : 'p. m.';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

@Injectable()
export class BookingsService {
    constructor(
        private readonly bookingsRepository: BookingsRepository,
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
    ) { }

    /** Arma los datos del correo a partir de una reserva con facility+venue+user. */
    private toEmailData(booking: any): BookingEmailData | null {
        const email = booking.user?.email;
        if (!email) return null;
        const AR_OFFSET_MIN = 3 * 60;
        const startAr = new Date(new Date(booking.startDatetime).getTime() - AR_OFFSET_MIN * 60000);
        const endAr = new Date(new Date(booking.endDatetime).getTime() - AR_OFFSET_MIN * 60000);
        const fmtTime = (d: Date) => {
            let h = d.getUTCHours();
            const m = d.getUTCMinutes();
            const ampm = h < 12 ? 'a. m.' : 'p. m.';
            h = h % 12; if (h === 0) h = 12;
            return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
        };
        const dateLabel = startAr.toLocaleDateString('es-AR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
        });
        return {
            email,
            firstName: booking.user.firstName || '',
            venueName: booking.facility?.venue?.name || '',
            facilityName: booking.facility?.name || '',
            dateLabel,
            timeLabel: `${fmtTime(startAr)} - ${fmtTime(endAr)}`,
            priceLabel: booking.totalPrice != null ? `$${Math.round(Number(booking.totalPrice)).toLocaleString('es-AR')} ${booking.currency || 'ARS'}` : undefined,
            paymentPending: booking.paymentStatus === 'PENDING',
        };
    }

    async findAll(
        user: { id: string; role: Role; venueId?: string | null },
        status?: BookingStatus,
        page = 1,
        limit = 20,
    ) {
        // ADMIN general: todas las reservas
        if (user.role === Role.ADMIN) {
            return this.bookingsRepository.findAll(undefined, status, page, limit);
        }
        // ADMIN de sede: solo reservas de las instalaciones de su sede
        if (user.role === Role.VENUE_ADMIN && user.venueId) {
            return this.bookingsRepository.findAll(
                undefined,
                status,
                page,
                limit,
                user.venueId,
            );
        }
        // Cliente (o admin de sede sin sede asignada): solo sus reservas
        return this.bookingsRepository.findAll(user.id, status, page, limit);
    }

    async findById(id: string) {
        const booking = await this.bookingsRepository.findById(id);
        if (!booking) {
            throw new NotFoundException('Reserva no encontrada');
        }
        return booking;
    }

    async create(dto: CreateBookingDto, userId: string) {
        const startDatetime = new Date(dto.startDatetime);
        const endDatetime = new Date(dto.endDatetime);

        await this.validateBooking(dto.facilityId, startDatetime, endDatetime);

        const price = await this.calculatePrice(dto.facilityId, startDatetime, endDatetime);

        const booking = await this.bookingsRepository.create({
            facilityId: dto.facilityId,
            userId,
            startDatetime,
            endDatetime,
            totalPrice: price.total,
            basePrice: price.base,
            commissionAmount: price.commission,
            currency: 'ARS',
            notes: dto.notes,
            createdById: userId,
            status: BookingStatus.CONFIRMED,
            paymentStatus: 'PAID', // reserva única: se considera pagada al crear
            paidAt: new Date(),
        });

        // Correo de confirmación (best-effort, no bloquea la reserva)
        const emailData = this.toEmailData(booking);
        if (emailData) void this.mailService.sendBookingConfirmation(emailData);

        return booking;
    }

    async createManual(
        dto: ManualBookingDto,
        actor: { id: string; role: Role; venueId?: string | null },
    ) {
        const startDatetime = new Date(dto.startDatetime);
        const endDatetime = new Date(dto.endDatetime);

        // El admin de sede solo puede crear reservas en instalaciones de su sede
        if (actor.role === Role.VENUE_ADMIN) {
            const facility = await this.prisma.facility.findUnique({
                where: { id: dto.facilityId },
                select: { venueId: true },
            });
            if (!facility) throw new NotFoundException('Instalación no encontrada');
            if (facility.venueId !== actor.venueId) {
                throw new BadRequestException(
                    'Solo puedes crear reservas en instalaciones de tu sede',
                );
            }
        }

        await this.validateBooking(dto.facilityId, startDatetime, endDatetime);

        const price = await this.calculatePrice(dto.facilityId, startDatetime, endDatetime);

        const booking = await this.bookingsRepository.create({
            facilityId: dto.facilityId,
            userId: dto.userId,
            startDatetime,
            endDatetime,
            totalPrice: price.total,
            basePrice: price.base,
            commissionAmount: price.commission,
            currency: 'ARS',
            notes: dto.notes,
            createdById: actor.id,
            status: BookingStatus.CONFIRMED,
            paymentStatus: 'PAID', // reserva manual única: pagada al crear
            paidAt: new Date(),
        });

        const emailData = this.toEmailData(booking);
        if (emailData) void this.mailService.sendBookingConfirmation(emailData);

        return booking;
    }

    /**
     * Marca una reserva como pagada. Por ahora solo cambia el estado de pago
     * (sin pasarela). El cliente solo puede pagar sus propias reservas.
     */
    async markAsPaid(id: string, user: { id: string; role: Role; venueId?: string | null }) {
        const booking = await this.findById(id);
        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('No se puede pagar una reserva cancelada');
        }
        // Autorización: cliente solo sus reservas; venue admin solo su sede
        if (user.role === Role.CLIENT && booking.userId !== user.id) {
            throw new BadRequestException('No puedes pagar esta reserva');
        }
        if (user.role === Role.VENUE_ADMIN && booking.facility.venueId !== user.venueId) {
            throw new BadRequestException('No puedes gestionar reservas de otra sede');
        }
        return this.prisma.booking.update({
            where: { id },
            data: { paymentStatus: 'PAID', paidAt: new Date() },
        });
    }

    async cancel(
        id: string,
        user: { id: string; role: Role; venueId?: string | null },
        dto: CancelBookingDto,
    ) {
        const booking = await this.findById(id);
        if (booking.status === BookingStatus.CANCELLED) {
            throw new BadRequestException('La reserva ya está cancelada');
        }
        if (booking.status === BookingStatus.COMPLETED) {
            throw new BadRequestException('No se puede cancelar una reserva completada');
        }

        // El CLIENTE solo puede cancelar hasta 24 horas antes del inicio del turno.
        // Los administradores (general / de sede) no tienen ese límite.
        if (user.role === Role.CLIENT) {
            const CANCEL_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 horas
            const start = new Date(booking.startDatetime).getTime();
            if (start - Date.now() < CANCEL_LIMIT_MS) {
                throw new BadRequestException(
                    'Solo puedes cancelar hasta 24 horas antes del inicio del turno',
                );
            }
        }

        const cancelled = await this.bookingsRepository.cancel(id, user.id, dto.reason);

        // Correo de cancelación (best-effort). booking trae facility/venue/user de findById.
        const emailData = this.toEmailData(booking);
        if (emailData) void this.mailService.sendBookingCancellation({ ...emailData, reason: dto.reason });

        return cancelled;
    }

    /**
     * Crea una reserva recurrente (turno fijo): genera una reserva concreta por
     * cada día de la semana coincidente entre startDate y endDate (inclusive).
     * Las fechas en conflicto se saltan y se informan en el resultado.
     *
     * @param actor   usuario autenticado que ejecuta la acción
     * @param dto     datos de la recurrencia
     */
    async createRecurring(
        actor: { id: string; role: Role; venueId?: string | null },
        dto: CreateRecurringBookingDto,
    ) {
        // Zona horaria de Argentina: UTC-3. Interpretamos las horas como hora local AR.
        const AR_OFFSET_MIN = 3 * 60;

        const [startH, startM] = dto.startTime.split(':').map(Number);
        const [endH, endM] = dto.endTime.split(':').map(Number);
        const startMin = startH * 60 + startM;
        let endMin = endH * 60 + endM;
        const crossesMidnight = endMin <= startMin;
        if (crossesMidnight) endMin += 24 * 60;

        // Determinar el cliente destinatario
        let targetUserId = actor.id;
        if (actor.role === Role.VENUE_ADMIN || actor.role === Role.ADMIN) {
            if (dto.userId) targetUserId = dto.userId;
        }

        // Validar acceso del admin de sede sobre la instalación
        const facility = await this.prisma.facility.findUnique({
            where: { id: dto.facilityId },
            include: { venue: true },
        });
        if (!facility) throw new NotFoundException('Instalación no encontrada');
        if (
            actor.role === Role.VENUE_ADMIN &&
            facility.venueId !== actor.venueId
        ) {
            throw new BadRequestException(
                'Solo puedes crear turnos fijos en instalaciones de tu sede',
            );
        }

        // Turno fijo: siempre las próximas 8 ocurrencias del día elegido
        const OCCURRENCES = 8;

        // Parsear fecha base (YYYY-MM-DD) como medianoche UTC
        const [sy, sm, sd] = dto.startDate.split('-').map(Number);
        const base = new Date(Date.UTC(sy, sm - 1, sd));

        // Encontrar la primera fecha (>= base) cuyo día de semana AR coincida
        const arDow = (dt: Date) => ((dt.getUTCDay() + 6) % 7); // 0=Lunes..6=Domingo
        const firstDate = new Date(base);
        for (let i = 0; i < 7 && arDow(firstDate) !== dto.dayOfWeek; i++) {
            firstDate.setUTCDate(firstDate.getUTCDate() + 1);
        }

        // Generar las 4 fechas (semanales)
        const dates: Date[] = [];
        for (let i = 0; i < OCCURRENCES; i++) {
            dates.push(new Date(firstDate.getTime() + i * 7 * 24 * 60 * 60 * 1000));
        }
        const lastDate = dates[dates.length - 1];

        // Crear la entidad de recurrencia (startDate = primera, endDate = última)
        const recurring = await this.prisma.recurringBooking.create({
            data: {
                facilityId: dto.facilityId,
                userId: targetUserId,
                dayOfWeek: dto.dayOfWeek,
                startTime: dto.startTime,
                endTime: dto.endTime,
                startDate: firstDate,
                endDate: lastDate,
                createdById: actor.id,
            },
        });

        const created: { date: string; bookingId: string }[] = [];
        const skipped: { date: string; reason: string }[] = [];

        for (const cursor of dates) {
            const y = cursor.getUTCFullYear();
            const mo = cursor.getUTCMonth();
            const d = cursor.getUTCDate();
            const dateLabel = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            // Hora local AR -> instante UTC real (sumar offset)
            const startDatetime = new Date(Date.UTC(y, mo, d, 0, startMin + AR_OFFSET_MIN));
            const endDatetime = new Date(Date.UTC(y, mo, d, 0, endMin + AR_OFFSET_MIN));

            try {
                await this.validateBooking(dto.facilityId, startDatetime, endDatetime);
                const price = await this.calculatePrice(dto.facilityId, startDatetime, endDatetime);
                const booking = await this.bookingsRepository.create({
                    facilityId: dto.facilityId,
                    userId: targetUserId,
                    startDatetime,
                    endDatetime,
                    totalPrice: price.total,
                    basePrice: price.base,
                    commissionAmount: price.commission,
                    currency: 'ARS',
                    notes: dto.notes,
                    createdById: actor.id,
                    status: BookingStatus.CONFIRMED,
                    recurringBookingId: recurring.id,
                });
                created.push({ date: dateLabel, bookingId: booking.id });
            } catch (err: any) {
                skipped.push({ date: dateLabel, reason: err?.message || 'No disponible' });
            }
        }

        // Si no se pudo crear ninguna fecha, no dejar una recurrencia vacía:
        // se elimina y se informa el motivo (todas las fechas fallaron).
        if (created.length === 0) {
            await this.prisma.recurringBooking.delete({ where: { id: recurring.id } });
            const reason = skipped[0]?.reason || 'No se pudo crear ninguna fecha';
            throw new BadRequestException(
                `No se pudo crear el turno fijo: ${reason}`,
            );
        }

        // Correo resumen del turno fijo (uno solo, no por cada ocurrencia).
        void this.sendRecurringConfirmation(targetUserId, facility, dto, created.length);

        return {
            recurringBookingId: recurring.id,
            totalDates: created.length + skipped.length,
            createdCount: created.length,
            skippedCount: skipped.length,
            created,
            skipped,
        };
    }

    /** Correo resumen al crear un turno fijo (best-effort). */
    private async sendRecurringConfirmation(
        userId: string,
        facility: any,
        dto: CreateRecurringBookingDto,
        createdCount: number,
    ) {
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, firstName: true },
            });
            if (!user?.email) return;
            const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
            await this.mailService.sendBookingConfirmation({
                email: user.email,
                firstName: user.firstName || '',
                venueName: facility.venue?.name || '',
                facilityName: facility.name || '',
                dateLabel: `Todos los ${DAYS[dto.dayOfWeek] || ''} (${createdCount} fechas)`,
                timeLabel: `${formatTime12h(dto.startTime)} - ${formatTime12h(dto.endTime)}`,
                paymentPending: true,
            });
        } catch (err) {
            console.error('Error enviando confirmación de turno fijo:', err);
        }
    }

    /**
     * Estadísticas agregadas por rango/filtros, calculadas en el servidor.
     * Respeta el scope: VENUE_ADMIN solo ve su sede.
     * El filtro de fecha usa startDatetime (fecha del turno).
     */
    async getStats(
        user: { id: string; role: Role; venueId?: string | null },
        filters: { range?: string; from?: string; to?: string; sportId?: string; venueId?: string; status?: string },
    ) {
        // Rango de fechas (según "range": today|yesterday|week|month|custom|all)
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let start: Date | null = null;
        let end: Date | null = null;
        if (filters.range === 'custom') {
            // Rango personalizado: from/to en formato YYYY-MM-DD (inclusive)
            if (filters.from) {
                const [y, m, d] = filters.from.split('-').map(Number);
                start = new Date(y, m - 1, d);
            }
            if (filters.to) {
                const [y, m, d] = filters.to.split('-').map(Number);
                end = new Date(y, m - 1, d + 1); // fin exclusivo: incluye todo el día "to"
            }
        } else {
            switch (filters.range) {
                case 'today': start = startOfToday; break;
                case 'yesterday':
                    start = new Date(startOfToday); start.setDate(start.getDate() - 1);
                    end = startOfToday; break;
                case 'week': start = new Date(now); start.setDate(now.getDate() - 7); break;
                case 'month': start = new Date(now); start.setMonth(now.getMonth() - 1); break;
                case 'all': default: start = null; break;
            }
        }

        // Scope por rol: el venue admin solo ve su sede
        const effectiveVenueId =
            user.role === Role.VENUE_ADMIN && user.venueId ? user.venueId : filters.venueId;

        const where: any = {};
        if (effectiveVenueId) where.facility = { venueId: effectiveVenueId };
        if (filters.sportId) {
            where.facility = { ...(where.facility || {}), sportId: filters.sportId };
        }
        if (filters.status && filters.status !== 'ALL') where.status = filters.status as BookingStatus;
        // Rango del período. Traemos las reservas que caen dentro del rango por su
        // INICIO o por su FIN, porque las métricas de actividad se cuentan por inicio
        // y las de dinero por fin (un turno 23:00->00:30 "gana" al día siguiente).
        if (start || end) {
            const startInRange: any = {};
            if (start) startInRange.gte = start;
            if (end) startInRange.lt = end;
            const endInRange: any = {};
            if (start) endInRange.gte = start;
            if (end) endInRange.lt = end;
            where.OR = [{ startDatetime: startInRange }, { endDatetime: endInRange }];
        }

        const bookings = await this.prisma.booking.findMany({
            where,
            select: {
                id: true,
                status: true,
                startDatetime: true,
                endDatetime: true,
                paymentStatus: true,
                totalPrice: true,
                basePrice: true,
                commissionAmount: true,
                userId: true,
                createdAt: true,
                facility: {
                    select: {
                        sport: { select: { id: true, name: true } },
                        venue: { select: { id: true, name: true } },
                    },
                },
                user: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const AR_OFFSET_MIN = 3 * 60;
        const arDayKey = (d: Date) =>
            new Date(new Date(d).getTime() - AR_OFFSET_MIN * 60000).toISOString().split('T')[0];

        let total = 0, confirmed = 0, cancelled = 0, completed = 0, pending = 0;
        let totalRevenue = 0, totalCommission = 0, totalBase = 0;
        const byStatus: Record<string, number> = { PENDING: 0, CONFIRMED: 0, CANCELLED: 0, COMPLETED: 0 };
        const byDay: Record<string, number> = {};
        const byWeekday = [0, 0, 0, 0, 0, 0, 0]; // 0=Lunes..6=Domingo (reservas no canceladas)
        const bySport = new Map<string, { sportId: string; name: string; count: number; revenue: number }>();
        const byVenue = new Map<string, { venueId: string; venueName: string; total: number; base: number; commission: number; count: number }>();
        const clientIds = new Set<string>();
        const recentClientsSeen = new Set<string>();
        const recentClients: { id: string; firstName?: string; lastName?: string }[] = [];

        // Helpers para saber si una reserva cae en el período por su inicio o por su fin.
        const inRange = (d: Date) => {
            const t = new Date(d).getTime();
            if (start && t < start.getTime()) return false;
            if (end && t >= end.getTime()) return false;
            return true;
        };

        for (const b of bookings) {
            // ACTIVIDAD (conteos): la reserva "pertenece" al período por su día de INICIO.
            const inByStart = inRange(b.startDatetime);
            // DINERO (ingresos): se reconoce el día que TERMINA el turno.
            const inByEnd = inRange(b.endDatetime);

            const notCancelled = b.status !== 'CANCELLED';
            // Ingreso/comisión reconocidos: pagada, turno ya finalizado y su FIN cae en el período.
            const earned =
                inByEnd &&
                b.paymentStatus === 'PAID' &&
                new Date(b.endDatetime).getTime() <= now.getTime();
            const totalP = Number(b.totalPrice) || 0;
            const commission = Number(b.commissionAmount) || 0;
            const base = Number(b.basePrice) || totalP - commission;

            // Conteos de actividad: solo las que empiezan dentro del período
            if (inByStart) {
                total += 1;
                byStatus[b.status] = (byStatus[b.status] || 0) + 1;
                if (b.status === 'CONFIRMED') confirmed += 1;
                else if (b.status === 'CANCELLED') cancelled += 1;
                else if (b.status === 'COMPLETED') completed += 1;
                else if (b.status === 'PENDING') pending += 1;
            }

            if (notCancelled) {
                // Dinero: solo de turnos pagados, ya usados y cuyo FIN cae en el período
                if (earned) {
                    totalRevenue += totalP;
                    totalCommission += commission;
                    totalBase += base;

                    // por día: el ingreso se reconoce el día que TERMINA el turno
                    const day = arDayKey(b.endDatetime);
                    byDay[day] = (byDay[day] || 0) + totalP;
                }

                // por día de semana (0=Lunes..6=Domingo, en AR) — actividad, por inicio
                if (inByStart) {
                    const arDate = new Date(new Date(b.startDatetime).getTime() - AR_OFFSET_MIN * 60000);
                    const weekday = (arDate.getUTCDay() + 6) % 7;
                    byWeekday[weekday] += 1;
                }

                // por deporte — cuenta por inicio; ingreso por fin ya usado
                const sp = b.facility?.sport;
                if (sp) {
                    const e = bySport.get(sp.id) || { sportId: sp.id, name: sp.name, count: 0, revenue: 0 };
                    if (inByStart) e.count += 1;
                    if (earned) e.revenue += totalP;
                    bySport.set(sp.id, e);
                }

                // por complejo — cuenta por inicio; montos por fin ya usado
                const v = b.facility?.venue;
                if (v) {
                    const e = byVenue.get(v.id) || { venueId: v.id, venueName: v.name, total: 0, base: 0, commission: 0, count: 0 };
                    if (earned) { e.total += totalP; e.base += base; e.commission += commission; }
                    if (inByStart) e.count += 1;
                    byVenue.set(v.id, e);
                }

                // clientes únicos + recientes (por inicio dentro del período)
                if (inByStart && b.userId) {
                    clientIds.add(b.userId);
                    if (!recentClientsSeen.has(b.userId) && recentClients.length < 5) {
                        recentClientsSeen.add(b.userId);
                        recentClients.push({ id: b.userId, firstName: b.user?.firstName, lastName: b.user?.lastName });
                    }
                }
            }
        }

        const totalActive = total - cancelled;
        const occupancyRate = totalActive > 0 ? Math.round((confirmed / totalActive) * 100) : 0;
        // Precio promedio basado en lo que le corresponde al complejo (precio base)
        const avgPrice = totalActive > 0 ? Math.round(totalBase / totalActive) : 0;

        return {
            totals: {
                total, confirmed, cancelled, completed, pending,
                totalRevenue, totalCommission, totalBase,
                occupancyRate, avgPrice,
                uniqueClients: clientIds.size,
            },
            byStatus,
            byWeekday,
            byDay: Object.entries(byDay).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date)),
            bySport: Array.from(bySport.values()).filter((e) => e.count > 0 || e.revenue > 0).sort((a, b) => b.count - a.count),
            byVenue: Array.from(byVenue.values()).filter((e) => e.count > 0 || e.base > 0).sort((a, b) => b.base - a.base),
            recentClients,
        };
    }

    /**
     * Lista los turnos fijos (recurrencias) según el rol:
     * - ADMIN: todos
     * - VENUE_ADMIN: los de las instalaciones de su sede
     * - CLIENT: los propios
     */
    async findRecurring(user: { id: string; role: Role; venueId?: string | null }) {
        const where: Record<string, unknown> = {};
        if (user.role === Role.ADMIN) {
            // sin filtro
        } else if (user.role === Role.VENUE_ADMIN && user.venueId) {
            where.facility = { venueId: user.venueId };
        } else {
            where.userId = user.id;
        }

        const now = new Date();

        const list = await this.prisma.recurringBooking.findMany({
            where,
            include: {
                facility: {
                    include: {
                        sport: true,
                        venue: { select: { id: true, name: true, city: true } },
                    },
                },
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
                bookings: {
                    select: { id: true, startDatetime: true, endDatetime: true, status: true, paymentStatus: true, totalPrice: true },
                    orderBy: { startDatetime: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Agregar contadores útiles para la UI
        return list.map((r) => {
            const upcoming = r.bookings.filter(
                (b) => b.status === BookingStatus.CONFIRMED && new Date(b.startDatetime) >= now,
            );
            return {
                ...r,
                upcomingCount: upcoming.length,
                totalCount: r.bookings.length,
            };
        });
    }

    /**
     * Cancela un turno fijo completo: desactiva la recurrencia y cancela todas
     * las reservas futuras (no completadas ni ya canceladas) de la serie.
     */
    async cancelRecurring(
        id: string,
        user: { id: string; role: Role; venueId?: string | null },
        reason?: string,
    ) {
        const recurring = await this.prisma.recurringBooking.findUnique({
            where: { id },
            include: { facility: true },
        });
        if (!recurring) throw new NotFoundException('Turno fijo no encontrado');

        // Autorización
        if (user.role === Role.CLIENT && recurring.userId !== user.id) {
            throw new BadRequestException('No puedes cancelar este turno fijo');
        }
        if (
            user.role === Role.VENUE_ADMIN &&
            recurring.facility.venueId !== user.venueId
        ) {
            throw new BadRequestException('No puedes cancelar turnos fijos de otra sede');
        }

        const now = new Date();

        // Cancelar todas las reservas futuras confirmadas de la serie
        const futureBookings = await this.prisma.booking.findMany({
            where: {
                recurringBookingId: id,
                status: BookingStatus.CONFIRMED,
                startDatetime: { gte: now },
            },
            select: { id: true },
        });

        await this.prisma.$transaction([
            ...futureBookings.map((b) =>
                this.prisma.booking.update({
                    where: { id: b.id },
                    data: {
                        status: BookingStatus.CANCELLED,
                        cancelledAt: now,
                        cancelledById: user.id,
                        cancellationReason: reason || 'Turno fijo cancelado',
                    },
                }),
            ),
            this.prisma.recurringBooking.update({
                where: { id },
                data: { isActive: false },
            }),
        ]);

        return {
            recurringBookingId: id,
            cancelledCount: futureBookings.length,
        };
    }

    private async validateBooking(
        facilityId: string,
        startDatetime: Date,
        endDatetime: Date,
    ) {
        // Rule 1: No past dates
        if (startDatetime < new Date()) {
            throw new BadRequestException('No se puede reservar en el pasado');
        }

        // Rule 2: End must be after start
        if (endDatetime <= startDatetime) {
            throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
        }

        // Rule 3: Check facility exists and is active
        const facility = await this.prisma.facility.findUnique({
            where: { id: facilityId },
            include: { schedules: true },
        });

        if (!facility) {
            throw new NotFoundException('Instalación no encontrada');
        }

        if (!facility.isActive) {
            throw new BadRequestException('La instalación no está activa');
        }

        // Rule 4: Check duration limits
        const durationMinutes = (endDatetime.getTime() - startDatetime.getTime()) / 60000;

        if (durationMinutes < facility.minBookingDuration) {
            throw new BadRequestException(
                `La duración mínima de reserva es ${facility.minBookingDuration} minutos`,
            );
        }

        if (durationMinutes > facility.maxBookingDuration) {
            throw new BadRequestException(
                `La duración máxima de reserva es ${facility.maxBookingDuration} minutos`,
            );
        }

        // Rule 5: Check within schedule (en HORA LOCAL DE ARGENTINA, UTC-3,
        // sin depender de la zona horaria del servidor que corre en UTC)
        const AR_OFFSET_MIN = 3 * 60;
        const toAr = (d: Date) => new Date(d.getTime() - AR_OFFSET_MIN * 60000);
        const startAr = toAr(startDatetime);
        const endAr = toAr(endDatetime);

        const dayOfWeek = (startAr.getUTCDay() + 6) % 7; // 0=Lunes..6=Domingo
        const prevDayOfWeek = (dayOfWeek + 6) % 7;       // día anterior

        const startMinAr = startAr.getUTCHours() * 60 + startAr.getUTCMinutes();
        let endMinAr = endAr.getUTCHours() * 60 + endAr.getUTCMinutes();
        if (endMinAr <= startMinAr) endMinAr += 24 * 60; // reserva que cruza medianoche

        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

        /**
         * ¿La reserva cabe en este horario?
         * dayShift=0 -> el slot cae en la parte del MISMO día (franja nocturna).
         * dayShift=1 -> el slot es la MADRUGADA de una jornada que empezó el día
         *               anterior (ej: reserva sábado 01:00 pertenece a viernes 19:00-02:00).
         */
        const fitsSchedule = (openTime: string, closeTime: string, dayShift: number): boolean => {
            const open = toMin(openTime);
            let close = toMin(closeTime);
            if (close <= open) close += 24 * 60; // cruza medianoche
            // Trasladar el slot al marco de referencia del schedule
            const s = startMinAr + dayShift * 24 * 60;
            const e = endMinAr + dayShift * 24 * 60;
            return s >= open && e <= close;
        };

        const sameDay = facility.schedules.find((x) => x.dayOfWeek === dayOfWeek && x.isActive);
        const prevDay = facility.schedules.find((x) => x.dayOfWeek === prevDayOfWeek && x.isActive);

        const okSameDay = !!sameDay && fitsSchedule(sameDay.openTime, sameDay.closeTime, 0);
        // Solo tiene sentido revisar el día anterior si su horario cruza medianoche
        const okPrevDay = !!prevDay
            && toMin(prevDay.closeTime) <= toMin(prevDay.openTime)
            && fitsSchedule(prevDay.openTime, prevDay.closeTime, 1);

        if (!sameDay && !prevDay) {
            throw new BadRequestException('La instalación está cerrada este día');
        }

        if (!okSameDay && !okPrevDay) {
            const ref = sameDay || prevDay!;
            throw new BadRequestException(
                `El horario de atención es ${formatTime12h(ref.openTime)} - ${formatTime12h(ref.closeTime)}`,
            );
        }

        // Rule 6: Check blocked slots
        const blockedSlot = await this.prisma.blockedSlot.findFirst({
            where: {
                facilityId,
                startDatetime: { lt: endDatetime },
                endDatetime: { gt: startDatetime },
            },
        });

        if (blockedSlot) {
            throw new BadRequestException('Este horario está bloqueado');
        }

        // Rule 7: Check conflicts
        const conflict = await this.bookingsRepository.findConflicting(
            facilityId,
            startDatetime,
            endDatetime,
        );

        if (conflict) {
            throw new ConflictException('Este horario ya está reservado');
        }
    }

    private async calculatePrice(
        facilityId: string,
        startDatetime: Date,
        endDatetime: Date,
    ): Promise<{ base: number; commission: number; total: number }> {
        // Día y hora en horario local de Argentina (UTC-3)
        const AR_OFFSET_MIN = 3 * 60;
        const startAr = new Date(startDatetime.getTime() - AR_OFFSET_MIN * 60000);
        const dayOfWeek = (startAr.getUTCDay() + 6) % 7;
        const slotMin = startAr.getUTCHours() * 60 + startAr.getUTCMinutes();

        // Traer todas las tarifas activas que apliquen al día y elegir la que
        // cubre la franja horaria del inicio (soporta rangos que cruzan medianoche).
        const candidates = await this.prisma.pricing.findMany({
            where: {
                facilityId,
                isActive: true,
                OR: [{ dayOfWeek }, { dayOfWeek: null }],
            },
            orderBy: { dayOfWeek: 'desc' }, // Prefer specific day over null
        });

        const toMin = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const pricing =
            candidates.find((p) => {
                const start = toMin(p.startTime);
                const end = toMin(p.endTime);
                if (end <= start) return slotMin >= start || slotMin < end;
                return slotMin >= start && slotMin < end;
            }) || candidates[0];

        if (!pricing) {
            // Sin tarifa configurada para esta franja: no se puede reservar (evita reservas gratis)
            throw new BadRequestException(
                'Esta instalación no tiene una tarifa configurada para ese horario. Contactá al complejo.',
            );
        }

        // Precio del TURNO (fijo, sin importar la duración): se cobra el valor
        // definido en la tarifa tal cual, no se multiplica por horas.
        const base = Number(pricing.pricePerHour);
        // Comisión de servicio de la empresa (profitPercent) sobre el precio del turno
        const commission = base * (Number(pricing.profitPercent) || 0) / 100;
        // El total pagado por el cliente incluye la comisión
        return { base, commission, total: base + commission };
    }
}
