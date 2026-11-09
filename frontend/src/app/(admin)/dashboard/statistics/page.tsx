"use client";

import { Card, CardBody, CardHeader, Chip, Spinner, Divider, Progress, DatePicker } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { today, getLocalTimeZone, type CalendarDate } from "@internationalized/date";
import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/supabase-helpers";
import { supabase } from "@/lib/supabase";
import { useFacilities } from "@/hooks/use-facilities";
import { useSports } from "@/hooks/use-sports";
import { useAuthStore } from "@/stores/auth-store";
import {
    Calendar, MapPin, TrendingUp, Activity, ArrowUpRight, ArrowDownRight, Users, Filter, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
    BookingStatusDonut, BookingsByDayBar, RevenueAreaChart, SportRevenueBar,
    type StatsByStatus, type StatsBySport, type StatsByDay,
} from "@/components/charts/dashboard-charts";

type DateRange = "today" | "yesterday" | "week" | "month" | "custom" | "all";
type StatusFilter = "ALL" | "CONFIRMED" | "COMPLETED";

const DATE_OPTIONS: { key: DateRange; label: string }[] = [
    { key: "today", label: "Hoy" },
    { key: "yesterday", label: "Ayer" },
    { key: "week", label: "Última semana" },
    { key: "month", label: "Último mes" },
    { key: "custom", label: "Personalizado" },
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
        totalAll: number;
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

/** Valor de la opción "Todos" en los selects de deporte y complejo. */
const ALL_KEY = "ALL";


export default function StatisticsPage() {
    const { user } = useAuthStore();
    const isVenueAdmin = user?.role === "VENUE_ADMIN";
    const [dateRange, setDateRange] = useState<DateRange>("month");
    const [customFrom, setCustomFrom] = useState<CalendarDate | null>(null);
    const [customTo, setCustomTo] = useState<CalendarDate | null>(null);
    const [sportFilter, setSportFilter] = useState("");
    const [venueFilter, setVenueFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

    // CalendarDate -> "YYYY-MM-DD"
    const toISO = (d: CalendarDate | null) =>
        d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "";

    const maxDate = today(getLocalTimeZone()); // no permitir fechas futuras

    // En modo personalizado, solo consultar cuando ambas fechas estén elegidas
    const customReady = dateRange !== "custom" || (!!customFrom && !!customTo);

    // Estadísticas via Postgres RPC (corre en la DB, una sola round-trip, respeta scope por rol via RLS)
    const { data: stats, isLoading, isError, error: statsError, refetch } = useQuery({
        queryKey: ["stats", dateRange, toISO(customFrom), toISO(customTo), sportFilter, venueFilter, statusFilter],
        queryFn: async () => {
            const { data, error } = await callRpc<StatsResponse>('get_stats', {
                p_range: dateRange,
                ...(dateRange === "custom" ? { p_from: toISO(customFrom), p_to: toISO(customTo) } : {}),
                ...(sportFilter ? { p_sport_id: sportFilter } : {}),
                ...(venueFilter ? { p_venue_id: venueFilter } : {}),
                ...(statusFilter !== "ALL" ? { p_status: statusFilter } : {}),
            });
            if (error) throw new Error(error);
            // Normalizar campos que pueden venir null de la RPC
            const raw = data as any;
            return {
                totals: raw?.totals ?? {
                    total: 0, totalAll: 0, confirmed: 0, cancelled: 0, completed: 0,
                    pending: 0, totalRevenue: 0, totalCommission: 0, totalBase: 0,
                    occupancyRate: 0, avgPrice: 0, uniqueClients: 0,
                },
                byStatus: raw?.byStatus ?? { PENDING: 0, CONFIRMED: 0, CANCELLED: 0, COMPLETED: 0 },
                byWeekday: Array.isArray(raw?.byWeekday) ? raw.byWeekday : [0, 0, 0, 0, 0, 0, 0],
                byDay: Array.isArray(raw?.byDay) ? raw.byDay : [],
                bySport: Array.isArray(raw?.bySport) ? raw.bySport : [],
                byVenue: Array.isArray(raw?.byVenue) ? raw.byVenue : [],
                recentClients: Array.isArray(raw?.recentClients) ? raw.recentClients : [],
            } as StatsResponse;
        },
        enabled: customReady,
    });

    // Catálogos para los filtros — hooks directos a Supabase (sin apiClient)
    const { data: facilitiesData } = useFacilities();
    const { data: sportsData } = useSports();

    // Conteo y últimos usuarios (solo admin general). El RLS de la migración 007
    // permite al ADMIN leer todos los perfiles.
    const { data: usersData } = useQuery({
        queryKey: ["admin-users-stats"],
        queryFn: async () => {
            const { data, error, count } = await supabase
                .from("profiles")
                .select("id, first_name, last_name, email, role, created_at", { count: "exact" })
                .order("created_at", { ascending: false })
                .limit(5);
            if (error) throw new Error(error.message);
            return {
                data: (data ?? []).map((r: any) => ({
                    id: r.id,
                    firstName: r.first_name,
                    lastName: r.last_name,
                    email: r.email,
                    role: r.role,
                    createdAt: r.created_at,
                })), total: count ?? 0
            };
        },
        enabled: !isVenueAdmin,
    });

    const venues = (() => {
        if (!facilitiesData) return [] as { id: string; name: string }[];
        const map = new Map<string, { id: string; name: string }>();
        facilitiesData.forEach((f) => {
            // Una cancha puede venir sin venue embebido (p. ej. complejo inactivo u oculto por RLS)
            const v = f.venue;
            if (v?.id && !map.has(v.id)) map.set(v.id, { id: v.id, name: v.name });
        });
        return Array.from(map.values());
    })();

    // Mientras se cargan los datos (o faltan fechas en modo personalizado)
    const showLoader = (isLoading || !stats) && customReady && !isError;
    const t = stats?.totals;
    const activeCount = t ? t.total - t.cancelled : 0;

    return (
        <div className="space-y-6 animate-fade-in min-w-0">
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
                        {dateRange === "custom" && (
                            <>
                                <DatePicker
                                    label="Desde"
                                    size="sm"
                                    variant="bordered"
                                    value={customFrom as any}
                                    onChange={(v: any) => setCustomFrom(v)}
                                    maxValue={(customTo || maxDate) as any}
                                    showMonthAndYearPickers
                                />
                                <DatePicker
                                    label="Hasta"
                                    size="sm"
                                    variant="bordered"
                                    value={customTo as any}
                                    onChange={(v: any) => setCustomTo(v)}
                                    minValue={(customFrom || undefined) as any}
                                    maxValue={maxDate as any}
                                    showMonthAndYearPickers
                                />
                            </>
                        )}
                        <Select
                            label="Deporte" size="sm" variant="bordered"
                            disallowEmptySelection
                            selectedKeys={[sportFilter || ALL_KEY]}
                            onSelectionChange={(keys: any) => {
                                const k = Array.from(keys)[0] as string | undefined;
                                setSportFilter(!k || k === ALL_KEY ? "" : k);
                            }}
                        >
                            {[
                                <SelectItem key={ALL_KEY}>Todos los deportes</SelectItem>,
                                ...(sportsData || []).map((s) => <SelectItem key={s.id}>{s.name}</SelectItem>),
                            ]}
                        </Select>
                        {!isVenueAdmin && (
                            <Select
                                label="Complejo" size="sm" variant="bordered"
                                disallowEmptySelection
                                selectedKeys={[venueFilter || ALL_KEY]}
                                onSelectionChange={(keys: any) => {
                                    const k = Array.from(keys)[0] as string | undefined;
                                    setVenueFilter(!k || k === ALL_KEY ? "" : k);
                                }}
                            >
                                {[
                                    <SelectItem key={ALL_KEY}>Todos los complejos</SelectItem>,
                                    ...venues.map((v) => <SelectItem key={v.id}>{v.name}</SelectItem>),
                                ]}
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
                            {t && <span className="text-xs text-default-400">{t.totalAll} reserva{t.totalAll !== 1 ? "s" : ""} en el período</span>}
                            <button
                                onClick={() => { setDateRange("all"); setCustomFrom(null); setCustomTo(null); setSportFilter(""); setVenueFilter(""); setStatusFilter("ALL"); }}
                                className="text-xs text-primary hover:underline"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    )}
                </CardBody>
            </Card>

            {/* Aviso en modo personalizado sin fechas completas */}
            {dateRange === "custom" && !customReady && (
                <Card className="border border-divider">
                    <CardBody className="py-8 text-center text-sm text-default-500">
                        Elegí una fecha de inicio y una de fin para ver las estadísticas del período.
                    </CardBody>
                </Card>
            )}

            {isError && (
                <Card className="border border-danger-200">
                    <CardBody className="items-center gap-2 py-8 text-center">
                        <p className="text-sm font-semibold text-danger">No se pudieron cargar las estadísticas</p>
                        <p className="text-xs text-default-500">{(statsError as Error)?.message}</p>
                        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">
                            Reintentar
                        </button>
                    </CardBody>
                </Card>
            )}

            {showLoader && (
                <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
            )}

            {t && !showLoader && <>

            {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Ingresos" value={`$${fmt(t.totalBase)}`} color="bg-success-50 text-success-600" />
                {!isVenueAdmin && (
                    <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Comisión empresa" value={`$${fmt(t.totalCommission)}`} color="bg-emerald-100 text-emerald-600" />
                )}
                    <StatCard icon={<Calendar className="h-5 w-5" />} label="Reservas" value={t.totalAll} color="bg-primary-50 text-primary-600" trend={`${t.cancelled} canceladas`} trendUp={t.cancelled > 0 ? false : undefined} />
                <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Completadas" value={t.completed} color="bg-success-50 text-success-600" trend="turnos asistidos" trendUp={t.completed > 0 ? true : undefined} />
                <StatCard icon={<Activity className="h-5 w-5" />} label="Confirmación" value={`${t.occupancyRate}%`} color="bg-secondary-50 text-secondary-600" trend={`${t.cancelled} canceladas`} trendUp={false} />
                    <StatCard icon={<MapPin className="h-5 w-5" />} label="Instalaciones" value={facilitiesData?.filter((f) => f.isActive).length || 0} color="bg-warning-50 text-warning-600" trend={`${sportsData?.length || 0} deportes`} />
                {isVenueAdmin ? (
                    <StatCard icon={<Users className="h-5 w-5" />} label="Clientes" value={t.uniqueClients} color="bg-primary-50 text-primary-600" trend="reservaron aquí" trendUp={t.uniqueClients > 0 ? true : undefined} />
                ) : (
                            <StatCard icon={<Users className="h-5 w-5" />} label="Usuarios" value={usersData?.total || 0} color="bg-primary-50 text-primary-600" trend="registrados" />
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
                                <div className="rounded-xl border border-success-200 bg-success-50 p-3 dark:border-success-500/20 dark:bg-success-500/10">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-success-600 dark:text-success-400">Para los complejos</p>
                                    <p className="text-xl font-bold text-success-700 dark:text-success-400">${fmt(t.totalBase)}</p>
                            </div>
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Para la empresa (comisión)</p>
                                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">${fmt(t.totalCommission)}</p>
                            </div>
                                <div className="rounded-xl border border-default-200 bg-default-100 p-3 dark:border-default-100 dark:bg-default-100/50">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-default-500">Total cobrado</p>
                                    <p className="text-xl font-bold text-default-700 dark:text-default-foreground">${fmt(t.totalRevenue)}</p>
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
                                        {!isVenueAdmin && <th className="py-2 px-3 text-right font-medium">Comisión empresa</th>}
                                            <th className="py-2 pl-3 text-right font-medium">Le corresponde</th>
                                    </tr>
                                </thead>
                                <tbody>
                                        {stats.byVenue.map((r) => (
                                        <tr key={r.venueId} className="border-b border-divider/60 last:border-0">
                                            <td className="py-2.5 pr-3 font-medium">{r.venueName}</td>
                                                <td className="py-2.5 px-3 text-right text-default-500">{r.count}</td>
                                            {!isVenueAdmin && <td className="py-2.5 px-3 text-right text-emerald-600">${fmt(r.commission)}</td>}
                                                <td className="py-2.5 pl-3 text-right font-semibold text-success-600">${fmt(r.base)}</td>
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
                    <div className="min-w-0 overflow-hidden"><BookingStatusDonut byStatus={stats.byStatus} /></div>
                    <div className="min-w-0 overflow-hidden"><BookingsByDayBar byWeekday={stats.byWeekday} /></div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                    <div className="min-w-0 overflow-hidden"><RevenueAreaChart byDay={stats.byDay} /></div>
                    <div className="min-w-0 overflow-hidden"><SportRevenueBar bySport={stats.bySport} /></div>
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
                                : <QuickStat label="Total usuarios" value={String(usersData?.total || 0)} sub="registrados" />}
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
            </>}
        </div>
    );
}

function StatCard({ icon, label, value, color, trend, trendUp }: {
    icon: React.ReactNode; label: string; value: number | string; color: string; trend?: string; trendUp?: boolean;
}) {
    return (
        <Card className="transition-none">
            <CardBody className="gap-3 p-5">
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>{icon}</div>
                <div className="min-w-0">
                    <p className="text-2xl font-bold tracking-tight leading-none break-words">{value}</p>
                    <p className="mt-1.5 text-sm text-default-500 leading-snug">{label}</p>
                    {trend && (
                        <span className={`mt-1 flex items-center gap-1 text-xs leading-tight ${trendUp === true ? "text-success" : trendUp === false ? "text-danger" : "text-default-400"}`}>
                            {trendUp === true && <ArrowUpRight className="h-3 w-3 flex-shrink-0" />}
                            {trendUp === false && <ArrowDownRight className="h-3 w-3 flex-shrink-0" />}
                            <span className="min-w-0">{trend}</span>
                        </span>
                    )}
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
