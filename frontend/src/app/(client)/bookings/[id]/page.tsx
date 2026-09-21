"use client";

import { use } from "react";
import { Button, Card, CardBody, CardHeader, Chip, Divider, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useBooking, useMarkBookingPaid, useCancelBooking } from "@/hooks/use-bookings";
import { getBookingStatusChip } from "@/lib/booking-status";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ArrowLeft, MapPin, Calendar, Clock, User, DollarSign, Check, X, Repeat } from "lucide-react";

function formatDate(dateStr: string): string {
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

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
                <Button variant="light" size="sm" startContent={<ArrowLeft className="h-4 w-4" />} onPress={() => router.back()} className="mb-4">
                    Volver
                </Button>

                <Card>
                    <CardHeader className="flex-col items-start gap-2">
                        <div className="flex w-full items-start justify-between gap-3">
                            <div>
                                <h1 className="text-xl font-bold">{booking.facility.name}</h1>
                                <p className="mt-1 flex items-center gap-1 text-sm text-default-500">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {booking.facility.venue?.name}
                                    {booking.facility.venue?.city ? ` — ${booking.facility.venue.city}` : ""}
                                </p>
                            </div>
                            <Chip color={chip.color} variant="flat">{chip.label}</Chip>
                        </div>
                        {isRecurring && (
                            <Chip size="sm" variant="flat" color="secondary" startContent={<Repeat className="h-3 w-3" />}>
                                Turno fijo
                            </Chip>
                        )}
                    </CardHeader>
                    <Divider />
                    <CardBody className="gap-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Info icon={<Calendar className="h-4 w-4" />} label="Fecha" value={formatDate(booking.startDatetime)} />
                            <Info icon={<Clock className="h-4 w-4" />} label="Horario" value={`${formatTime(booking.startDatetime)} — ${formatTime(booking.endDatetime)}`} />
                            <Info icon={<User className="h-4 w-4" />} label="Cliente" value={`${booking.user.firstName} ${booking.user.lastName}`} />
                            <Info icon={<DollarSign className="h-4 w-4" />} label="Total" value={`$${formatPrice(booking.totalPrice)} ${booking.currency}`} />
                        </div>

                        {booking.notes && (
                            <div className="rounded-lg bg-default-50 p-3">
                                <p className="text-xs text-default-400">Notas</p>
                                <p className="text-sm text-default-700">{booking.notes}</p>
                            </div>
                        )}

                        {booking.status === "CANCELLED" && booking.cancellationReason && (
                            <div className="rounded-lg bg-danger/10 p-3">
                                <p className="text-xs text-danger">Motivo de cancelación</p>
                                <p className="text-sm text-default-700">{booking.cancellationReason}</p>
                            </div>
                        )}

                        {(canPay || canCancel) && (
                            <>
                                <Divider />
                                <div className="flex flex-wrap gap-2">
                                    {canPay && (
                                        <Button
                                            color="primary"
                                            startContent={<Check className="h-4 w-4" />}
                                            isLoading={markPaid.isPending}
                                            onPress={() => markPaid.mutate(booking.id)}
                                        >
                                            Pagar ${formatPrice(booking.totalPrice)} {booking.currency}
                                        </Button>
                                    )}
                                    {canCancel && (
                                        <Button
                                            color="danger"
                                            variant="flat"
                                            startContent={<X className="h-4 w-4" />}
                                            isLoading={cancelBooking.isPending}
                                            onPress={() => cancelBooking.mutate({ id: booking.id }, { onSuccess: () => router.push("/bookings") })}
                                        >
                                            Cancelar reserva
                                        </Button>
                                    )}
                                </div>
                            </>
                        )}
                    </CardBody>
                </Card>
            </main>
            <Footer />
        </div>
    );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <span className="mt-0.5 text-default-400">{icon}</span>
            <div>
                <p className="text-xs text-default-400">{label}</p>
                <p className="text-sm font-medium capitalize">{value}</p>
            </div>
        </div>
    );
}
