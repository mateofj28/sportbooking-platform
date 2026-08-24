"use client";

import { Card, CardBody, CardHeader, Chip, Spinner, Divider, Progress } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
    Calendar, MapPin, TrendingUp, Clock, Activity, ArrowUpRight, ArrowDownRight, Users, Filter,
} from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import { BookingStatusDonut, BookingsByDayBar, RevenueAreaChart, SportRevenueBar } from "@/components/charts/dashboard-charts";
import type { Booking, Facility, Sport, User, PaginatedResult } from "@/types";

type DateRange = "today" | "week" | "month" | "quarter" | "all";
type StatusFilter = "ALL" | "CONFIRMED" | "COMPLETED" | "PENDING";

const DATE_OPTIONS: { key: DateRange; label: string }[] = [
    { key: "today", label: "Hoy" },
    { key: "week", label: "Última semana" },
    { key: "month", label: "Último mes" },
    { key: "quarter", label: "Último trimestre" },
    { key: "all", label: "Todo" },
];

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "Todos los estados" },
    { key: "CONFIRMED", label: "Confirmadas" },
    { key: "COMPLETED", label: "Completadas" },
    { key: "PENDING", label: "Pendientes" },
];

function getDateStart(range: DateRange): Date | null {
    const now = new Date();
    switch (range) {
        case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case "week": { const d = new Date(now); d.setDate(now.getDate() - 7); return d; }
        case "month": { const d = new Date(now); d.setMonth(now.getMonth() - 1); return d; }
        case "quarter": { const d = new Date(now); d.setMonth(now.getMonth() - 3); return d; }
        case "all": return null;
    }
}

export default function StatisticsPage() {
    const [dateRange, setDateRange] = useState<DateRange>("month");
    const [sportFilter, setSportFilter] = useState("");
    const [venueFilter, setVenueFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

    const { data: bookingsResponse, isLoading } = useQuery({
        queryKey: ["stats-bookings"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: any }>("/bookings?limit=500"),
    });
    const allBookings = bookingsResponse?.data || [];

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

    // Get unique venues from facilities
    const venues = useMemo(() => {
        if (!facilities) return [];
        const map = new Map<string, { id: string; name: string }>();
        facilities.forEach((f) => {
            if (!map.has(f.venue.id)) map.set(f.venue.id, { id: f.venue.id, name: f.venue.name });
        });
        return Array.from(map.values());
    }, [facilities]);

    // Apply all filters
    const filteredBookings = useMemo(() => {
        let result = allBookings;

      // Date filter
      const dateStart = getDateStart(dateRange);
      if (dateStart) {
          result = result.filter((b) => new Date(b.startDatetime) >= dateStart);
      }

      // Sport filter
      if (sportFilter) {
          result = result.filter((b) => b.facility?.sport?.id === sportFilter);
      }

      // Venue filter
      if (venueFilter) {
          result = result.filter((b) => b.facility?.venue?.id === venueFilter);
      }

      // Status filter
      if (statusFilter !== "ALL") {
          result = result.filter((b) => b.status === statusFilter);
      }

      return result;
  }, [allBookings, dateRange, sportFilter, venueFilter, statusFilter]);

    // Computed stats from filtered data
    const pendingBookings = filteredBookings.filter((b) => b.status === "PENDING");
    const confirmedBookings = filteredBookings.filter((b) => b.status === "CONFIRMED");
    const cancelledBookings = filteredBookings.filter((b) => b.status === "CANCELLED");
    const completedBookings = filteredBookings.filter((b) => b.status === "COMPLETED");
    const totalRevenue = filteredBookings
        .filter((b) => b.status !== "CANCELLED")
        .reduce((sum, b) => sum + Number(b.totalPrice), 0);

    const totalActive = filteredBookings.length - cancelledBookings.length;
    const occupancyRate = totalActive > 0 ? Math.round((confirmedBookings.length / totalActive) * 100) : 0;

    const now = new Date();

    if (isLoading) {
        return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
    }

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
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Select
                          label="Período"
                          size="sm"
                          variant="bordered"
                          selectedKeys={[dateRange]}
                          onSelectionChange={(keys: any) => setDateRange(Array.from(keys)[0] as DateRange || "month")}
                      >
                          {DATE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.key}>{opt.label}</SelectItem>
                          ))}
                      </Select>
                      <Select
                          label="Deporte"
                          size="sm"
                          variant="bordered"
                          selectedKeys={sportFilter ? [sportFilter] : []}
                          onSelectionChange={(keys: any) => setSportFilter(Array.from(keys)[0] as string || "")}
                      >
                          {(sports || []).map((s) => (
                              <SelectItem key={s.id}>{s.name}</SelectItem>
                          ))}
                      </Select>
                      <Select
                          label="Sede"
                          size="sm"
                          variant="bordered"
                          selectedKeys={venueFilter ? [venueFilter] : []}
                          onSelectionChange={(keys: any) => setVenueFilter(Array.from(keys)[0] as string || "")}
                      >
                          {venues.map((v) => (
                              <SelectItem key={v.id}>{v.name}</SelectItem>
                          ))}
                      </Select>
                      <Select
                          label="Estado"
                          size="sm"
                          variant="bordered"
                          selectedKeys={[statusFilter]}
                          onSelectionChange={(keys: any) => setStatusFilter(Array.from(keys)[0] as StatusFilter || "ALL")}
                      >
                          {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.key}>{opt.label}</SelectItem>
                          ))}
                      </Select>
                  </div>
                  {(sportFilter || venueFilter || statusFilter !== "ALL" || dateRange !== "all") && (
                      <div className="mt-3 flex items-center gap-2">
                          <span className="text-xs text-default-400">Mostrando {filteredBookings.length} de {allBookings.length} reservas</span>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Ingresos" value={`$${totalRevenue.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`} color="bg-success-50 text-success-600" />
              <StatCard icon={<Calendar className="h-5 w-5" />} label="Reservas" value={filteredBookings.length} color="bg-primary-50 text-primary-600" trend={`${pendingBookings.length} pendientes`} />
              <StatCard icon={<Activity className="h-5 w-5" />} label="Confirmación" value={`${occupancyRate}%`} color="bg-secondary-50 text-secondary-600" trend={`${cancelledBookings.length} canceladas`} trendUp={false} />
              <StatCard icon={<MapPin className="h-5 w-5" />} label="Instalaciones" value={facilities?.filter((f) => f.isActive).length || 0} color="bg-warning-50 text-warning-600" trend={`${sports?.length || 0} deportes`} />
          </div>

          {/* Charts */}
          <div className="grid gap-6 md:grid-cols-2">
              <BookingStatusDonut bookings={filteredBookings} />
              <BookingsByDayBar bookings={filteredBookings} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
              <RevenueAreaChart bookings={filteredBookings} />
              <SportRevenueBar bookings={filteredBookings} />
          </div>

          {/* Detailed Breakdown */}
          <div className="grid gap-6 lg:grid-cols-3">
              {/* Bookings by Sport */}
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
                          const bySport = filteredBookings.reduce((acc, b) => {
                              const name = b.facility?.sport?.name || "Otro";
                              acc[name] = (acc[name] || 0) + 1;
                              return acc;
                          }, {} as Record<string, number>);
                          const entries = Object.entries(bySport).sort((a, b) => b[1] - a[1]);
                          return entries.length > 0 ? entries.map(([sport, count]) => (
                              <div key={sport} className="space-y-1">
                                  <div className="flex justify-between text-sm">
                                      <span className="font-medium">{sport}</span>
                                      <span className="text-default-500">{count} ({Math.round((count / filteredBookings.length) * 100)}%)</span>
                                  </div>
                      <Progress value={(count / filteredBookings.length) * 100} color="primary" size="sm" />
                  </div>
              )) : <p className="text-sm text-default-400 text-center py-2">Sin datos</p>;
                      })()}
                  </CardBody>
              </Card>

              {/* Quick Stats */}
              <Card>
                  <CardHeader className="pb-2">
                      <div>
                          <h2 className="text-base font-semibold">Indicadores</h2>
                          <p className="text-xs text-default-400">Métricas clave</p>
                      </div>
                  </CardHeader>
                  <Divider />
                  <CardBody className="gap-4">
                      <QuickStat label="Precio promedio" value={totalActive > 0 ? `$${(totalRevenue / totalActive).toFixed(0)}` : "$0"} sub="por reserva" />
                      <QuickStat label="Completadas" value={completedBookings.length.toString()} sub="reservas finalizadas" />
                      <QuickStat label="Canceladas" value={cancelledBookings.length.toString()} sub="reservas canceladas" />
                      <QuickStat label="Total usuarios" value={(usersData?.meta?.total || usersData?.data?.length || 0).toString()} sub="registrados" />
                  </CardBody>
              </Card>

              {/* Last Users */}
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
