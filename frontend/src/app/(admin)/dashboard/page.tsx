"use client";

import { Card, CardBody, Chip, Spinner, DatePicker } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { formatTimeAr } from "@/lib/datetime";
import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, MapPin, User, DollarSign, Users, TrendingUp, CheckCircle2 } from "lucide-react";
import type { Booking, Facility, PaginatedResult, User as UserType, Venue } from "@/types";

/** Hora 12h en español sin cero adelante: "9:00 a. m." */
const formatTime12h = formatTimeAr;

/** Precio con separador de miles con coma: 25000 -> "25,000" */
function formatPrice(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

const ADS = [
    {
        title: "🏆 Torneo de Fútbol 5",
        subtitle: "Inscripciones abiertas",
        description: "Organiza tu equipo y participa en el torneo de verano.",
        bg: "from-blue-500 to-blue-700",
    },
    {
        title: "🎾 Clases de Tenis",
        subtitle: "Nuevos horarios",
        description: "Aprende con profesores certificados. Todos los niveles.",
        bg: "from-emerald-500 to-emerald-700",
    },
    {
        title: "🏸 30% OFF Pádel",
        subtitle: "Horarios matutinos",
        description: "Reserva antes de las 12pm y obtén descuento automático.",
        bg: "from-violet-500 to-violet-700",
    },
    {
        title: "🏀 Liga de Básquet",
        subtitle: "Temporada 2026",
        description: "Forma tu equipo de 5 y compite cada sábado.",
        bg: "from-orange-500 to-orange-700",
    },
    {
        title: "⚡ SportBooking Pro",
        subtitle: "Próximamente",
        description: "Gestión avanzada, reportes y multi-complejo.",
        bg: "from-pink-500 to-pink-700",
    },
];

export default function DashboardPage() {
    const { user } = useAuthStore();
    const isVenueAdmin = user?.role === "VENUE_ADMIN";
    const [activeIndex, setActiveIndex] = useState(0);

    // Nombre de la sede del admin de sede (para el saludo)
    const { data: venues } = useQuery({
        queryKey: ["venues"],
        queryFn: () => apiClient.get<Venue[]>("/venues"),
        enabled: isVenueAdmin,
    });
    const myVenueName = venues?.find((v) => v.id === user?.venueId)?.name || "";

    const nextSlide = useCallback(() => {
        setActiveIndex((prev) => (prev + 1) % ADS.length);
    }, []);

    useEffect(() => {
        if (user?.role !== "CLIENT") return;
      const interval = setInterval(nextSlide, 4000);
      return () => clearInterval(interval);
    }, [nextSlide, user?.role]);

    const getCardIndex = (offset: number) => {
        return (activeIndex + offset + ADS.length) % ADS.length;
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold">
                    Hola, {user?.firstName} 👋
                </h1>
                <p className="text-sm text-default-500 mt-1">
                    {isVenueAdmin && myVenueName
                        ? `Bienvenido al panel administrador de ${myVenueName}`
                        : "Bienvenido al panel de administración de SportBooking"}
                </p>
            </div>

            {/* Carousel - solo visible para clientes */}
            {user?.role === "CLIENT" && (
                <>
                    {/* Carousel - 3 visible, center highlighted */}
                    <div className="relative flex items-center justify-center gap-3 overflow-hidden py-2">
                        {/* Left card (partial) */}
                        <div className="w-[20%] flex-shrink-0 opacity-50 scale-90 transition-all duration-500">
                            <AdCard ad={ADS[getCardIndex(-1)]} compact />
                        </div>

                        {/* Center card (main) */}
                        <div className="w-[56%] flex-shrink-0 scale-100 transition-all duration-500 z-10">
                            <AdCard ad={ADS[activeIndex]} />
                        </div>

                        {/* Right card (partial) */}
                        <div className="w-[20%] flex-shrink-0 opacity-50 scale-90 transition-all duration-500">
                            <AdCard ad={ADS[getCardIndex(1)]} compact />
                        </div>
                    </div>

                    {/* Dots */}
                    <div className="flex justify-center gap-2">
                        {ADS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setActiveIndex(i)}
                                className={`h-2 rounded-full transition-all duration-300 ${i === activeIndex
                                    ? "w-6 bg-primary"
                                    : "w-2 bg-default-300 hover:bg-default-400"
                                    }`}
                                aria-label={`Slide ${i + 1}`}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Today's Bookings */}
            <TodayBookings />

            {/* Today's Summary Stats */}
            <TodaySummary />

            {/* Revenue by venue (admin solo widget) */}
            {user?.role !== "CLIENT" && <RevenueByVenue />}
      </div>
  );
}

function AdCard({ ad, compact = false }: { ad: typeof ADS[0]; compact?: boolean }) {
    return (
        <Card className={`bg-gradient-to-r ${ad.bg} border-none shadow-lg overflow-hidden`}>
            <CardBody className={compact ? "p-4" : "p-6"}>
                <p className={`font-semibold text-white/70 uppercase tracking-wider ${compact ? "text-[9px]" : "text-xs"}`}>
                    {ad.subtitle}
                </p>
                <h3 className={`font-bold text-white mt-1 ${compact ? "text-sm" : "text-lg"}`}>
                    {ad.title}
                </h3>
                {!compact && (
                    <p className="mt-2 text-sm text-white/80 leading-relaxed">
                        {ad.description}
                    </p>
                )}
            </CardBody>
        </Card>
    );
}

const STATUS_COLORS: Record<string, "warning" | "success" | "danger" | "default"> = {
    PENDING: "warning",
    CONFIRMED: "success",
    CANCELLED: "danger",
    COMPLETED: "success",
};

const STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendiente",
    CONFIRMED: "Confirmada",
    CANCELLED: "Cancelada",
    COMPLETED: "Completada",
};

/** Precio base de una reserva (lo que le corresponde al complejo, sin comisión). */
function basePriceOf(b: Booking): number {
    const base = Number(b.basePrice);
    if (base > 0) return base;
    // Fallback: total menos comisión (por si basePrice no está)
    return Number(b.totalPrice) - (Number(b.commissionAmount) || 0);
}

/** Tarjeta de una reserva del día (muestra el precio base). */
function BookingRow({ booking }: { booking: Booking }) {
    const { user } = useAuthStore();
    const isVenueAdmin = user?.role === "VENUE_ADMIN";
    // Admin de sede: precio base (sin comisión). Admin general: precio completo (base + comisión).
    const displayPrice = isVenueAdmin ? basePriceOf(booking) : Number(booking.totalPrice);

    return (
        <Card className="border border-divider">
            <CardBody className="p-4">
                {/* Fila principal: ícono + cancha + (precio/estado a la derecha en desktop) */}
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Calendar className="h-5 w-5 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{booking.facility.name}</p>

                        {/* Metadatos: apilados en móvil, en línea desde sm */}
                        <div className="mt-1 flex flex-col gap-1 text-xs text-default-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
                            <span className="flex items-center gap-1.5 min-w-0">
                                <User className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="truncate">{booking.user.firstName} {booking.user.lastName}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="whitespace-nowrap">
                                    {formatTime12h(booking.startDatetime)} — {formatTime12h(booking.endDatetime)}
                                </span>
                            </span>
                        </div>
                    </div>

                    {/* Precio + estado: visibles a la derecha solo en desktop */}
                    <div className="hidden sm:flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-sm font-bold text-success whitespace-nowrap">
                            ${formatPrice(displayPrice)}
                        </span>
                        <Chip size="sm" variant="flat" color={STATUS_COLORS[booking.status]}>
                            {STATUS_LABELS[booking.status]}
                        </Chip>
                    </div>
                </div>

                {/* Precio + estado: fila inferior en móvil, separada con borde */}
                <div className="mt-3 flex items-center justify-between border-t border-divider pt-3 sm:hidden">
                    <span className="text-base font-bold text-success">
                        ${formatPrice(displayPrice)}
                    </span>
                    <Chip size="sm" variant="flat" color={STATUS_COLORS[booking.status]}>
                        {STATUS_LABELS[booking.status]}
                    </Chip>
                </div>
            </CardBody>
        </Card>
    );
}

function TodayBookings() {
    const today = argentinaToday();
    const now = Date.now();

    const { data: bookingsData, isLoading } = useQuery({
        queryKey: ["bookings", "today-list"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: any }>("/bookings?limit=100"),
        refetchOnMount: "always",
        staleTime: 0,
    });

    // Reservas de hoy (en hora de Argentina), no canceladas
    const todayBookings = (bookingsData?.data || []).filter((b) => {
        return argentinaDay(b.startDatetime) === today && b.status !== "CANCELLED";
    });

    // Pendientes de uso: pagadas cuyo turno aún no terminó
    const pending = todayBookings.filter(
        (b) => b.paymentStatus === "PAID" && new Date(b.endDatetime).getTime() > now,
    );
    // Utilizadas: pagadas cuyo turno ya pasó (se asume que el cliente asistió)
    const used = todayBookings.filter(
        (b) => b.paymentStatus === "PAID" && new Date(b.endDatetime).getTime() <= now,
    );

    if (isLoading) {
        return <div className="flex justify-center py-8"><Spinner /></div>;
    }

    return (
        <div className="space-y-8">
            {/* Reservas pagadas pendientes de uso */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold">Reservas pagadas pendientes de uso</h2>
                        <p className="text-xs text-default-500">
                            {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                    </div>
                    {pending.length > 0 && (
                        <Chip size="sm" variant="flat" color="primary">{pending.length} reserva{pending.length !== 1 ? "s" : ""}</Chip>
                    )}
                </div>
                {pending.length > 0 ? (
                    <div className="space-y-3">
                        {pending.map((b) => <BookingRow key={b.id} booking={b} />)}
                    </div>
                ) : (
                    <Card className="border border-divider">
                        <CardBody className="flex flex-col items-center py-8">
                            <Calendar className="h-10 w-10 text-default-200" />
                            <p className="mt-3 text-sm text-default-500">Sin reservas pendientes de uso hoy</p>
                            </CardBody>
                        </Card>
                )}
            </div>

            {/* Reservas utilizadas (turno ya pasó) */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold">Reservas completadas</h2>
                        <p className="text-xs text-default-500">Turnos de hoy que ya finalizaron</p>
                    </div>
                    {used.length > 0 && (
                        <Chip size="sm" variant="flat" color="default">{used.length} reserva{used.length !== 1 ? "s" : ""}</Chip>
                    )}
                </div>
                {used.length > 0 ? (
                    <div className="space-y-3">
                        {used.map((b) => <BookingRow key={b.id} booking={b} />)}
                    </div>
                ) : (
                    <Card className="border border-divider">
                        <CardBody className="flex flex-col items-center py-8">
                            <Calendar className="h-10 w-10 text-default-200" />
                                <p className="mt-3 text-sm text-default-500">Todavía no hay reservas completadas hoy</p>
                        </CardBody>
                    </Card>
                )}
            </div>
        </div>
    );
}

function TodaySummary() {
    const { user } = useAuthStore();
    const isVenueAdmin = user?.role === "VENUE_ADMIN";
    const today = argentinaToday();

    const { data: bookingsData } = useQuery({
        queryKey: ["bookings", "today-summary"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: any }>("/bookings?limit=100"),
        refetchOnMount: "always",
        staleTime: 0,
    });

    const { data: usersData } = useQuery({
        queryKey: ["admin-users-today"],
        queryFn: () => apiClient.get<PaginatedResult<UserType>>("/users?limit=100"),
    });

    const { data: facilities } = useQuery({
        queryKey: ["admin-facilities"],
        queryFn: () => apiClient.get<Facility[]>("/facilities"),
    });

    // Bloqueos de hoy (para descontar turnos bloqueados de la capacidad)
    const { data: blockedToday } = useQuery({
        queryKey: ["admin-blocked-today", today],
        queryFn: () => apiClient.get<{ id: string; facilityId: string; startDatetime: string; endDatetime: string }[]>(`/blocked-slots?date=${today}`),
    });

    const allBookings = bookingsData?.data || [];
    const nowMs = Date.now();
    const todayBookings = allBookings.filter((b) => {
        return argentinaDay(b.startDatetime) === today && b.status !== "CANCELLED";
    });

    // Reservas pagadas pendientes de uso: pagadas y cuyo turno aún no terminó
    const paidPendingCount = todayBookings.filter(
        (b) => b.paymentStatus === "PAID" && new Date(b.endDatetime).getTime() > nowMs,
    ).length;
    // Reservas utilizadas: pagadas y cuyo turno ya pasó
    const usedCount = todayBookings.filter(
        (b) => b.paymentStatus === "PAID" && new Date(b.endDatetime).getTime() <= nowMs,
    ).length;

    // Ingresos de hoy = precio BASE de los turnos de hoy que YA se usaron (su fin ya pasó).
    // La plata se reconoce cuando el turno terminó, y sin la comisión de la empresa.
    const todayRevenue = todayBookings
        .filter((b) => b.paymentStatus === "PAID" && new Date(b.endDatetime).getTime() <= nowMs)
        .reduce((sum, b) => sum + basePriceOf(b), 0);

    // Comisión de la empresa: solo de turnos YA USADOS (pagados y cuyo fin ya pasó),
    // mismo criterio que "reservas utilizadas" e "ingresos hoy".
    const todayCommission = todayBookings
        .filter((b) => b.paymentStatus === "PAID" && new Date(b.endDatetime).getTime() <= nowMs)
        .reduce((sum, b) => sum + (Number(b.commissionAmount) || 0), 0);

    // Usuarios nuevos del sistema hoy (solo relevante para el admin general)
    const allUsers = usersData?.data || [];
    const newUsersToday = allUsers.filter((u) => {
        if (!u.createdAt) return false;
        return new Date(u.createdAt).toISOString().split("T")[0] === today;
    });

    // Clientes distintos que reservaron hoy (relevante para el admin de sede)
    const clientsToday = new Set(todayBookings.map((b) => b.userId)).size;

    // Turnos ocupados hoy = reservas de hoy (no canceladas).
    // Capacidad total de turnos hoy = suma, por cada cancha activa con horario hoy,
    // de la cantidad de slots que caben en su franja según minBookingDuration.
    const todayDow = (() => {
        // Día de semana en AR (0=Lunes..6=Domingo)
        const [y, m, d] = today.split("-").map(Number);
        const jsDow = new Date(y, m - 1, d).getDay(); // 0=Domingo..6=Sábado
        return (jsDow + 6) % 7;
    })();

    // Minutos desde la medianoche AR del día de hoy para un instante ISO.
    // (puede dar > 1440 si el turno/bloqueo cae en la madrugada del día siguiente,
    //  lo que es coherente con horarios que cruzan medianoche)
    const arMinutesOfDay = (iso: string): number => {
        const d = new Date(iso);
        const arMs = d.getTime() - 3 * 60 * 60000; // UTC -> AR
        const ar = new Date(arMs);
        const dayKey = ar.toISOString().split("T")[0];
        const mins = ar.getUTCHours() * 60 + ar.getUTCMinutes();
        // Si el bloqueo cae el día siguiente al "today", sumamos 24h (cruce de medianoche)
        return dayKey > today ? mins + 24 * 60 : mins;
    };

    // Capacidad de turnos de una cancha, descontando los slots solapados por bloqueos.
    const slotsForFacility = (
        openTime: string, closeTime: string, durationMin: number,
        blocks: { startDatetime: string; endDatetime: string }[],
    ): number => {
        if (!durationMin || durationMin <= 0) return 0;
        const [oh, om] = openTime.split(":").map(Number);
        const [ch, cm] = closeTime.split(":").map(Number);
        let start = oh * 60 + om;
        let end = ch * 60 + cm;
        if (end <= start) end += 24 * 60; // cruza medianoche

        const blockRanges = blocks.map((b) => ({
            s: arMinutesOfDay(b.startDatetime),
            e: arMinutesOfDay(b.endDatetime),
        }));

        let count = 0;
        for (let m = start; m + durationMin <= end; m += durationMin) {
            const slotStart = m;
            const slotEnd = m + durationMin;
            // El slot está bloqueado si solapa con algún bloqueo
            const blocked = blockRanges.some((r) => slotStart < r.e && slotEnd > r.s);
            if (!blocked) count += 1;
        }
        return count;
    };

    const totalTurnsToday = (facilities || []).reduce((sum, f) => {
        if (!f.isActive) return sum;
        const sch = f.schedules?.find((s) => s.dayOfWeek === todayDow && s.isActive);
        if (!sch) return sum;
        const facilityBlocks = (blockedToday || []).filter((b) => b.facilityId === f.id);
        return sum + slotsForFacility(sch.openTime, sch.closeTime, f.minBookingDuration, facilityBlocks);
    }, 0);

    const occupiedTurns = todayBookings.length;

    const stats = [
        {
            icon: <Clock className="h-5 w-5 text-primary" />,
            label: "Reservas pagadas",
            value: paidPendingCount,
            bg: "bg-primary/10",
        },
        {
            icon: <CheckCircle2 className="h-5 w-5 text-success" />,
            label: "Reservas completadas",
            value: usedCount,
            bg: "bg-success/10",
        },
        // Admin de sede ve "clientes que reservaron"; admin general ve "usuarios nuevos" del sistema
        isVenueAdmin
            ? {
                icon: <Users className="h-5 w-5 text-secondary" />,
                label: "Clientes hoy",
                value: clientsToday,
                bg: "bg-secondary/10",
            }
            : {
                icon: <Users className="h-5 w-5 text-secondary" />,
                label: "Usuarios nuevos",
                value: newUsersToday.length,
                bg: "bg-secondary/10",
            },
        {
            icon: <DollarSign className="h-5 w-5 text-success" />,
            label: "Ingresos hoy",
            value: `$${formatPrice(todayRevenue)}`,
            bg: "bg-success/10",
        },
        // La comisión de la empresa solo es visible para el admin general
        ...(!isVenueAdmin
            ? [{
                icon: <TrendingUp className="h-5 w-5 text-emerald-500" />,
                label: "Comisión empresa hoy",
                value: `$${formatPrice(todayCommission)}`,
                bg: "bg-emerald-500/10",
            }]
            : []),
        {
            icon: <MapPin className="h-5 w-5 text-warning" />,
            label: "Turnos ocupados",
            value: `${occupiedTurns}/${totalTurnsToday}`,
            bg: "bg-warning/10",
        },
    ];

    return (
        <div>
            <h2 className="text-lg font-bold mb-4">Resumen del día</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {stats.map((stat, i) => (
                    <Card key={i} className="border border-divider transition-shadow hover:shadow-sm">
                        <CardBody className="flex-col items-start gap-3 p-5">
                            <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${stat.bg}`}>
                                {stat.icon}
                            </div>
                            <div className="min-w-0">
                                <p className="text-2xl font-bold leading-none break-words">{stat.value}</p>
                                <p className="mt-1.5 text-xs text-default-500 leading-snug">{stat.label}</p>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div>
        </div>
    );
}

/** Fecha de hoy (YYYY-MM-DD) en hora local de Argentina (UTC-3) */
function argentinaToday(): string {
    const now = new Date();
    const arMs = now.getTime() + now.getTimezoneOffset() * 60000 - 3 * 60 * 60000;
    return new Date(arMs).toISOString().split("T")[0];
}

/** Día (YYYY-MM-DD) en hora local de Argentina de un instante ISO */
function argentinaDay(iso: string): string {
    const d = new Date(iso);
    const arMs = d.getTime() - 3 * 60 * 60000;
    return new Date(arMs).toISOString().split("T")[0];
}

/**
 * Widget de ganancia por complejo en un día.
 * - La ganancia que ve el complejo es el PRECIO BASE (sin la comisión de la empresa).
 * - Cuenta solo reservas COMPLETADAS (pagadas y cuyo turno ya pasó: se asume usada),
 *   agrupadas por la FECHA DEL TURNO del día elegido.
 * - ADMIN general: una fila por complejo + total del día. VENUE_ADMIN: solo su complejo.
 */
function RevenueByVenue() {
    const { user } = useAuthStore();
    const isVenueAdmin = user?.role === "VENUE_ADMIN";
    const [selectedDay, setSelectedDay] = useState<string>(argentinaToday());

    const { data: bookingsData, isLoading } = useQuery({
        // Prefijo ["bookings"] para que las invalidaciones de pago/creación lo refresquen
        queryKey: ["bookings", "revenue-by-venue"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: any }>("/bookings?limit=1000"),
        refetchOnMount: "always",
        staleTime: 0,
    });

    const allBookings = bookingsData?.data || [];
    const now = Date.now();

    // Ganancia = turno pagado y YA USADO (su horario de fin ya pasó), por fecha del turno.
    // Incluye las COMPLETED (cron) y las pagadas cuyo fin ya pasó aunque el cron no corrió aún.
    const completedBookings = allBookings.filter((b) => {
        if (b.status === "CANCELLED") return false;
        const alreadyUsed = new Date(b.endDatetime).getTime() <= now;
        const isCompleted = b.status === "COMPLETED";
        const paidAndUsed = b.paymentStatus === "PAID" && alreadyUsed;
        if (!isCompleted && !paidAndUsed) return false;
        return argentinaDay(b.startDatetime) === selectedDay;
    });

    // Agrupar por complejo. "earnings" = precio base (lo que se entrega al complejo)
    const byVenue = new Map<
        string,
        { venueId: string; venueName: string; earnings: number; commission: number; count: number }
    >();

    for (const b of completedBookings) {
        const venue = b.facility?.venue;
        if (!venue) continue;
        const base = Number(b.basePrice) || 0;
        const commission = Number(b.commissionAmount) || 0;
        const existing = byVenue.get(venue.id);
        if (existing) {
            existing.earnings += base;
            existing.commission += commission;
            existing.count += 1;
        } else {
            byVenue.set(venue.id, {
                venueId: venue.id,
                venueName: venue.name,
                earnings: base,
                commission,
                count: 1,
            });
        }
    }

    const rows = Array.from(byVenue.values()).sort((a, b) => b.earnings - a.earnings);
    const grandEarnings = rows.reduce((s, r) => s + r.earnings, 0);
    const grandCommission = rows.reduce((s, r) => s + r.commission, 0);

    const isToday = selectedDay === argentinaToday();
    const prettyDay = (() => {
        const [y, m, d] = selectedDay.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    })();

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-lg font-bold">
                        {isVenueAdmin ? "Ganancia de tu complejo" : "Ganancia por complejo"}
                    </h2>
                    <p className="text-xs text-default-500">
                        Lo que se le entrega al complejo según turnos usados (completados) {isToday ? "hoy" : "ese día"} ({prettyDay})
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <DatePicker
                        aria-label="Seleccionar día"
                        size="sm"
                        variant="bordered"
                        className="w-44"
                        value={(() => { try { return parseDate(selectedDay) as CalendarDate; } catch { return null; } })() as any}
                        onChange={(v: any) => {
                            if (!v) return;
                            const iso = `${v.year}-${String(v.month).padStart(2, "0")}-${String(v.day).padStart(2, "0")}`;
                            setSelectedDay(iso);
                        }}
                        maxValue={parseDate(argentinaToday()) as any}
                        showMonthAndYearPickers
                    />
                    {!isToday && (
                        <button
                            onClick={() => setSelectedDay(argentinaToday())}
                            className="rounded-lg bg-default-100 px-3 py-1.5 text-xs font-medium hover:bg-default-200 transition-colors"
                        >
                            Hoy
                        </button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
            ) : rows.length === 0 ? (
                <Card className="border border-divider">
                    <CardBody className="flex flex-col items-center py-8">
                        <DollarSign className="h-10 w-10 text-default-200" />
                            <p className="mt-3 text-sm text-default-500">
                                {isToday ? "Todavía no hay turnos completados hoy" : "No hubo turnos completados ese día"}
                            </p>
                    </CardBody>
                </Card>
            ) : (
                <>
                            {/* Total del día: solo para el admin general */}
                    {!isVenueAdmin && (
                        <Card className="mb-3 border-none bg-gradient-to-r from-emerald-500 to-emerald-700 shadow-lg">
                            <CardBody className="flex-row flex-wrap items-center justify-between gap-4 p-5">
                                        <div>
                                    <p className="text-xs font-medium uppercase tracking-wider text-white/70">Para los complejos</p>
                                            <p className="text-2xl font-bold text-white">${formatPrice(grandEarnings)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-medium uppercase tracking-wider text-white/70">Comisión empresa</p>
                                    <p className="text-lg font-bold text-white">${formatPrice(grandCommission)}</p>
                                </div>
                            </CardBody>
                        </Card>
                    )}

                    <div className="space-y-3">
                        {rows.map((r) => (
                            <Card key={r.venueId} className="border border-divider">
                                <CardBody className="flex-row items-center justify-between gap-3 p-4">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                                            <MapPin className="h-5 w-5 text-emerald-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm truncate">{r.venueName}</p>
                                            <p className="text-xs text-default-500">
                                                {r.count} turno{r.count !== 1 ? "s" : ""} completado{r.count !== 1 ? "s" : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 flex-shrink-0 text-right">
                                        {!isVenueAdmin && (
                                            <div className="hidden sm:block">
                                                <p className="text-[11px] text-default-400">Comisión empresa</p>
                                                <p className="text-sm font-medium text-emerald-600">${formatPrice(r.commission)}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-[11px] text-default-400">
                                                {isVenueAdmin ? "Tu ganancia" : "Para el complejo"}
                                            </p>
                                            <p className="text-base font-bold text-success">${formatPrice(r.earnings)}</p>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
