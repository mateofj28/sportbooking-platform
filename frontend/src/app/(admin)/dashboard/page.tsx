"use client";

import { Card, CardBody, CardHeader, Chip, Spinner, Divider, Progress } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
    Calendar,
    MapPin,
    TrendingUp,
    Clock,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Users,
} from "lucide-react";
import Link from "next/link";
import { BookingStatusDonut, BookingsByDayBar, RevenueAreaChart, SportRevenueBar } from "@/components/charts/dashboard-charts";
import type { Booking, Facility, Sport, User, PaginatedResult } from "@/types";

export default function DashboardPage() {
    const { data: bookings, isLoading: loadingBookings } = useQuery({
        queryKey: ["admin-bookings"],
        queryFn: () => apiClient.get<Booking[]>("/bookings"),
    });

    const { data: facilities } = useQuery({
        queryKey: ["admin-facilities"],
        queryFn: () => apiClient.get<Facility[]>("/facilities"),
    });

    const { data: sports } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });

    const { data: usersData } = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => apiClient.get<PaginatedResult<User>>("/users?limit=100"),
    });

    // Computed stats
    const pendingBookings = bookings?.filter((b) => b.status === "PENDING") || [];
    const confirmedBookings = bookings?.filter((b) => b.status === "CONFIRMED") || [];
    const cancelledBookings = bookings?.filter((b) => b.status === "CANCELLED") || [];
    const completedBookings = bookings?.filter((b) => b.status === "COMPLETED") || [];
    const totalRevenue = bookings
        ?.filter((b) => b.status !== "CANCELLED")
        .reduce((sum, b) => sum + Number(b.totalPrice), 0) || 0;

    // This week's bookings
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const thisWeekBookings = bookings?.filter(
        (b) => new Date(b.startDatetime) >= startOfWeek && b.status !== "CANCELLED"
    ) || [];

    // Occupancy rate (simplified: confirmed / total non-cancelled)
    const totalActive = (bookings?.length || 0) - cancelledBookings.length;
    const occupancyRate = totalActive > 0
        ? Math.round((confirmedBookings.length / totalActive) * 100)
        : 0;

    // Bookings by sport
    const bookingsBySport = bookings?.reduce((acc, b) => {
        const sportName = b.facility?.sport?.name || "Otro";
        acc[sportName] = (acc[sportName] || 0) + 1;
        return acc;
    }, {} as Record<string, number>) || {};

    // Most popular facility
    const facilityCount = bookings?.reduce((acc, b) => {
        const name = b.facility?.name || "Desconocida";
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {} as Record<string, number>) || {};
    const topFacility = Object.entries(facilityCount).sort((a, b) => b[1] - a[1])[0];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
                <p className="text-sm text-default-500 mt-1">
                    Resumen general • {now.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
            </div>

            {/* Main Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    icon={<TrendingUp className="h-5 w-5" />}
                    label="Ingresos totales"
                    value={`$${totalRevenue.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`}
                    color="bg-success-50 text-success-600"
                    trend={thisWeekBookings.length > 0 ? `+${thisWeekBookings.length} esta semana` : undefined}
                    trendUp={true}
                />
                <StatCard
                    icon={<Calendar className="h-5 w-5" />}
                    label="Reservas totales"
                    value={bookings?.length || 0}
                    color="bg-primary-50 text-primary-600"
                    trend={`${pendingBookings.length} pendientes`}
                />
                <StatCard
                    icon={<Activity className="h-5 w-5" />}
                    label="Tasa de confirmación"
                    value={`${occupancyRate}%`}
                    color="bg-secondary-50 text-secondary-600"
                    trend={`${cancelledBookings.length} canceladas`}
                    trendUp={false}
                />
                <StatCard
                    icon={<MapPin className="h-5 w-5" />}
                    label="Instalaciones activas"
                    value={facilities?.filter((f) => f.isActive).length || 0}
                    color="bg-warning-50 text-warning-600"
                    trend={`${sports?.length || 0} deportes`}
                />
                <StatCard
                    icon={<Users className="h-5 w-5" />}
                    label="Total usuarios"
                    value={usersData?.meta?.total || usersData?.data?.length || 0}
                    color="bg-default-100 text-default-600"
                    trend="registrados"
                />
            </div>

            {/* Booking Status Breakdown */}
            <Card>
                <CardHeader className="pb-2">
                    <div>
                        <h2 className="text-base font-semibold">Estado de reservas</h2>
                        <p className="text-xs text-default-400">Desglose por estado</p>
                    </div>
                </CardHeader>
                <Divider />
                <CardBody>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="flex items-center gap-3 rounded-lg bg-warning-50 p-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
                                <Clock className="h-5 w-5 text-warning" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{pendingBookings.length}</p>
                                <p className="text-xs text-default-500">Pendientes</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg bg-success-50 p-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20">
                                <Calendar className="h-5 w-5 text-success" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{confirmedBookings.length}</p>
                                <p className="text-xs text-default-500">Confirmadas</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg bg-danger-50 p-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/20">
                                <Activity className="h-5 w-5 text-danger" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{cancelledBookings.length}</p>
                                <p className="text-xs text-default-500">Canceladas</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg bg-default-100 p-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-default-200">
                                <Calendar className="h-5 w-5 text-default-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold">{completedBookings.length}</p>
                                <p className="text-xs text-default-500">Completadas</p>
                            </div>
                        </div>
                    </div>
                </CardBody>
            </Card>

            {/* Charts Section */}
            <div className="grid gap-6 md:grid-cols-2">
                <BookingStatusDonut bookings={bookings || []} />
                <BookingsByDayBar bookings={bookings || []} />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <RevenueAreaChart bookings={bookings || []} />
                <SportRevenueBar bookings={bookings || []} />
            </div>

            {/* Últimos usuarios + Recent Bookings */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Recent Bookings */}
                <Card className="lg:col-span-2 animate-slide-up">
                    <CardHeader className="flex-row items-center justify-between pb-2">
                        <div>
                            <h2 className="text-base font-semibold">Reservas recientes</h2>
                            <p className="text-xs text-default-400">Últimas actividades</p>
                        </div>
                        <Link href="/dashboard/bookings">
                            <Chip size="sm" variant="flat" color="primary" className="cursor-pointer hover:bg-primary-100 transition-colors">
                                Ver todas →
                            </Chip>
                        </Link>
                    </CardHeader>
                    <Divider />
                    <CardBody className="p-0">
                        {loadingBookings ? (
                            <div className="flex justify-center py-8">
                                <Spinner />
                            </div>
                        ) : bookings && bookings.length > 0 ? (
                            <div className="divide-y divide-divider">
                                {bookings.slice(0, 6).map((booking, i) => (
                                    <div
                                        key={booking.id}
                                        className="flex items-center justify-between px-4 py-3 hover:bg-default-50 transition-colors"
                                        style={{ animationDelay: `${i * 50}ms` }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50">
                                                <Calendar className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{booking.facility.name}</p>
                                                <p className="text-xs text-default-400">
                                                    {booking.user.firstName} {booking.user.lastName} •{" "}
                                                    {new Date(booking.startDatetime).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                                                    {" "}
                                                    {new Date(booking.startDatetime).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-semibold">${booking.totalPrice}</span>
                                            <StatusChip status={booking.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center">
                                <Calendar className="mx-auto h-10 w-10 text-default-200" />
                                <p className="mt-3 text-sm text-default-500">No hay reservas aún</p>
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* Right Column */}
                <div className="space-y-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
                    {/* Últimos 5 usuarios */}
                    <Card>
                        <CardHeader className="pb-2 flex-row items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold">Últimos usuarios</h2>
                                <p className="text-xs text-default-400">Registros recientes</p>
                            </div>
                            <Link href="/dashboard/users">
                                <Chip size="sm" variant="flat" color="primary" className="cursor-pointer">
                                    Ver todos →
                                </Chip>
                            </Link>
                        </CardHeader>
                        <Divider />
                        <CardBody className="gap-2">
                            {usersData?.data && usersData.data.length > 0 ? (
                                usersData.data.slice(0, 5).map((u) => (
                                    <div key={u.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-default-50 transition-colors">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                                            {u.firstName?.[0]}{u.lastName?.[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{u.firstName} {u.lastName}</p>
                                            <p className="text-xs text-default-400 truncate">{u.email}</p>
                                        </div>
                                        <Chip size="sm" variant="flat" color={u.role === "ADMIN" ? "secondary" : "default"}>
                                            {u.role}
                                        </Chip>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-default-400 text-center py-2">Sin usuarios</p>
                            )}
                        </CardBody>
                    </Card>

                    {/* Bookings by Sport */}
                    <Card>
                        <CardHeader className="pb-2">
                            <div>
                                <h2 className="text-base font-semibold">Por deporte</h2>
                                <p className="text-xs text-default-400">Distribución de reservas</p>
                            </div>
                        </CardHeader>
                        <Divider />
                        <CardBody className="gap-3">
                            {Object.entries(bookingsBySport).length > 0 ? (
                                Object.entries(bookingsBySport)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([sport, count]) => {
                                        const total = bookings?.length || 1;
                                        const percentage = Math.round((count / total) * 100);
                                        return (
                                            <div key={sport} className="space-y-1">
                                                <div className="flex justify-between text-sm">
                                                    <span className="font-medium">{sport}</span>
                                                    <span className="text-default-500">{count} ({percentage}%)</span>
                                                </div>
                                                <Progress
                                                    value={percentage}
                                                    color="primary"
                                                    size="sm"
                                                    className="h-1.5"
                                                />
                                            </div>
                                        );
                                    })
                            ) : (
                                <p className="text-sm text-default-400 text-center py-2">Sin datos</p>
                            )}
                        </CardBody>
                    </Card>

                    {/* Quick Stats */}
                    <Card>
                        <CardHeader className="pb-2">
                            <div>
                                <h2 className="text-base font-semibold">Indicadores clave</h2>
                                <p className="text-xs text-default-400">Métricas de rendimiento</p>
                            </div>
                        </CardHeader>
                        <Divider />
                        <CardBody className="gap-4">
                            <QuickStat
                                label="Instalación más popular"
                                value={topFacility ? topFacility[0] : "—"}
                                sub={topFacility ? `${topFacility[1]} reservas` : ""}
                            />
                            <QuickStat
                                label="Reservas esta semana"
                                value={thisWeekBookings.length.toString()}
                                sub={`$${thisWeekBookings.reduce((s, b) => s + Number(b.totalPrice), 0).toFixed(0)} generados`}
                            />
                            <QuickStat
                                label="Precio promedio"
                                value={totalActive > 0 ? `$${(totalRevenue / totalActive).toFixed(0)}` : "$0"}
                                sub="por reserva"
                            />
                        </CardBody>
                    </Card>

                    {/* Quick Actions */}
                    <Card>
                        <CardBody className="gap-2">
                            <p className="text-xs font-semibold text-default-500 uppercase tracking-wider">Accesos rápidos</p>
                            <Link
                                href="/dashboard/bookings"
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-default-700 hover:bg-primary-50 hover:text-primary transition-colors"
                            >
                                <Clock className="h-4 w-4" />
                                Reservas pendientes
                                {pendingBookings.length > 0 && (
                                    <Chip size="sm" color="warning" variant="flat" className="ml-auto">
                                        {pendingBookings.length}
                                    </Chip>
                                )}
                            </Link>
                            <Link
                                href="/dashboard/facilities"
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-default-700 hover:bg-primary-50 hover:text-primary transition-colors"
                            >
                                <MapPin className="h-4 w-4" />
                                Gestionar instalaciones
                            </Link>
                            <Link
                                href="/dashboard/users"
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-default-700 hover:bg-primary-50 hover:text-primary transition-colors"
                            >
                                <Users className="h-4 w-4" />
                                Ver usuarios
                            </Link>
                        </CardBody>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    color,
    trend,
    trendUp,
}: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    color: string;
    trend?: string;
    trendUp?: boolean;
}) {
    return (
        <Card className="animate-scale-in hover:shadow-md transition-shadow">
            <CardBody className="gap-3">
                <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                        {icon}
                    </div>
                    {trend && (
                        <span className={`flex items-center gap-1 text-xs ${trendUp === true ? "text-success" : trendUp === false ? "text-danger" : "text-default-400"}`}>
                            {trendUp === true && <ArrowUpRight className="h-3 w-3" />}
                            {trendUp === false && <ArrowDownRight className="h-3 w-3" />}
                            {trend}
                        </span>
                    )}
                </div>
                <div>
                    <p className="text-2xl font-bold tracking-tight">{value}</p>
                    <p className="text-xs text-default-500">{label}</p>
                </div>
            </CardBody>
        </Card>
    );
}

function StatusChip({ status }: { status: string }) {
    const config: Record<string, { label: string; color: "warning" | "success" | "danger" | "default" }> = {
        PENDING: { label: "Pendiente", color: "warning" },
        CONFIRMED: { label: "Confirmada", color: "success" },
        CANCELLED: { label: "Cancelada", color: "danger" },
        COMPLETED: { label: "Completada", color: "default" },
    };
    const { label, color } = config[status] || config.PENDING;
    return (
        <Chip size="sm" variant="flat" color={color} className="text-[10px]">
            {label}
        </Chip>
    );
}

function QuickStat({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <p className="text-xs text-default-400">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
            </div>
            <span className="text-xs text-default-400">{sub}</span>
        </div>
    );
}
