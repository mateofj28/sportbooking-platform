"use client";

import { use, useMemo } from "react";
import { Button, Card, CardBody, CardHeader, Chip, Divider, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useRecurringBookings, useMarkBookingPaid } from "@/hooks/use-bookings";
import { getBookingStatusChip } from "@/lib/booking-status";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ArrowLeft, MapPin, Clock, Repeat, Calendar, DollarSign } from "lucide-react";

const DAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function formatTime12h(time: string): string {
    if (!time) return "";
    const [rawH, m] = time.split(":").map(Number);
    const h = ((rawH % 24) + 24) % 24;
    const ampm = h < 12 ? "a. m." : "p. m.";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function formatDateLong(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatHour(dateStr: string): string {
    const d = new Date(dateStr);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h < 12 ? "a. m." : "p. m.";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function RecurringDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { data: list, isLoading } = useRecurringBookings();
    const markPaid = useMarkBookingPaid();

    const recurring = useMemo(() => list?.find((r) => r.id === id), [list, id]);

    // Reservas ordenadas: próximas (futuras) primero por fecha ascendente, luego pasadas
    const sortedBookings = useMemo(() => {
        if (!recurring) return [];
        const now = new Date();
        const withMeta = recurring.bookings.map((b) => ({
            ...b,
            isPast: new Date(b.startDatetime) < now,
        }));
        return withMeta.sort((a, b) => {
            // futuras antes que pasadas
            if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
            return new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime();
        });
    }, [recurring]);

    if (isLoading) {
        return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    }
    if (!recurring) {
        return (
            <div className="flex min-h-screen flex-col">
                <Navbar />
                <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
                    <p className="text-center text-default-500">Turno fijo no encontrado</p>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-default-50">
            <Navbar />
            <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
                <Button variant="light" size="sm" startContent={<ArrowLeft className="h-4 w-4" />} onPress={() => router.back()} className="mb-4">
                    Volver
                </Button>

                {/* Encabezado del turno fijo */}
                <Card className="border border-divider shadow-sm">
                    <CardHeader className="flex-col items-start gap-2">
                        <div className="flex w-full items-start justify-between gap-3">
                            <div>
                                <h1 className="text-xl font-bold">{recurring.facility.name}</h1>
                                <p className="mt-1 flex items-center gap-1 text-sm text-default-500">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {recurring.facility.venue?.name}
                                </p>
                            </div>
                            <Chip color={recurring.isActive ? "success" : "default"} variant="flat">
                                {recurring.isActive ? "Activo" : "Finalizado"}
                            </Chip>
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-default-500">
                            <span className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" /> Todos los {DAYS_ES[recurring.dayOfWeek]}</span>
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatTime12h(recurring.startTime)} — {formatTime12h(recurring.endTime)}</span>
                        </div>
                    </CardHeader>
                </Card>

                {/* Lista de reservas */}
                <h2 className="mb-3 mt-6 text-base font-semibold">Reservas del turno fijo</h2>
                <div className="space-y-2">
                    {sortedBookings.map((b) => {
                        const chip = getBookingStatusChip({
                            status: b.status as any,
                            paymentStatus: b.paymentStatus as any,
                            recurringBookingId: recurring.id,
                        });
                        return (
                            <Card
                                key={b.id}
                                isPressable
                                onPress={() => router.push(`/bookings/${b.id}`)}
                                className={`w-full border border-divider ${b.isPast ? "opacity-60" : ""}`}
                            >
                                <CardBody className="flex-row items-center justify-between gap-3 p-4">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-default-100 text-default-500">
                                            <Calendar className="h-4 w-4" />
                                        </span>
                                        <div>
                                            <p className="text-sm font-medium capitalize">{formatDateLong(b.startDatetime)}</p>
                                            <p className="text-xs text-default-400">{formatHour(b.startDatetime)} — {formatHour(b.endDatetime)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {b.status === "CONFIRMED" && b.paymentStatus !== "PAID" && !b.isPast && (
                                            <div onClick={(e) => e.stopPropagation()}>
                                                <Button
                                                    color="primary"
                                                    size="sm"
                                                    startContent={<DollarSign className="h-4 w-4" />}
                                                    isLoading={markPaid.isPending && markPaid.variables === b.id}
                                                    onPress={() => markPaid.mutate(b.id)}
                                                >
                                                    Pagar
                                                </Button>
                                            </div>
                                        )}
                                        <Chip color={chip.color} size="sm" variant="flat">{chip.label}</Chip>
                                    </div>
                                </CardBody>
                            </Card>
                        );
                    })}
                </div>
            </main>
            <Footer />
        </div>
    );
}
