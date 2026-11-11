"use client";

import {
    Button, Spinner, Input, DateRangePicker, Tooltip,
    TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { camelize } from "@/lib/supabase-helpers";
import { formatTimeAr, formatDateAr } from "@/lib/datetime";
import { todayAr, addYearsToDate } from "@/lib/ads";
import { bookingRangeSchema, BOOKING_RANGE_YEARS } from "@/lib/validations/booking.schema";
import { ADMIN_BOOKING_STATES, getAdminBookingState, type AdminBookingState } from "@/lib/booking-status";
import { checkCancel } from "@/lib/booking-permissions";
import { useAuthStore } from "@/stores/auth-store";
import { useAdminBookingsRealtime } from "@/hooks/use-admin-bookings-realtime";
import { DataTable } from "@/components/shared/data-table";
import { FilterChip } from "@/components/shared/filter-chip";
import { StatusChip } from "@/components/shared/status-chip";
import { CancelBookingModal, type CancelBookingTarget } from "@/components/shared/cancel-booking-modal";
import { XCircle, Plus, Search, Repeat, Eye, Lock } from "lucide-react";
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
    // Rango APLICADO al filtro: solo cambia cuando lo escrito es un rango válido completo
    const [customRange, setCustomRange] = useState<{ start: CalendarDate; end: CalendarDate } | null>(null);
    // Lo que está en el selector, incluso a medio escribir o fuera de límites
    const [draftRange, setDraftRange] = useState<{ start: CalendarDate; end: CalendarDate } | null>(null);
    const [rangeError, setRangeError] = useState<string | null>(null);

    // Límites (iguales en el selector, en Zod y en la RPC): 2 años atrás y 2 adelante, en hora AR
    const today = todayAr();
    const minDay = addYearsToDate(today, -BOOKING_RANGE_YEARS);
    const maxDay = addYearsToDate(today, BOOKING_RANGE_YEARS);
    const minDate = useMemo(() => parseDate(minDay), [minDay]);
    const maxDate = useMemo(() => parseDate(maxDay), [maxDay]);
    const rangeSchema = useMemo(() => bookingRangeSchema(minDay, maxDay), [minDay, maxDay]);

    /** Elegir un atajo (Hoy, Mañana...) descarta lo escrito en el selector. */
    const choosePreset = (key: Exclude<DatePreset, "CUSTOM">) => {
        setDatePreset(key);
        setCustomRange(null);
        setDraftRange(null);
        setRangeError(null);
    };

    const onRangeChange = (v: { start: CalendarDate; end: CalendarDate } | null) => {
        // Vaciar el selector = volver a "Todas las fechas"
        if (!v?.start || !v?.end) {
            choosePreset("ALL");
            return;
        }
        setDraftRange(v);
        const parsed = rangeSchema.safeParse({ from: v.start.toString(), to: v.end.toString() });
        if (!parsed.success) {
            // No se aplica: la tabla sigue mostrando el último filtro válido
            setRangeError(parsed.error.issues[0]?.message ?? "Rango inválido");
            return;
        }
        setRangeError(null);
        setCustomRange(v);
        setDatePreset("CUSTOM");
    };

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
                    <p className="text-sm text-default-500 mt-1">Gestiona y cancela las reservas</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => router.push("/dashboard/bookings/nueva")}>
                    Reserva Manual
                </Button>
            </div>

            {/* Filtros */}
            <div className="space-y-3">
                <Input
                    aria-label="Buscar reservas"
                    placeholder={isAdmin
                        ? "Buscar por cliente, DNI, teléfono, email, cancha o complejo..."
                        : "Buscar por cliente, email o cancha..."}
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
                        <FilterChip
                            key={p.key}
                            label={p.label}
                            selected={datePreset === p.key}
                            onSelect={() => choosePreset(p.key)}
                        />
                    ))}
                    <DateRangePicker
                        aria-label="Rango de fechas personalizado"
                        size="sm"
                        variant="bordered"
                        className="w-full max-w-xs"
                        visibleMonths={2}
                        // Cast: HeroUI trae su propia copia de @internationalized/date (mismo
                        // runtime, tipos de otra versión). Igual que en DateTimeField.
                        minValue={minDate as any}
                        maxValue={maxDate as any}
                        value={draftRange as any}
                        onChange={(v) => onRangeChange(v as { start: CalendarDate; end: CalendarDate } | null)}
                        // Validación propia (Zod) con un único mensaje claro, en vez del genérico de HeroUI
                        validationBehavior="aria"
                        isInvalid={!!rangeError}
                        errorMessage={rangeError ?? undefined}
                    />
                    {datePreset === "CUSTOM" && customRange && (
                        <Button size="sm" variant="light" onPress={() => choosePreset("ALL")}>
                            Quitar rango
                        </Button>
                    )}
                    {isFetching && <Spinner size="sm" aria-label="Actualizando" />}
                </div>

                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                    {STATE_FILTERS.map((key) => {
                        const active = stateFilter === key;
                        const color = key === "ALL" ? "primary" : ADMIN_BOOKING_STATES[key].color;
                        const label = key === "ALL" ? "Todas" : ADMIN_BOOKING_STATES[key].plural;
                        return (
                            <FilterChip
                                key={key}
                                label={label}
                                count={counts[key]}
                                selected={active}
                                color={color}
                                onSelect={() => setStateFilter(key)}
                            />
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
                                        {isOwn && <StatusChip>Tu reserva</StatusChip>}
                                    </div>
                                    {/* Admin de sede: email del cliente (lo necesita para ubicarlo). DNI y teléfono: solo el admin general */}
                                    {!isAdmin && booking.user?.email && (
                                        <p className="text-xs text-default-400">{booking.user.email}</p>
                                    )}
                                    {isAdmin && (booking.user?.phone || booking.user?.dni) && (
                                        <p className="text-xs text-default-400">
                                            {booking.user?.phone ?? ""}{booking.user?.phone && booking.user?.dni ? " · " : ""}
                                            {booking.user?.dni ? `DNI ${booking.user.dni}` : ""}
                                        </p>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <StatusChip color={meta.color}>{meta.label}</StatusChip>
                                        {booking.recurringBookingId && (
                                            <StatusChip color="secondary" startContent={<Repeat className="h-3 w-3" />}>
                                                Fijo
                                            </StatusChip>
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
        </div>
    );
}
