"use client";

import { Card, CardBody, Chip, Spinner } from "@heroui/react";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, MapPin, User, DollarSign, Users } from "lucide-react";
import type { Booking, Facility, PaginatedResult, User as UserType } from "@/types";

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
        description: "Gestión avanzada, reportes y multi-sede.",
        bg: "from-pink-500 to-pink-700",
    },
];

export default function DashboardPage() {
    const { user } = useAuthStore();
    const [activeIndex, setActiveIndex] = useState(0);

    const nextSlide = useCallback(() => {
        setActiveIndex((prev) => (prev + 1) % ADS.length);
    }, []);

    useEffect(() => {
      const interval = setInterval(nextSlide, 4000);
      return () => clearInterval(interval);
  }, [nextSlide]);

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
                    Bienvenido al panel de administración de SportBooking
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
    COMPLETED: "default",
};

const STATUS_LABELS: Record<string, string> = {
    PENDING: "Pendiente",
    CONFIRMED: "Confirmada",
    CANCELLED: "Cancelada",
    COMPLETED: "Completada",
};

function TodayBookings() {
    const today = new Date().toISOString().split("T")[0];
    const [page, setPage] = useState(1);
    const perPage = 6;

    const { data: bookingsData, isLoading } = useQuery({
        queryKey: ["today-bookings"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: any }>("/bookings?limit=50"),
    });

    const todayBookings = (bookingsData?.data || []).filter((b) => {
        const bookingDate = new Date(b.startDatetime).toISOString().split("T")[0];
        return bookingDate === today;
    });

    const totalPages = Math.ceil(todayBookings.length / perPage);
    const paginatedBookings = todayBookings.slice((page - 1) * perPage, page * perPage);

    const formatTime = (d: string) => new Date(d).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-bold">Reservas de hoy</h2>
                    <p className="text-xs text-default-500">
                        {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                </div>
                {todayBookings.length > 0 && (
                    <Chip size="sm" variant="flat" color="primary">{todayBookings.length} reservas</Chip>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
            ) : paginatedBookings.length > 0 ? (
                <>
                    <div className="space-y-3">
                            {paginatedBookings.map((booking) => (
                                <Card key={booking.id} className="border border-divider">
                                    <CardBody className="flex-row items-center justify-between p-4 gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                                <Calendar className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm truncate">{booking.facility.name}</p>
                                                <div className="flex items-center gap-3 mt-0.5 text-xs text-default-500">
                                                    <span className="flex items-center gap-1">
                                                        <User className="h-3 w-3" />
                                                        {booking.user.firstName} {booking.user.lastName}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {formatTime(booking.startDatetime)} — {formatTime(booking.endDatetime)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-sm font-bold text-success">${booking.totalPrice}</span>
                                            <Chip size="sm" variant="flat" color={STATUS_COLORS[booking.status]}>
                                                {STATUS_LABELS[booking.status]}
                                            </Chip>
                                        </div>
                                    </CardBody>
                                </Card>
                            ))}
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4">
                                <p className="text-xs text-default-500">Página {page} de {totalPages}</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage((p) => p - 1)}
                                        disabled={page <= 1}
                                        className="px-3 py-1 text-xs font-medium rounded-lg bg-default-100 hover:bg-default-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        onClick={() => setPage((p) => p + 1)}
                                        disabled={page >= totalPages}
                                        className="px-3 py-1 text-xs font-medium rounded-lg bg-default-100 hover:bg-default-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
            ) : (
                <Card className="border border-divider">
                    <CardBody className="flex flex-col items-center py-8">
                        <Calendar className="h-10 w-10 text-default-200" />
                        <p className="mt-3 text-sm text-default-500">Sin reservas para hoy</p>
                    </CardBody>
                </Card>
            )}
        </div>
    );
}

function TodaySummary() {
    const today = new Date().toISOString().split("T")[0];

    const { data: bookingsData } = useQuery({
        queryKey: ["today-bookings"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: any }>("/bookings?limit=100"),
    });

    const { data: usersData } = useQuery({
        queryKey: ["admin-users-today"],
        queryFn: () => apiClient.get<PaginatedResult<UserType>>("/users?limit=100"),
    });

    const { data: facilities } = useQuery({
        queryKey: ["admin-facilities"],
        queryFn: () => apiClient.get<Facility[]>("/facilities"),
    });

    const allBookings = bookingsData?.data || [];
    const todayBookings = allBookings.filter((b) => {
        const d = new Date(b.startDatetime).toISOString().split("T")[0];
        return d === today && b.status !== "CANCELLED";
    });

    const todayRevenue = todayBookings.reduce((sum, b) => sum + Number(b.totalPrice), 0);

    // Users created today (approximate - check createdAt)
    const allUsers = usersData?.data || [];
    const newUsersToday = allUsers.filter((u) => {
        if (!u.createdAt) return false;
        return new Date(u.createdAt).toISOString().split("T")[0] === today;
    });

    // Unique facilities booked today
    const occupiedFacilities = new Set(todayBookings.map((b) => b.facilityId)).size;

    const stats = [
        {
            icon: <Calendar className="h-5 w-5 text-primary" />,
            label: "Reservas hoy",
            value: todayBookings.length,
            bg: "bg-primary/10",
        },
        {
            icon: <Users className="h-5 w-5 text-secondary" />,
            label: "Usuarios nuevos",
            value: newUsersToday.length,
            bg: "bg-secondary/10",
        },
        {
            icon: <DollarSign className="h-5 w-5 text-success" />,
            label: "Ingresos hoy",
            value: `$${todayRevenue.toLocaleString("es-AR")}`,
            bg: "bg-success/10",
        },
        {
            icon: <MapPin className="h-5 w-5 text-warning" />,
            label: "Canchas ocupadas",
            value: `${occupiedFacilities}/${facilities?.length || 0}`,
            bg: "bg-warning/10",
        },
    ];

    return (
        <div>
            <h2 className="text-lg font-bold mb-4">Resumen del día</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {stats.map((stat, i) => (
                    <Card key={i} className="border border-divider">
                        <CardBody className="flex-row items-center gap-3 p-4">
                            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${stat.bg}`}>
                                {stat.icon}
                            </div>
                            <div>
                                <p className="text-xl font-bold">{stat.value}</p>
                                <p className="text-[11px] text-default-500">{stat.label}</p>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div>
        </div>
    );
}
