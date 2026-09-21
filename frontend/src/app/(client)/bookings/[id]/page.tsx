"use client";

import { use } from "react";
import { Button, Card, CardBody, Chip, Divider, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useBooking, useMarkBookingPaid, useCancelBooking } from "@/hooks/use-bookings";
import { getBookingStatusChip } from "@/lib/booking-status";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ArrowLeft, MapPin, Calendar, Clock, User, Check, X, Repeat, ShieldCheck } from "lucide-react";

const SPORT_IMAGES: Record<string, string> = {
    futbol: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=1200&h=400&fit=crop",
    tenis: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&h=400&fit=crop",
    padel: "https://images.unsplash.com/photo-1612534847738-b3af3b9545f4?w=1200&h=400&fit=crop",
    basquetbol: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=400&fit=crop",
    voleibol: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=1200&h=400&fit=crop",
};
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1461896836934-bd900bb65104?w=1200&h=400&fit=crop";
function sportImage(name?: string) {
    const key = (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return SPORT_IMAGES[key] || DEFAULT_IMAGE;
}

function formatDateLong(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h < 12 ? "a. m." : "p. m.";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
function formatPrice(v: number): string {
    return Math.round(Number(v)).toLocaleString("en-US");
}
function durationMin(start: string, end: string): number {
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { data: booking, isLoading } = useBooking(id);
    const markPaid = useMarkBookingPaid();
    const cancelBooking = useCancelBooking();

    if (isLoading) {
        return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    }
    if (!booking) {
        return (
            <div className="flex min-h-screen flex-col">
                <Navbar />
                <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
                    <p className="text-center text-default-500">Reserva no encontrada</p>
                </main>
                <Footer />
            </div>
        );
    }

    const chip = getBookingStatusChip(booking);
    const isRecurring = !!booking.recurringBookingId;
    const isPast = new Date(booking.startDatetime) < new Date();
    const canPay = booking.status === "CONFIRMED" && booking.paymentStatus !== "PAID";
    const canCancel = booking.status === "CONFIRMED" && !isPast;
    const mins = durationMin(booking.startDatetime, booking.endDatetime);

    return (
        <div className="flex min-h-screen flex-col bg-default-50">
            <Navbar />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
                <Button variant="light" size="sm" startContent={<ArrowLeft className="h-4 w-4" />} onPress={() => router.back()} className="mb-4">
                    Volver
                </Button>

                {/* Hero */}
                <div className="relative overflow-hidden rounded-2xl">
                    <img src={sportImage(booking.facility.sport?.name)} alt={booking.facility.name} className="h-48 w-full object-cover sm:h-60" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-5">
                        <div>
                            {booking.facility.sport?.name && (
                                <Chip size="sm" variant="flat" className="mb-2 bg-white/20 text-white backdrop-blur">
                                    {booking.facility.sport.name}
                                </Chip>
                            )}
                            <h1 className="text-2xl font-bold text-white">{booking.facility.name}</h1>
                            <p className="mt-1 flex items-center gap-1 text-sm text-white/80">
                                <MapPin className="h-3.5 w-3.5" />
                                {booking.facility.venue?.name}{booking.facility.venue?.city ? ` — ${booking.facility.venue.city}` : ""}
                            </p>
                        </div>
                        <Chip color={chip.color} variant="solid" className="shadow-md">{chip.label}</Chip>
                    </div>
                </div>

                {/* Contenido en dos columnas */}
                <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
                    {/* Detalles */}
                    <div className="space-y-4">
                        {isRecurring && (
                            <div className="flex items-center gap-2 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm text-secondary-700">
                                <Repeat className="h-4 w-4" />
                                Esta reserva es parte de un <strong>turno fijo semanal</strong>.
                            </div>
                        )}

                        <Card className="border border-divider shadow-none">
                            <CardBody className="gap-0 p-0">
                                <DetailRow icon={<Calendar className="h-4 w-4" />} label="Fecha" value={<span className="capitalize">{formatDateLong(booking.startDatetime)}</span>} />
                                <Divider />
                                <DetailRow icon={<Clock className="h-4 w-4" />} label="Horario" value={`${formatTime(booking.startDatetime)} — ${formatTime(booking.endDatetime)} · ${mins} min`} />
                                <Divider />
                                <DetailRow icon={<User className="h-4 w-4" />} label="Cliente" value={`${booking.user.firstName} ${booking.user.lastName}`} />
                            </CardBody>
                        </Card>

                        {booking.notes && (
                            <Card className="border border-divider shadow-none">
                                <CardBody>
                                    <p className="text-xs font-medium text-default-400">Notas</p>
                                    <p className="mt-1 text-sm text-default-700">{booking.notes}</p>
                                </CardBody>
                            </Card>
                        )}

                        {booking.status === "CANCELLED" && booking.cancellationReason && (
                            <Card className="border border-danger/30 bg-danger/5 shadow-none">
                                <CardBody>
                                    <p className="text-xs font-medium text-danger">Motivo de cancelación</p>
                                    <p className="mt-1 text-sm text-default-700">{booking.cancellationReason}</p>
                                </CardBody>
                            </Card>
                        )}
                    </div>

                    {/* Resumen de pago (sticky) */}
                    <div className="lg:sticky lg:top-6 lg:self-start">
                        <Card className="border border-divider shadow-sm">
                            <CardBody className="gap-4">
                                <div>
                                    <p className="text-xs font-medium text-default-400">Estado del pago</p>
                                    <div className="mt-1 flex items-center gap-2">
                                        <Chip color={booking.paymentStatus === "PAID" ? "success" : "warning"} variant="flat" size="sm">
                                            {booking.paymentStatus === "PAID" ? "Pagado" : "Pendiente de pago"}
                                        </Chip>
                                    </div>
                                </div>

                                <Divider />

                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-default-500">Total</span>
                                    <span className="text-2xl font-bold">${formatPrice(booking.totalPrice)}</span>
                                </div>
                                <p className="-mt-2 text-xs text-default-400">{booking.currency} · comisión de servicio incluida</p>

                                {(canPay || canCancel) && <Divider />}

                                {canPay && (
                                    <Button
                                        color="primary"
                                        size="lg"
                                        className="font-semibold"
                                        startContent={<Check className="h-4 w-4" />}
                                        isLoading={markPaid.isPending}
                                        onPress={() => markPaid.mutate(booking.id)}
                                    >
                                        Pagar ${formatPrice(booking.totalPrice)} {booking.currency}
                                    </Button>
                                )}

                                {booking.paymentStatus === "PAID" && booking.status === "CONFIRMED" && (
                                    <div className="flex items-center justify-center gap-2 rounded-lg bg-success/10 py-2 text-sm text-success">
                                        <ShieldCheck className="h-4 w-4" /> Pago confirmado
                                    </div>
                                )}

                                {canCancel && (
                                    <Button
                                        color="danger"
                                        variant="light"
                                        startContent={<X className="h-4 w-4" />}
                                        isLoading={cancelBooking.isPending}
                                        onPress={() => cancelBooking.mutate({ id: booking.id }, { onSuccess: () => router.push("/bookings") })}
                                    >
                                        Cancelar reserva
                                    </Button>
                                )}
                            </CardBody>
                        </Card>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-default-100 text-default-500">{icon}</span>
            <div className="min-w-0">
                <p className="text-xs text-default-400">{label}</p>
                <p className="text-sm font-medium text-default-800">{value}</p>
            </div>
        </div>
    );
}
