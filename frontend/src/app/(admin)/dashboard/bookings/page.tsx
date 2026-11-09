"use client";

import {
    Button, Chip, Spinner, Input, DateRangePicker, Tooltip,
    TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { camelize } from "@/lib/supabase-helpers";
import { formatTimeAr, formatDateAr } from "@/lib/datetime";
import { todayAr } from "@/lib/ads";
import { ADMIN_BOOKING_STATES, getAdminBookingState, type AdminBookingState } from "@/lib/booking-status";
import { checkCancel, canMarkPaid } from "@/lib/booking-permissions";
import { useAuthStore } from "@/stores/auth-store";
import { useAdminBookingsRealtime } from "@/hooks/use-admin-bookings-realtime";
import { DataTable } from "@/components/shared/data-table";
import { CancelBookingModal, type CancelBookingTarget } from "@/components/shared/cancel-booking-modal";
import { MarkPaidModal, type MarkPaidTarget } from "@/components/shared/mark-paid-modal";
import { XCircle, Plus, Search, Repeat, Eye, BadgeDollarSign, Lock } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Booking } from "@/types";

/** Reserva del panel tal como la devuelve la RPC admin_list_bookings (ya camelizada). */
type AdminBooking = Omit<Booking, "user" | "totalPrice" | "commissionAmount"> & {
    /** Estado de negocio calculado en la base contra now(). */
    bizState: AdminBookingState;
    /** Solo llegan para el ADMIN general. */
    totalPrice: number | null;
    commissionAmount: number | null;
    user: { id: string; firstName: string; lastName: string; dni?: string | null; phone?: string | null; email?: string | null } | null;
};

type StateFilter = "ALL" | AdminBookingState;
const STATE_FILTERS: StateFilter[] = ["ALL", "REALIZADA", "PENDIENTE_PAGO", "COMPLETADA", "CANCELADA"];

interface AdminBookingsResult {
    items: AdminBooking[];
    total: number;
    counts: Record<StateFilter, number>;
}

const PER_PAGE = 12;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_COUNTS: Record<StateFilter, number> = { ALL: 0, REALIZADA: 0, PENDIENTE_PAGO: 0, COMPLETADA: 0, CANCELADA: 0 };

type DatePreset = "ALL" | "TODAY" | "TOMORROW" | "NEXT7" | "CUSTOM";
const DATE_PRESETS: { key: Exclude<DatePreset, "CUSTOM">; label: string }[] = [
    { key: "ALL", label: "Todas las fechas" },
    { key: "TODAY", label: "Hoy" },
    { key: "TOMORROW", label: "Mañana" },
    { key: "NEXT7", label: "Próximos 7 días" },
];

// ---------- Fechas en hora de Argentina (UTC-3) ----------

/** Suma días a un "YYYY-MM-DD" (aritmética de calendario, sin zona). */
function addDays(date: string, days: number): string {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Rango [desde, hasta) en días AR. La actividad se agrupa por el día de INICIO del turno. */
function resolveRange(preset: DatePreset, custom: { start: CalendarDate; end: CalendarDate } | null): { from: string; to: string } | null {
    const today = todayAr();
    switch (preset) {
        case "TODAY": return { from: today, to: addDays(today, 1) };
        case "TOMORROW": return { from: addDays(today, 1), to: addDays(today, 2) };
        case "NEXT7": return { from: today, to: addDays(today, 7) };
        case "CUSTOM": return custom ? { from: custom.start.toString(), to: addDays(custom.end.toString(), 1) } : null;
        default: return null;
    }
}

const formatDate = (d: string) => formatDateAr(d, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const formatMoney = (v: number | null | undefined) => Math.round(Number(v ?? 0)).toLocaleString("en-US");

export default function AdminBookingsPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const isAdmin = user?.role === "ADMIN";

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [stateFilter, setStateFilter] = useState<StateFilter>("ALL");
    const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
    const [customRange, setCustomRange] = useState<{ start: CalendarDate; end: CalendarDate } | null>(null);

    // Límites del selector: historial y agenda razonables (sin años absurdos)
    const today = todayAr();
    const minDate = useMemo(() => parseDate(addDays(today, -730)), [today]);
    const maxDate = useMemo(() => parseDate(addDays(today, 730)), [today]);

    const range = resolveRange(datePreset, customRange);

    // La búsqueda se manda a la base recién cuando el usuario deja de tipear
    const [debouncedSearch, setDebouncedSearch] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [search]);

    // Volver a la página 1 cuando cambia cualquier filtro
    useEffect(() => { setPage(1); }, [debouncedSearch, stateFilter, datePreset, customRange]);

    // Todo se resuelve en la base (RPC admin_list_bookings, migración 021):
    // rango, estado de negocio, búsqueda, contadores, orden y paginación.
    // El alcance (admin de sede -> su complejo) también lo aplica la RPC.
    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ["bookings", "admin", range?.from ?? "", range?.to ?? "", stateFilter, debouncedSearch, page],
        queryFn: async (): Promise<AdminBookingsResult> => {
            const { data, error } = await (supabase.rpc as any)("admin_list_bookings", {
                p_from: range?.from ?? null,
                p_to: range?.to ?? null,
                p_state: stateFilter,
                p_search: debouncedSearch || null,
                p_page: page,
                p_per_page: PER_PAGE,
            });
            if (error) throw new Error(error.message);
            const res = camelize((data ?? {}) as Record<string, unknown>) as unknown as Partial<AdminBookingsResult>;
            return {
                items: res.items ?? [],
                total: Number(res.total ?? 0),
                counts: { ...EMPTY_COUNTS, ...(res.counts ?? {}) },
            };
        },
        placeholderData: (prev) => prev, // no parpadear al cambiar de filtro o de página
        enabled: !!user,
    });

    // Se refresca sola cuando una reserva de su alcance se crea, se paga o se cancela
    useAdminBookingsRealtime(!!user);

    const pageItems = data?.items ?? [];
    const counts = data?.counts ?? EMPTY_COUNTS;
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    // Si un cambio (ej. una cancelación) deja la página actual vacía, retroceder
    useEffect(() => {
        if (data && page > totalPages) setPage(totalPages);
    }, [data, page, totalPages]);

    const [toCancel, setToCancel] = useState<CancelBookingTarget | null>(null);
    const [toPay, setToPay] = useState<MarkPaidTarget | null>(null);

    const actor = user ? { id: user.id, role: user.role, venueId: user.venueId } : null;
    const clientName = (b: AdminBooking) => (b.user ? `${b.user.firstName} ${b.user.lastName}` : "Cliente");
    // El complejo ve su ganancia (base); el admin general, el total cobrado
    const amountOf = (b: AdminBooking) => (isAdmin ? b.totalPrice : b.basePrice);

    if (!data && (isLoading || !user)) {
        return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Gestión de Reservas</h1>
                    <p className="text-sm text-default-500 mt-1">Gestiona, cobra y cancela las reservas</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => router.push("/dashboard/bookings/nueva")}>
                    Reserva Manual
                </Button>
            </div>

            {/* Filtros */}
            <div className="space-y-3">
                <Input
                    aria-label="Buscar reservas"
                    placeholder="Buscar por cliente, DNI, teléfono, email, cancha o complejo..."
                    variant="bordered"
                    size="sm"
                    value={search}
                    onValueChange={setSearch}
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    isClearable
                    onClear={() => setSearch("")}
                    className="max-w-xl"
                />

                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por fecha">
                    {DATE_PRESETS.map((p) => (
                        <Chip
                            key={p.key}
                            color={datePreset === p.key ? "primary" : "default"}
                            variant={datePreset === p.key ? "solid" : "bordered"}
                            className="cursor-pointer"
                            onClick={() => { setDatePreset(p.key); setCustomRange(null); }}
                        >
                            {p.label}
                        </Chip>
                    ))}
                    <DateRangePicker
                        aria-label="Rango de fechas personalizado"
                        size="sm"
                        variant="bordered"
                        className="max-w-xs"
                        visibleMonths={2}
                        // Cast: HeroUI trae su propia copia de @internationalized/date (mismo
                        // runtime, tipos de otra versión). Igual que en DateTimeField.
                        minValue={minDate as any}
                        maxValue={maxDate as any}
                        value={(datePreset === "CUSTOM" ? customRange : null) as any}
                        onChange={(v) => {
                            if (v?.start && v?.end) {
                                setCustomRange({ start: v.start as CalendarDate, end: v.end as CalendarDate });
                                setDatePreset("CUSTOM");
                            } else {
                                setCustomRange(null);
                                setDatePreset("ALL");
                            }
                        }}
                    />
                    {isFetching && <Spinner size="sm" aria-label="Actualizando" />}
                </div>

                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                    {STATE_FILTERS.map((key) => {
                        const active = stateFilter === key;
                        const color = key === "ALL" ? "primary" : ADMIN_BOOKING_STATES[key].color;
                        const label = key === "ALL" ? "Todas" : ADMIN_BOOKING_STATES[key].plural;
                        return (
                            <Chip
                                key={key}
                                color={active ? color : "default"}
                                variant={active ? "solid" : "bordered"}
                                className="cursor-pointer"
                                onClick={() => setStateFilter(key)}
                            >
                                {label} ({counts[key]})
                            </Chip>
                        );
                    })}
                </div>

                {error && (
                    <p role="alert" className="text-sm text-danger">
                        No se pudieron cargar las reservas: {(error as Error).message}
                    </p>
                )}
            </div>

            {/* Tabla */}
            <DataTable aria-label="Reservas">
                <TableHeader>
                    <TableColumn key="fecha">FECHA</TableColumn>
                    <TableColumn key="cancha">CANCHA</TableColumn>
                    <TableColumn key="cliente">CLIENTE</TableColumn>
                    <TableColumn key="estado">ESTADO</TableColumn>
                    <TableColumn key="monto" align="end">{isAdmin ? "TOTAL" : "GANANCIA"}</TableColumn>
                    <TableColumn key="acciones" align="end">ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay reservas para estos filtros">
                    {pageItems.map((booking) => {
                        // Estado que calculó la base; si faltara, la misma regla en el cliente
                        const meta = ADMIN_BOOKING_STATES[booking.bizState ?? getAdminBookingState(booking)];
                        const cancel = actor ? checkCancel(actor, booking) : { allowed: false as const, reason: "" };
                        const payable = actor ? canMarkPaid(actor, booking) : false;
                        const isOwn = booking.userId === user?.id;
                        const showBlocked = !cancel.allowed && booking.status === "CONFIRMED"
                            && new Date(booking.startDatetime).getTime() > Date.now();
                        const name = clientName(booking);
                        const facilityName = booking.facility?.name ?? "Cancha";
                        return (
                            <TableRow key={booking.id}>
                                <TableCell>
                                    <p className="capitalize">{formatDate(booking.startDatetime)}</p>
                                    <p className="text-xs text-default-400">
                                        {formatTimeAr(booking.startDatetime)} — {formatTimeAr(booking.endDatetime)}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    <p className="font-medium">{facilityName}</p>
                                    <p className="text-xs text-default-400">{booking.facility?.venue?.name ?? ""}</p>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <span>{name}</span>
                                        {isOwn && <Chip size="sm" variant="flat">Tu reserva</Chip>}
                                    </div>
                                    {(booking.user?.phone || booking.user?.dni) && (
                                        <p className="text-xs text-default-400">
                                            {booking.user?.phone ?? ""}{booking.user?.phone && booking.user?.dni ? " · " : ""}
                                            {booking.user?.dni ? `DNI ${booking.user.dni}` : ""}
                                        </p>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap items-center gap-1">
                                        <Chip color={meta.color} size="sm" variant="flat">{meta.label}</Chip>
                                        {booking.recurringBookingId && (
                                            <Chip size="sm" variant="flat" color="secondary" startContent={<Repeat className="h-3 w-3" />}>
                                                Fijo
                                            </Chip>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="font-semibold">${formatMoney(amountOf(booking))}</span>
                                    {isAdmin && (
                                        <p className="text-xs text-default-400">comisión ${formatMoney(booking.commissionAmount)}</p>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                        <Tooltip content="Ver detalle">
                                            <Button
                                                as={Link}
                                                href={`/dashboard/bookings/${booking.id}`}
                                                size="sm"
                                                variant="light"
                                                isIconOnly
                                                aria-label={`Ver detalle de la reserva de ${name}`}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </Tooltip>
                                        {payable && (
                                            <Tooltip content="Marcar como pagada">
                                                <Button
                                                    size="sm"
                                                    color="success"
                                                    variant="light"
                                                    isIconOnly
                                                    aria-label={`Marcar como pagada la reserva de ${name}`}
                                                    onPress={() => setToPay({
                                                        id: booking.id, startDatetime: booking.startDatetime, clientName: name, facilityName,
                                                        amountLabel: `$${formatMoney(amountOf(booking))} ${booking.currency ?? "ARS"}`,
                                                    })}
                                                >
                                                    <BadgeDollarSign className="h-4 w-4" />
                                                </Button>
                                            </Tooltip>
                                        )}
                                        {cancel.allowed && (
                                            <Tooltip content="Cancelar reserva">
                                                <Button
                                                    size="sm"
                                                    color="danger"
                                                    variant="light"
                                                    isIconOnly
                                                    aria-label={`Cancelar la reserva de ${name}`}
                                                    onPress={() => setToCancel({ id: booking.id, startDatetime: booking.startDatetime, clientName: name, facilityName })}
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </Tooltip>
                                        )}
                                        {showBlocked && (
                                            <Tooltip content={cancel.reason}>
                                                <span className="inline-flex h-8 w-8 items-center justify-center text-default-300" aria-label={cancel.reason} role="img">
                                                    <Lock className="h-4 w-4" />
                                                </span>
                                            </Tooltip>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </DataTable>

            {/* Paginación */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-sm text-default-500">Página {page} de {totalPages} ({total} reservas)</p>
                    <div className="flex gap-2">
                        <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => setPage((p) => p - 1)}>Anterior</Button>
                        <Button size="sm" variant="flat" isDisabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>Siguiente</Button>
                    </div>
                </div>
            )}

            <CancelBookingModal booking={toCancel} onClose={() => setToCancel(null)} />
            <MarkPaidModal booking={toPay} onClose={() => setToPay(null)} />
        </div>
    );
}
