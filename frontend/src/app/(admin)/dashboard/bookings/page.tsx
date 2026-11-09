"use client";

import {
    Button, Chip, Spinner, Card, CardBody, Input, Textarea, DateRangePicker,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCancelBooking } from "@/hooks/use-bookings";
import { supabase } from "@/lib/supabase";
import { camelize } from "@/lib/supabase-helpers";
import { formatTimeAr, formatDateAr } from "@/lib/datetime";
import { todayAr } from "@/lib/ads";
import { ADMIN_BOOKING_STATES, getAdminBookingState, type AdminBookingState } from "@/lib/booking-status";
import { checkCancel } from "@/lib/booking-permissions";
import { cancelBookingSchema, CANCEL_REASON_MAX } from "@/lib/validations/booking.schema";
import { useAuthStore } from "@/stores/auth-store";
import { XCircle, Plus, Calendar, Clock, MapPin, User, DollarSign, Search, AlertTriangle, Repeat } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToastStore } from "@/stores/toast-store";
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

interface AdminBookingsResult {
    items: AdminBooking[];
    total: number;
    counts: Record<StateFilter, number>;
}

const PER_PAGE = 12;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_COUNTS: Record<StateFilter, number> = { ALL: 0, REALIZADA: 0, PENDIENTE_PAGO: 0, COMPLETADA: 0, CANCELADA: 0 };

type StateFilter = "ALL" | AdminBookingState;
const STATE_FILTERS: StateFilter[] = ["ALL", "REALIZADA", "PENDIENTE_PAGO", "COMPLETADA", "CANCELADA"];

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
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
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

    const pageItems = data?.items ?? [];
    const counts = data?.counts ?? EMPTY_COUNTS;
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    // Si un cambio (ej. una cancelación) deja la página actual vacía, retroceder
    useEffect(() => {
        if (data && page > totalPages) setPage(totalPages);
    }, [data, page, totalPages]);

    // ---------- Cancelación ----------
    const cancelBooking = useCancelBooking();
    const [bookingToCancel, setBookingToCancel] = useState<AdminBooking | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelError, setCancelError] = useState<string | null>(null);

    const openCancel = (b: AdminBooking) => { setBookingToCancel(b); setCancelReason(""); setCancelError(null); };
    const closeCancel = () => { if (!cancelBooking.isPending) setBookingToCancel(null); };

    const handleConfirmCancel = () => {
        if (!bookingToCancel) return;
        const parsed = cancelBookingSchema.safeParse({ reason: cancelReason });
        if (!parsed.success) {
            setCancelError(parsed.error.issues[0]?.message ?? "Motivo inválido");
            return;
        }
        cancelBooking.mutate(
            { id: bookingToCancel.id, reason: parsed.data.reason || undefined },
            {
                onSuccess: () => {
                    addToast("Reserva cancelada");
                    queryClient.invalidateQueries({ queryKey: ["bookings"] });
                    setBookingToCancel(null);
                },
                onError: (error: Error) => {
                    // El backend es quien autoriza: mostrar su motivo (ej. regla de 24 h)
                    setCancelError(error.message || "No se pudo cancelar la reserva");
                },
            },
        );
    };

    const actor = user ? { id: user.id, role: user.role, venueId: user.venueId } : null;
    const clientName = (b: AdminBooking) => (b.user ? `${b.user.firstName} ${b.user.lastName}` : "Cliente");

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

            {/* Tarjetas */}
            {pageItems.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {pageItems.map((booking) => {
                        // Estado que calculó la base; si faltara, la misma regla en el cliente
                        const meta = ADMIN_BOOKING_STATES[booking.bizState ?? getAdminBookingState(booking)];
                        const cancel = actor ? checkCancel(actor, booking) : { allowed: false as const, reason: "" };
                        const isOwn = booking.userId === user?.id;
                        // Mostrar el motivo solo cuando la reserva sigue activa y futura (si no, no aporta)
                        const showBlockedHint = !cancel.allowed && booking.status === "CONFIRMED"
                            && new Date(booking.startDatetime).getTime() > Date.now();
                        return (
                            <Card key={booking.id} shadow="none" className="border border-divider">
                                <CardBody className="p-4 gap-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold truncate">{booking.facility?.name ?? "Cancha"}</h3>
                                            <p className="text-xs text-default-400 flex items-center gap-1 mt-0.5">
                                                <MapPin className="h-3 w-3" />
                                                {booking.facility?.venue?.name ?? ""}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <Chip color={meta.color} size="sm" variant="flat">{meta.label}</Chip>
                                            {booking.recurringBookingId && (
                                                <Chip size="sm" variant="flat" color="secondary" startContent={<Repeat className="h-3 w-3" />}>
                                                    Turno fijo
                                                </Chip>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex items-center gap-2 text-default-600">
                                            <User className="h-3.5 w-3.5 text-default-400" />
                                            <span className="truncate">{clientName(booking)}</span>
                                            {isOwn && <Chip size="sm" variant="flat">Tu reserva</Chip>}
                                        </div>
                                        <div className="flex items-center gap-2 text-default-600">
                                            <Calendar className="h-3.5 w-3.5 text-default-400" />
                                            <span className="capitalize">{formatDate(booking.startDatetime)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-default-600">
                                            <Clock className="h-3.5 w-3.5 text-default-400" />
                                            <span>{formatTimeAr(booking.startDatetime)} — {formatTimeAr(booking.endDatetime)}</span>
                                        </div>
                                        {/* Dinero: el complejo ve su ganancia (base); la comisión solo el admin general */}
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <DollarSign className="h-3.5 w-3.5 text-success" />
                                            {isAdmin ? (
                                                <>
                                                    <span className="font-semibold text-success">{formatMoney(booking.totalPrice)} ARS</span>
                                                    <span className="text-xs text-default-400">comisión {formatMoney(booking.commissionAmount)}</span>
                                                </>
                                            ) : (
                                                <span className="font-semibold text-success">{formatMoney(booking.basePrice)} ARS</span>
                                            )}
                                        </div>
                                    </div>

                                    {cancel.allowed && (
                                        <div className="flex gap-2 pt-2 border-t border-divider mt-1">
                                            <Button
                                                size="sm"
                                                color="danger"
                                                variant="flat"
                                                className="w-full"
                                                startContent={<XCircle className="h-3.5 w-3.5" />}
                                                onPress={() => openCancel(booking)}
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    )}
                                    {showBlockedHint && (
                                        <p className="flex items-center gap-1.5 border-t border-divider pt-2 mt-1 text-xs text-default-400">
                                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                            {cancel.reason}
                                        </p>
                                    )}
                                </CardBody>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="py-12 text-center">
                    <Calendar className="mx-auto h-12 w-12 text-default-200" />
                        <p className="mt-4 text-default-500">No hay reservas para estos filtros</p>
                </div>
            )}

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

            {/* Cancelación con motivo */}
            <Modal isOpen={!!bookingToCancel} onClose={closeCancel} size="md">
                <ModalContent>
                    <ModalHeader className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-warning" />
                        Cancelar reserva
                    </ModalHeader>
                    <ModalBody className="gap-3">
                        {bookingToCancel && (
                            <p className="text-sm text-default-600">
                                ¿Seguro que deseas cancelar la reserva de <strong>{clientName(bookingToCancel)}</strong> en{" "}
                                <strong>{bookingToCancel.facility?.name}</strong> del{" "}
                                {formatDate(bookingToCancel.startDatetime)} a las {formatTimeAr(bookingToCancel.startDatetime)}?
                                Esta acción no se puede deshacer.
                            </p>
                        )}
                        <Textarea
                            label="Motivo (opcional)"
                            placeholder="Ej: mantenimiento de la cancha"
                            variant="bordered"
                            value={cancelReason}
                            onValueChange={(v) => { setCancelReason(v); setCancelError(null); }}
                            maxLength={CANCEL_REASON_MAX}
                            description={`${cancelReason.length}/${CANCEL_REASON_MAX}`}
                            minRows={2}
                        />
                        {cancelError && (
                            <p role="alert" className="text-sm text-danger">{cancelError}</p>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={closeCancel} isDisabled={cancelBooking.isPending}>Volver</Button>
                        <Button color="danger" onPress={handleConfirmCancel} isLoading={cancelBooking.isPending}>
                            Sí, cancelar reserva
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
