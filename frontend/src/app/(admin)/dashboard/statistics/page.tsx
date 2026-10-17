"use client";

import { Card, CardBody, CardHeader, Chip, Spinner, Divider, Progress } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import {
    Calendar, MapPin, TrendingUp, Activity, ArrowUpRight, ArrowDownRight, Users, Filter,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
    BookingStatusDonut, BookingsByDayBar, RevenueAreaChart, SportRevenueBar,
    type StatsByStatus, type StatsBySport, type StatsByDay,
} from "@/components/charts/dashboard-charts";
import type { Facility, Sport, User, PaginatedResult } from "@/types";

type DateRange = "today" | "yesterday" | "week" | "month" | "quarter" | "all";
type StatusFilter = "ALL" | "CONFIRMED" | "COMPLETED";

const DATE_OPTIONS: { key: DateRange; label: string }[] = [
    { key: "today", label: "Hoy" },
    { key: "yesterday", label: "Ayer" },
    { key: "week", label: "Última semana" },
    { key: "month", label: "Último mes" },
    { key: "quarter", label: "Último trimestre" },
    { key: "all", label: "Todo" },
];

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "Todos los estados" },
    { key: "CONFIRMED", label: "Confirmadas" },
    { key: "COMPLETED", label: "Completadas" },
];

interface StatsResponse {
    totals: {
        total: number;
        confirmed: number;
        cancelled: number;
        completed: number;
        pending: number;
        totalRevenue: number;
        totalCommission: number;
        totalBase: number;
        occupancyRate: number;
        avgPrice: number;
        uniqueClients: number;
    };
    byStatus: StatsByStatus;
    byWeekday: number[];
    byDay: StatsByDay[];
    bySport: StatsBySport[];
    byVenue: { venueId: string; venueName: string; total: number; base: number; commission: number; count: number }[];
    recentClients: { id: string; firstName?: string; lastName?: string }[];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export default function StatisticsPage() {
    const { user } = useAuthStore();
    const isVenueAdmin = user?.role === "VENUE_ADMIN";
    const [dateRange, setDateRange] = useState<DateRange>("month");
    const [sportFilter, setSportFilter] = useState("");
    const [venueFilter, setVenueFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

    // Estadísticas agregadas en el backend (escalable, respeta scope por rol)
    const { data: stats, isLoading } = useQuery({
        queryKey: ["stats", dateRange, sportFilter, venueFilter, statusFilter],
        queryFn: () =>
            apiClient.get<StatsResponse>("/bookings/stats", {
                range: dateRange,
                ...(sportFilter ? { sportId: sportFilter } : {}),
                ...(venueFilter ? { venueId: venueFilter } : {}),
                ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
            }),
    });

    // Catálogos para los filtros
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
        enabled: !isVenueAdmin,
    });

    const venues = (() => {
        if (!facilities) return [] as { id: string; name: string }[];
        const map = new Map<string, { id: string; name: string }>();
        facilities.forEach((f) => {
            if (!map.has(f.venue.id)) map.set(f.venue.id, { id: f.venue.id, name: f.venue.name });
        });
        return Array.from(map.values());
    })();

    if (isLoading || !stats) {
        return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
    }

    const t = stats.totals;
    const activeCount = t.total - t.cancelled;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">Estadísticas</h1>
                <p className="text-sm text-default-500 mt-1">
                    Métricas y análisis de rendimiento de tu plataforma
                </p>
            </div>

            {/* Filters Bar */}
            <Card className="border border-divider">
                <CardBody className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Filter className="h-4 w-4 text-default-500" />
                        <span className="text-sm font-semibold">Filtros</span>
                    </div>
                    <div className={`grid gap-3 sm:grid-cols-2 ${isVenueAdmin ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
                        <Select
                            label="Período" size="sm" variant="bordered"
                            selectedKeys={[dateRange]}
                            onSelectionChange={(keys: any) => setDateRange(Array.from(keys)[0] as DateRange || "month")}
                        >
                            {DATE_OPTIONS.map((opt) => <SelectItem key={opt.key}>{opt.label}</SelectItem>)}
                        </Select>
                        <Select
                            label="Deporte" size="sm" variant="bordered"
                            selectedKeys={sportFilter ? [sportFilter] : []}
                            onSelectionChange={(keys: any) => setSportFilter(Array.from(keys)[0] as string || "")}
                        >
                            {(sports || []).map((s) => <SelectItem key={s.id}>{s.name}</SelectItem>)}
                        </Select>
                        {!isVenueAdmin && (
                            <Select
                                label="Complejo" size="sm" variant="bordered"
                                selectedKeys={venueFilter ? [venueFilter] : []}
                                onSelectionChange={(keys: any) => setVenueFilter(Array.from(keys)[0] as string || "")}
                            >
                                {venues.map((v) => <SelectItem key={v.id}>{v.name}</SelectItem>)}
                            </Select>
                        )}
                        <Select
                            label="Estado" size="sm" variant="bordered"
                            selectedKeys={[statusFilter]}
                            onSelectionChange={(keys: any) => setStatusFilter(Array.from(keys)[0] as StatusFilter || "ALL")}
                        >
                            {STATUS_OPTIONS.map((opt) => <SelectItem key={opt.key}>{opt.label}</SelectItem>)}
                        </Select>
                    </div>
                    {(sportFilter || venueFilter || statusFilter !== "ALL" || dateRange !== "all") && (
                        <div className="mt-3 flex items-center gap-2">
                            <span className="text-xs text-default-400">{t.total} reserva{t.total !== 1 ? "s" : ""} en el período</span>
                            <button
                                onClick={() => { setDateRange("all"); setSportFilter(""); setVenueFilter(""); setStatusFilter("ALL"); }}
                                className="text-xs text-primary hover:underline"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    )}
                </CardBody>
            </Card>

            {/* Stats Cards */}
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isVenueAdmin ? "xl:grid-cols-5" : "xl:grid-cols-6"}`}>
                <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Ingresos" value={`$${fmt(t.totalRevenue)}`} color="bg-success-50 text-success-600" />
                {!isVenueAdmin && (
                    <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Comisión empresa" value={`$${fmt(t.totalCommission)}`} color="bg-emerald-100 text-emerald-600" />
                )}
                <StatCard icon={<Calendar className="h-5 w-5" />} label="Reservas" value={t.total} color="bg-primary-50 text-primary-600" trend={`${t.confirmed} confirmadas`} />
                <StatCard icon={<Activity className="h-5 w-5" />} label="Confirmación" value={`${t.occupancyRate}%`} color="bg-secondary-50 text-secondary-600" trend={`${t.cancelled} canceladas`} trendUp={false} />
                <StatCard icon={<MapPin className="h-5 w-5" />} label="Instalaciones" value={facilities?.filter((f) => f.isActive).length || 0} color="bg-warning-50 text-warning-600" trend={`${sports?.length || 0} deportes`} />
                {isVenueAdmin ? (
                    <StatCard icon={<Users className="h-5 w-5" />} label="Clientes" value={t.uniqueClients} color="bg-primary-50 text-primary-600" trend="reservaron aquí" trendUp={t.uniqueClients > 0 ? true : undefined} />
                ) : (
                        <StatCard icon={<Users className="h-5 w-5" />} label="Usuarios" value={usersData?.meta?.total || usersData?.data?.length || 0} color="bg-primary-50 text-primary-600" trend="registrados" />
                )}
            </div>

            {/* Reparto por complejo */}
            <Card className="border border-divider">
                <CardHeader className="flex-col items-start gap-1 pb-2">
                    <h2 className="text-base font-semibold">
                        {isVenueAdmin ? "Lo que le corresponde a tu complejo" : "Reparto por complejo"}
                    </h2>
                    <p className="text-xs text-default-400">
                        Según los filtros aplicados ({activeCount} reserva{activeCount !== 1 ? "s" : ""})
                    </p>
                </CardHeader>
                <Divider />
                <CardBody className="gap-3">
                    {!isVenueAdmin && stats.byVenue.length > 0 && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-xl bg-success-50 p-3">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-success-600">Para los complejos</p>
                                <p className="text-xl font-bold text-success-700">${fmt(t.totalBase)}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-100 p-3">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Para la empresa (comisión)</p>
                                <p className="text-xl font-bold text-emerald-700">${fmt(t.totalCommission)}</p>
                            </div>
                            <div className="rounded-xl bg-default-100 p-3">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-default-500">Total cobrado</p>
                                <p className="text-xl font-bold">${fmt(t.totalRevenue)}</p>
                            </div>
                        </div>
                    )}

                    {stats.byVenue.length === 0 ? (
                        <p className="py-4 text-center text-sm text-default-400">Sin datos para los filtros aplicados</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-divider text-left text-xs text-default-400">
                                        <th className="py-2 pr-3 font-medium">Complejo</th>
                                        <th className="py-2 px-3 text-right font-medium">Reservas</th>
                                        <th className="py-2 px-3 text-right font-medium">Le corresponde</th>
                                        {!isVenueAdmin && <th className="py-2 px-3 text-right font-medium">Comisión empresa</th>}
                                        <th className="py-2 pl-3 text-right font-medium">Total cobrado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                        {stats.byVenue.map((r) => (
                                        <tr key={r.venueId} className="border-b border-divider/60 last:border-0">
                                            <td className="py-2.5 pr-3 font-medium">{r.venueName}</td>
                                            <td className="py-2.5 px-3 text-right text-default-500">{r.count}</td>
                                            <td className="py-2.5 px-3 text-right font-semibold text-success-600">${fmt(r.base)}</td>
                                            {!isVenueAdmin && <td className="py-2.5 px-3 text-right text-emerald-600">${fmt(r.commission)}</td>}
                                            <td className="py-2.5 pl-3 text-right text-default-600">${fmt(r.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardBody>
            </Card>

            {/* Charts */}
            <div className="grid gap-6 md:grid-cols-2">
                <BookingStatusDonut byStatus={stats.byStatus} />
                <BookingsByDayBar byWeekday={stats.byWeekday} />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <RevenueAreaChart byDay={stats.byDay} />
                <SportRevenueBar bySport={stats.bySport} />
            </div>

            {/* Detailed Breakdown */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Por deporte (distribución por cantidad) */}
                <Card>
                    <CardHeader className="pb-2">
                        <div>
                            <h2 className="text-base font-semibold">Por deporte</h2>
                            <p className="text-xs text-default-400">Distribución</p>
                        </div>
                    </CardHeader>
                    <Divider />
                    <CardBody className="gap-3">
                        {(() => {
                            const totalCount = stats.bySport.reduce((s, x) => s + x.count, 0);
                            return stats.bySport.length > 0 ? stats.bySport.map((s) => (
                                <div key={s.sportId} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium">{s.name}</span>
                                        <span className="text-default-500">{s.count} ({totalCount > 0 ? Math.round((s.count / totalCount) * 100) : 0}%)</span>
                                    </div>
                                    <Progress value={totalCount > 0 ? (s.count / totalCount) * 100 : 0} color="primary" size="sm" />
                                </div>
                            )) : <p className="text-sm text-default-400 text-center py-2">Sin datos</p>;
                        })()}
                    </CardBody>
                </Card>

                {/* Indicadores */}
                <Card>
                    <CardHeader className="pb-2">
                        <div>
                            <h2 className="text-base font-semibold">Indicadores</h2>
                            <p className="text-xs text-default-400">Métricas clave</p>
                        </div>
                    </CardHeader>
                    <Divider />
                    <CardBody className="gap-4">
                        <QuickStat label="Precio promedio" value={`$${fmt(t.avgPrice)}`} sub="por reserva" />
                        <QuickStat label="Completadas" value={String(t.completed)} sub="reservas finalizadas" />
                        <QuickStat label="Canceladas" value={String(t.cancelled)} sub="reservas canceladas" />
                        {isVenueAdmin
                            ? <QuickStat label="Clientes" value={String(t.uniqueClients)} sub="distintos" />
                            : <QuickStat label="Total usuarios" value={String(usersData?.meta?.total || usersData?.data?.length || 0)} sub="registrados" />}
                    </CardBody>
                </Card>

                {/* Últimos: clientes (venue admin) o usuarios del sistema (admin general) */}
                {isVenueAdmin ? (
                    <Card>
                        <CardHeader className="pb-2">
                            <div>
                                <h2 className="text-base font-semibold">Últimos clientes</h2>
                                <p className="text-xs text-default-400">Quienes reservaron en tu complejo</p>
                            </div>
                        </CardHeader>
                        <Divider />
                        <CardBody className="gap-2">
                            {stats.recentClients.length > 0 ? (
                                stats.recentClients.map((c) => (
                                    <div key={c.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-default-50 transition-colors">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                                            {c.firstName?.[0]}{c.lastName?.[0]}
                                        </div>
                                        <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-default-400 text-center py-2">Todavía no hay clientes</p>
                            )}
                        </CardBody>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader className="pb-2 flex-row items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold">Últimos usuarios</h2>
                                <p className="text-xs text-default-400">Registros recientes</p>
                            </div>
                            <Link href="/dashboard/users">
                                <Chip size="sm" variant="flat" color="primary" className="cursor-pointer">Ver todos →</Chip>
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
                                        <Chip size="sm" variant="flat" color={u.role === "ADMIN" ? "secondary" : "default"}>{u.role}</Chip>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-default-400 text-center py-2">Sin usuarios</p>
                            )}
                        </CardBody>
                    </Card>
                )}
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color, trend, trendUp }: {
    icon: React.ReactNode; label: string; value: number | string; color: string; trend?: string; trendUp?: boolean;
}) {
    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardBody className="gap-3">
                <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>{icon}</div>
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
