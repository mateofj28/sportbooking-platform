"use client";

import { use, useState, useMemo } from "react";
import {
    Button,
    Card,
    CardBody,
    CardHeader,
    Chip,
    Divider,
    Textarea,
    Spinner,
} from "@heroui/react";
import { useFacility } from "@/hooks/use-facilities";
import { useCreateBooking } from "@/hooks/use-bookings";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import {
    MapPin,
    Clock,
    Users,
    ChevronLeft,
    ChevronRight,
    DollarSign,
    Check,
} from "lucide-react";
import { useRouter } from "next/navigation";

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Minutos desde medianoche en hora local de Argentina (UTC-3), sin depender de la zona del navegador */
function argentinaNowMinutes(): number {
    const now = new Date();
    // Hora UTC + offset de Argentina (-3h)
    const arMs = now.getTime() + now.getTimezoneOffset() * 60000 - 3 * 60 * 60000;
    const ar = new Date(arMs);
    return ar.getHours() * 60 + ar.getMinutes();
}

function generateTimeSlots(openTime: string, closeTime: string, durationMin: number, isToday: boolean) {
    const slots: string[] = [];
    const [openH, openM] = openTime.split(":").map(Number);
    const [closeH, closeM] = closeTime.split(":").map(Number);
    const startMinutes = openH * 60 + openM;
    let endMinutes = closeH * 60 + closeM;
    // Si cruza medianoche (cierre <= apertura), extender el fin 24h
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;

    // Si es hoy, solo mostrar slots que empiecen después de la hora actual (hora AR)
    let minStart = startMinutes;
    if (isToday) {
        const nowMinutes = argentinaNowMinutes();
        // Redondear hacia arriba al siguiente slot
        minStart = Math.max(startMinutes, Math.ceil(nowMinutes / durationMin) * durationMin);
    }

    for (let m = minStart; m + durationMin <= endMinutes; m += durationMin) {
        const mInDay = m % (24 * 60);
        const h = Math.floor(mInDay / 60);
        const min = mInDay % 60;
        slots.push(`${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`);
    }
    return slots;
}

/** Convierte "09:00" -> "9:00 a. m." (sin cero adelante, formato español; envuelve horas >= 24 para cruces de medianoche) */
function formatTime12h(time: string): string {
    if (!time) return "";
    const [rawH, m] = time.split(":").map(Number);
    const h = ((rawH % 24) + 24) % 24;
    const ampm = h < 12 ? "a. m." : "p. m.";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Formatea un precio con separador de miles con coma: 25000 -> "25,000" */
function formatPrice(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

function getRemainingDaysOfMonth(): Date[] {
    const days: Date[] = [];
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const remaining = lastDay - today.getDate();
    // Show at least 30 days ahead (current month + next month if needed)
    const totalDays = Math.max(remaining + 1, 30);
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        days.push(d);
    }
    return days;
}

export default function FacilityDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    const { isAuthenticated } = useAuthStore();
    const { data: facility, isLoading } = useFacility(id);
    const createBooking = useCreateBooking();

    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [duration, setDuration] = useState<number>(60);
    const [notes, setNotes] = useState("");
    const [step, setStep] = useState<"select" | "confirm">("select");

    const days = useMemo(() => getRemainingDaysOfMonth(), []);

    // Get schedule for selected day
    const dayOfWeek = useMemo(() => (selectedDate.getDay() + 6) % 7, [selectedDate]);
    const schedule = facility?.schedules?.find((s) => s.dayOfWeek === dayOfWeek && s.isActive);

    // Fetch real availability from backend
    const dateStr = selectedDate.toISOString().split("T")[0];
    const { data: availability } = useQuery({
        queryKey: ["availability", id, dateStr],
        queryFn: () => apiClient.get<{ available: boolean; slots: { time: string; available: boolean }[]; message?: string }>(`/facilities/${id}/availability`, { date: dateStr }),
        enabled: !!facility && !!schedule,
    });

    // Generate available time slots (fallback to local if API not ready)
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    const timeSlots = useMemo(() => {
        // Preferir siempre la disponibilidad calculada por el backend (marca pasados/ocupados)
        if (availability?.slots) {
            return availability.slots;
        }
        if (!schedule || !facility) return [];
        // Fallback local: generar todos los slots del rango y marcar como no
        // disponibles los que ya pasaron (hora de Argentina) si es hoy.
        const nowMin = argentinaNowMinutes();
        return generateTimeSlots(schedule.openTime, schedule.closeTime, facility.minBookingDuration, false)
            .map((t) => {
                if (!isToday) return { time: t, available: true };
                const [h, m] = t.split(":").map(Number);
                const slotMin = h * 60 + m;
                return { time: t, available: slotMin > nowMin };
            });
    }, [availability, schedule, facility, isToday]);

    // Duration options
    const durationOptions = useMemo(() => {
        if (!facility) return [];
        const options: number[] = [];
        for (let d = facility.minBookingDuration; d <= facility.maxBookingDuration; d += 30) {
            options.push(d);
        }
        return options;
    }, [facility]);

    // Calculate end time
    const endTime = useMemo(() => {
        if (!selectedSlot) return "";
        const [h, m] = selectedSlot.split(":").map(Number);
        const totalMin = h * 60 + m + duration;
        const endH = Math.floor(totalMin / 60);
        const endM = totalMin % 60;
        return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
    }, [selectedSlot, duration]);

    // Calculate price
    const price = useMemo(() => {
        if (!facility?.pricing || !selectedSlot) return 0;
        const pricing = facility.pricing.find((p) => {
            const matchDay = p.dayOfWeek === null || p.dayOfWeek === undefined || p.dayOfWeek === dayOfWeek;
            return matchDay && selectedSlot >= p.startTime && selectedSlot < p.endTime;
        });
        if (!pricing) return 0;
        return Number(pricing.pricePerHour) * (duration / 60);
    }, [facility, selectedSlot, duration, dayOfWeek]);

    const handleBooking = () => {
        if (!isAuthenticated) {
            router.push("/login");
            return;
        }
        if (!selectedSlot) return;

        const dateStr = selectedDate.toISOString().split("T")[0];
        const startDatetime = new Date(`${dateStr}T${selectedSlot}:00`).toISOString();
        const endDatetime = new Date(`${dateStr}T${endTime}:00`).toISOString();

        createBooking.mutate(
            { facilityId: id, startDatetime, endDatetime, notes: notes || undefined },
            { onSuccess: () => router.push("/bookings") }
        );
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!facility) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <p>Instalación no encontrada</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">{facility.name}</h1>
                            <p className="mt-1 flex items-center gap-1 text-sm text-default-500">
                                <MapPin className="h-3.5 w-3.5" />
                                {facility.venue.name} — {facility.venue.address}, {facility.venue.city}
                            </p>
                        </div>
                        <Chip color="primary" variant="flat" size="lg">
                            {facility.sport.name}
                        </Chip>
                    </div>
                    {facility.description && (
                        <p className="mt-3 text-sm text-default-600">{facility.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {facility.surfaceType && <Chip size="sm" variant="bordered">{facility.surfaceType}</Chip>}
                        {facility.isIndoor && <Chip size="sm" variant="bordered" color="secondary">Indoor</Chip>}
                        {facility.capacity && (
                            <Chip size="sm" variant="bordered" startContent={<Users className="h-3 w-3" />}>
                                {facility.capacity} jugadores
                            </Chip>
                        )}
                        <Chip size="sm" variant="bordered" startContent={<Clock className="h-3 w-3" />}>
                            {facility.minBookingDuration}-{facility.maxBookingDuration} min
                        </Chip>
                    </div>
                </div>

                {/* Booking Flow */}
                <Card className="shadow-sm">
                    <CardHeader className="flex-col items-start gap-1 pb-0">
                        <h2 className="text-lg font-bold">Reservar horario</h2>
                        <p className="text-xs text-default-500">Selecciona el día, horario y duración</p>
                    </CardHeader>
                    <CardBody className="gap-6">
                        {/* Step 1: Date Selector - Horizontal scroll of days */}
                        <div>
                            <p className="mb-3 text-sm font-semibold text-default-700">1. Elige el día</p>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {days.map((day) => {
                                    const isSelected = day.toDateString() === selectedDate.toDateString();
                                    const isDayToday = day.toDateString() === new Date().toDateString();
                                    const dayDow = (day.getDay() + 6) % 7;
                                    const daySchedule = facility.schedules?.find((s) => s.dayOfWeek === dayDow && s.isActive);
                                    // Check if the day has available slots
                                    const dayHasSlots = daySchedule
                                        ? generateTimeSlots(daySchedule.openTime, daySchedule.closeTime, facility.minBookingDuration, isDayToday).length > 0
                                        : false;
                                    return (
                                        <button
                                            key={day.toISOString()}
                                            onClick={() => { if (dayHasSlots) { setSelectedDate(day); setSelectedSlot(null); setStep("select"); } }}
                                            disabled={!dayHasSlots}
                                            className={`flex min-w-[70px] flex-col items-center rounded-xl px-3 py-3 transition-all ${isSelected
                                                ? "bg-primary text-white shadow-md"
                                                : dayHasSlots
                                                    ? "bg-default-100 hover:bg-default-200"
                                                    : "bg-default-50 text-default-300 cursor-not-allowed opacity-50"
                                                }`}
                                        >
                                            <span className="text-[10px] font-medium uppercase">
                                                {isDayToday ? "Hoy" : DAYS_ES[day.getDay()]}
                                            </span>
                                            <span className="text-xl font-bold">{day.getDate()}</span>
                                            <span className="text-[10px]">
                                                {MONTHS_ES[day.getMonth()].slice(0, 3)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Step 2: Time Slots */}
                        <div>
                            <p className="mb-3 text-sm font-semibold text-default-700">2. Elige la hora de inicio</p>
                            {!schedule ? (
                                <div className="rounded-lg bg-warning/10 p-4 text-center text-sm text-warning">
                                    La instalación está cerrada este día
                                </div>
                            ) : timeSlots.length === 0 ? (
                                <div className="rounded-lg bg-danger/10 p-4 text-center text-sm text-danger">
                                    No hay horarios disponibles para hoy. Selecciona otro día.
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                                    {timeSlots.map((slot) => {
                                        const slotTime = typeof slot === "string" ? slot : slot.time;
                                        const slotAvailable = typeof slot === "string" ? true : slot.available;
                                        const isSelected = slotTime === selectedSlot;
                                        return (
                                            <button
                                                key={slotTime}
                                                onClick={() => { if (slotAvailable) { setSelectedSlot(slotTime); setStep("select"); } }}
                                                disabled={!slotAvailable}
                                                className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-all ${isSelected
                                                    ? "border-primary bg-primary text-white shadow-sm"
                                                    : slotAvailable
                                                        ? "border-divider bg-background hover:border-primary hover:text-primary"
                                                        : "border-divider bg-default-100 text-default-300 cursor-not-allowed line-through"
                                                    }`}
                                            >
                                                {formatTime12h(slotTime)}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Step 3: Duration */}
                        {selectedSlot && (
                            <div>
                                <p className="mb-3 text-sm font-semibold text-default-700">3. Duración</p>
                                <div className="flex flex-wrap gap-2">
                                    {durationOptions.map((d) => (
                                        <button
                                            key={d}
                                            onClick={() => setDuration(d)}
                                            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${d === duration
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-divider hover:border-primary"
                                                }`}
                                        >
                                            {d} min
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Summary & Confirm */}
                        {selectedSlot && (
                            <>
                                <Divider />
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-default-700">Resumen de tu reserva</p>
                                        <div className="flex flex-wrap items-center gap-3 text-sm text-default-600">
                                            <span className="flex items-center gap-1">
                                                📅 {selectedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                🕐 {formatTime12h(selectedSlot)} - {formatTime12h(endTime)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                ⏱️ {duration} min
                                            </span>
                                        </div>
                                        <p className="text-xl font-bold text-success">
                                            ${formatPrice(price)} ARS
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <Textarea
                                            placeholder="Notas (opcional)"
                                            variant="bordered"
                                            size="sm"
                                            value={notes}
                                            onValueChange={setNotes}
                                            className="max-w-xs"
                                            minRows={1}
                                        />
                                        <Button
                                            color="primary"
                                            size="lg"
                                            onPress={handleBooking}
                                            isLoading={createBooking.isPending}
                                            startContent={<Check className="h-4 w-4" />}
                                            className="font-semibold"
                                        >
                                            {isAuthenticated ? "Confirmar Reserva" : "Iniciar sesión para reservar"}
                                        </Button>
                                    </div>
                                </div>

                                {createBooking.isError && (
                                    <p className="text-center text-sm text-danger">
                                        {(createBooking.error as any)?.message || "Error al crear la reserva"}
                                    </p>
                                )}
                            </>
                        )}
                    </CardBody>
                </Card>

                {/* Pricing Info */}
                {facility.pricing && facility.pricing.length > 0 && (
                    <Card className="mt-4 shadow-sm">
                        <CardBody>
                            <p className="mb-3 text-sm font-semibold text-default-700">Tarifas</p>
                            <div className="flex flex-wrap gap-3">
                                {facility.pricing.map((price) => (
                                    <div
                                        key={price.id}
                                        className="flex items-center gap-2 rounded-lg bg-default-100 px-3 py-2"
                                    >
                                        <Clock className="h-3.5 w-3.5 text-default-500" />
                                        <span className="text-sm">{formatTime12h(price.startTime)} - {formatTime12h(price.endTime)}</span>
                                        <Chip size="sm" color="success" variant="flat">
                                            ${formatPrice(Number(price.pricePerHour))}/hr
                                        </Chip>
                                    </div>
                                ))}
                            </div>
                        </CardBody>
                    </Card>
                )}
            </main>
            <Footer />
        </div>
    );
}
