"use client";
import { toAppError } from '@/lib/error-messages'

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardBody, CardHeader, Divider, Spinner } from "@heroui/react";
import {
    ArrowLeft, MapPin, Calendar, Clock, User, Phone, Mail, IdCard, Repeat, XCircle,
    BadgeDollarSign, History, StickyNote, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { camelize } from "@/lib/supabase-helpers";
import { formatDateAr, formatTimeAr } from "@/lib/datetime";
import { ADMIN_BOOKING_STATES, getAdminBookingState } from "@/lib/booking-status";
import { checkCancel, canPay } from "@/lib/booking-permissions";
import { useAuthStore } from "@/stores/auth-store";
import { useAdminBookingsRealtime } from "@/hooks/use-admin-bookings-realtime";
import { CancelBookingModal, type CancelBookingTarget } from "@/components/shared/cancel-booking-modal";
import Link from "next/link";
import { StatusChip } from "@/components/shared/status-chip";
import type { BookingStatus, PaymentStatus } from "@/types";

const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

// Detalle completo con RLS: el admin de sede solo puede leer reservas de su complejo.
// Los perfiles que el RLS no deja ver (ej. quién canceló) llegan en null.
// Datos del cliente: el admin general ve todo (DNI, teléfono, email) desde profiles; el
// admin de sede ve nombre y email desde la vista profile_directory (migración 032), que no
// tiene DNI ni teléfono: no viajan en la respuesta.
const detailSelect = (isGeneralAdmin: boolean) => `
  *,
  facility:facilities!facility_id(
    id, name, image_url,
    venue:venues!venue_id(id, name, city, address),
    sport:sports!sport_id(id, name)
  ),
  ${isGeneralAdmin
        ? "user:profiles!user_id(id, first_name, last_name, dni, phone, email)"
        : "user:profile_directory!user_id(id, first_name, last_name, email)"},
  created_by_profile:profile_directory!created_by(id, first_name, last_name),
  cancelled_by_profile:profile_directory!cancelled_by(id, first_name, last_name),
  recurring:recurring_bookings!recurring_booking_id(id, day_of_week, start_time, end_time, start_date, end_date, is_active)
`;

type PersonRef = { id: string; firstName: string; lastName: string } | null;

interface AdminBookingDetail {
    id: string;
    userId: string;
    startDatetime: string;
    endDatetime: string;
    status: BookingStatus;
    paymentStatus: PaymentStatus;
    paidAt: string | null;
    totalPrice: number;
    basePrice: number;
    commissionAmount: number;
    currency: string;
    notes: string | null;
    createdAt: string;
    cancelledAt: string | null;
    cancellationReason: string | null;
    recurringBookingId: string | null;
    facility: {
        id: string; name: string; imageUrl: string | null;
        venue: { id: string; name: string; city: string; address: string } | null;
        sport: { id: string; name: string } | null;
    } | null;
    user: { id: string; firstName: string; lastName: string; dni: string | null; phone: string | null; email: string | null } | null;
    createdByProfile: PersonRef;
    cancelledByProfile: PersonRef;
    recurring: { id: string; dayOfWeek: number; startTime: string; endTime: string; startDate: string; endDate: string; isActive: boolean } | null;
}

const money = (v: number | null | undefined) => `$${Math.round(Number(v ?? 0)).toLocaleString("en-US")}`;
const fullName = (p: PersonRef | AdminBookingDetail["user"]) => (p ? `${p.firstName} ${p.lastName}`.trim() : null);
const dateTime = (iso: string) => `${formatDateAr(iso, { day: "2-digit", month: "short", year: "numeric" })} · ${formatTimeAr(iso)}`;

export default function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const queryClient = useQueryClient();
    const { user } = useAuthStore();
    const isAdmin = user?.role === "ADMIN";

    const [toCancel, setToCancel] = useState<CancelBookingTarget | null>(null);

    const { data: booking, isLoading, error } = useQuery({
        queryKey: ["booking", "admin", id, isAdmin],
        queryFn: async (): Promise<AdminBookingDetail | null> => {
            const { data, error } = await supabase.from("bookings").select(detailSelect(isAdmin)).eq("id", id).maybeSingle();
            if (error) throw toAppError(error);
            // El select se arma según el rol, así que supabase-js no puede inferir el tipo
            return data ? (camelize(data as unknown as Record<string, unknown>) as unknown as AdminBookingDetail) : null;
        },
        enabled: !!user,
    });

    // Se actualiza sola si otro admin la paga o la cancela (solo escucha esta reserva)
    useAdminBookingsRealtime(!!booking, id);

    const back = (
        <Button variant="light" size="sm" startContent={<ArrowLeft className="h-4 w-4" />} onPress={() => router.push("/dashboard/bookings")}>
            Volver a reservas
        </Button>
    );

    if (isLoading || !user) {
        return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
    }
    if (error || !booking) {
        return (
            <div className="space-y-4">
                {back}
                <p className="py-12 text-center text-default-500">
                    {error ? `No se pudo cargar la reserva: ${(error as Error).message}` : "Reserva no encontrada o sin acceso."}
                </p>
            </div>
        );
    }

    const state = ADMIN_BOOKING_STATES[getAdminBookingState(booking)];
    const actor = { id: user.id, role: user.role, venueId: user.venueId };
    const cancel = checkCancel(actor, booking);
    const isOwn = booking.userId === user.id;
    // Solo el titular paga (canPay): en el panel no se cobra la reserva de otra persona
    const ownPending = canPay(actor, booking.userId) && booking.status === "CONFIRMED" && booking.paymentStatus !== "PAID";
    const client = fullName(booking.user) ?? "Cliente";
    const facilityName = booking.facility?.name ?? "Cancha";
    const mins = Math.round((new Date(booking.endDatetime).getTime() - new Date(booking.startDatetime).getTime()) / 60000);
    const isFuture = new Date(booking.startDatetime).getTime() > Date.now();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["booking", "admin", id] });

    return (
        <div className="space-y-6">
            {back}

            {/* Encabezado */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold">{facilityName}</h1>
                    <p className="mt-1 flex items-center gap-1 text-sm text-default-500">
                        <MapPin className="h-3.5 w-3.5" />
                        {booking.facility?.venue?.name ?? ""}
                        {booking.facility?.venue?.city ? ` — ${booking.facility.venue.city}` : ""}
                        {booking.facility?.sport?.name ? ` · ${booking.facility.sport.name}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <StatusChip color={state.color}>{state.label}</StatusChip>
                        {booking.recurringBookingId && (
                            <StatusChip color="secondary" startContent={<Repeat className="h-3 w-3" />}>Turno fijo</StatusChip>
                        )}
                        {isOwn && <StatusChip>Tu reserva</StatusChip>}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {/* El pago lo hace solo el titular, desde su vista de cliente. Si la reserva
                        pendiente es del propio admin, se lo lleva ahí; si es de otra persona, no hay acción. */}
                    {ownPending && (
                        <Button
                            as={Link}
                            href={`/bookings/${booking.id}`}
                            color="success"
                            variant="flat"
                            startContent={<BadgeDollarSign className="h-4 w-4" />}
                        >
                            Pagar desde Mis Reservas
                        </Button>
                    )}
                    {cancel.allowed && (
                        <Button
                            color="danger"
                            variant="flat"
                            startContent={<XCircle className="h-4 w-4" />}
                            onPress={() => setToCancel({ id: booking.id, startDatetime: booking.startDatetime, clientName: client, facilityName })}
                        >
                            Cancelar
                        </Button>
                    )}
                </div>
            </div>

            {!cancel.allowed && booking.status === "CONFIRMED" && isFuture && (
                <p className="flex items-center gap-2 rounded-lg border border-divider px-3 py-2 text-sm text-default-500">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
                    {cancel.reason}
                </p>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="space-y-6">
                    {/* Turno */}
                    <Card shadow="none" className="border border-divider">
                        <CardHeader className="gap-2"><Calendar className="h-4 w-4 text-primary" /><h2 className="font-semibold">Turno</h2></CardHeader>
                        <Divider />
                        <CardBody className="gap-3 text-sm">
                            <Row icon={<Calendar className="h-4 w-4" />} label="Fecha">
                                <span className="capitalize">{formatDateAr(booking.startDatetime)}</span>
                            </Row>
                            <Row icon={<Clock className="h-4 w-4" />} label="Horario">
                                {formatTimeAr(booking.startDatetime)} — {formatTimeAr(booking.endDatetime)} · {mins} min
                            </Row>
                            {booking.recurring && (
                                <Row icon={<Repeat className="h-4 w-4" />} label="Turno fijo">
                                    Todos los {DAYS[booking.recurring.dayOfWeek] ?? ""} de {booking.recurring.startTime} a {booking.recurring.endTime}
                                    {" "}(hasta el {formatDateAr(booking.recurring.endDate, { day: "2-digit", month: "short", year: "numeric" })})
                                    {!booking.recurring.isActive && <span className="text-danger"> · serie cancelada</span>}
                                </Row>
                            )}
                        </CardBody>
                    </Card>

                    {/* Cliente */}
                    <Card shadow="none" className="border border-divider">
                        <CardHeader className="gap-2"><User className="h-4 w-4 text-primary" /><h2 className="font-semibold">Cliente</h2></CardHeader>
                        <Divider />
                        <CardBody className="gap-3 text-sm">
                            <Row icon={<User className="h-4 w-4" />} label="Nombre">{client}</Row>
                            {/* DNI y teléfono: solo el admin general. Email: ambos admins (032). */}
                            {isAdmin && booking.user?.dni && <Row icon={<IdCard className="h-4 w-4" />} label="DNI">{booking.user.dni}</Row>}
                            {isAdmin && booking.user?.phone && (
                                <Row icon={<Phone className="h-4 w-4" />} label="Teléfono">
                                    <a className="text-primary hover:underline" href={`tel:${booking.user.phone.replace(/[^\d+]/g, "")}`}>{booking.user.phone}</a>
                                </Row>
                            )}
                            {booking.user?.email && (
                                <Row icon={<Mail className="h-4 w-4" />} label="Email">
                                    <a className="text-primary hover:underline break-all" href={`mailto:${booking.user.email}`}>{booking.user.email}</a>
                                </Row>
                            )}
                        </CardBody>
                    </Card>

                    {booking.notes && (
                        <Card shadow="none" className="border border-divider">
                            <CardHeader className="gap-2"><StickyNote className="h-4 w-4 text-primary" /><h2 className="font-semibold">Notas</h2></CardHeader>
                            <Divider />
                            <CardBody className="text-sm text-default-700 whitespace-pre-wrap">{booking.notes}</CardBody>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Pago: el complejo ve su ganancia (base); la comisión solo el admin general */}
                    <Card shadow="none" className="border border-divider">
                        <CardHeader className="gap-2"><BadgeDollarSign className="h-4 w-4 text-primary" /><h2 className="font-semibold">Pago</h2></CardHeader>
                        <Divider />
                        <CardBody className="gap-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-default-500">Estado</span>
                                <StatusChip color={booking.paymentStatus === "PAID" ? "success" : "warning"}>
                                    {booking.paymentStatus === "PAID" ? "Pagada" : "Pendiente de pago"}
                                </StatusChip>
                            </div>
                            {booking.paidAt && (
                                <div className="flex items-center justify-between">
                                    <span className="text-default-500">Pagada el</span>
                                    <span>{dateTime(booking.paidAt)}</span>
                                </div>
                            )}
                            <Divider />
                            {isAdmin ? (
                                <>
                                    <Amount label="Ganancia del complejo" value={money(booking.basePrice)} />
                                    <Amount label="Comisión de la empresa" value={money(booking.commissionAmount)} />
                                    <Amount label="Total cobrado" value={`${money(booking.totalPrice)} ${booking.currency}`} strong />
                                </>
                            ) : (
                                <Amount label="Ganancia del complejo" value={`${money(booking.basePrice)} ${booking.currency}`} strong />
                            )}
                        </CardBody>
                    </Card>

                    {/* Historial */}
                    <Card shadow="none" className="border border-divider">
                        <CardHeader className="gap-2"><History className="h-4 w-4 text-primary" /><h2 className="font-semibold">Historial</h2></CardHeader>
                        <Divider />
                        <CardBody className="gap-3 text-sm">
                            <div>
                                <p className="text-default-500">Creada</p>
                                <p>{dateTime(booking.createdAt)}{fullName(booking.createdByProfile) ? ` por ${fullName(booking.createdByProfile)}` : ""}</p>
                            </div>
                            {booking.cancelledAt && (
                                <div>
                                    <p className="text-default-500">Cancelada</p>
                                    <p>
                                        {dateTime(booking.cancelledAt)}
                                        {fullName(booking.cancelledByProfile)
                                            ? ` por ${fullName(booking.cancelledByProfile)}`
                                            : booking.cancellationReason?.startsWith("Cancelada automáticamente") ? " (automática)" : ""}
                                    </p>
                                    {booking.cancellationReason && (
                                        <p className="mt-1 text-default-600">Motivo: {booking.cancellationReason}</p>
                                    )}
                                </div>
                            )}
                        </CardBody>
                    </Card>
                </div>
            </div>

            <CancelBookingModal booking={toCancel} onClose={() => setToCancel(null)} onCancelled={refresh} />
        </div>
    );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <span className="mt-0.5 text-default-400" aria-hidden>{icon}</span>
            <div className="min-w-0">
                <p className="text-xs text-default-400">{label}</p>
                <div className="text-default-700">{children}</div>
            </div>
        </div>
    );
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-default-500">{label}</span>
            <span className={strong ? "text-base font-semibold text-success" : ""}>{value}</span>
        </div>
    );
}
