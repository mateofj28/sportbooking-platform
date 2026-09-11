"use client";

import { useMemo, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Facility } from "@/types";

interface AvailabilityResponse {
    available: boolean;
    slots: { time: string; available: boolean }[];
    message?: string;
}

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Minutos desde medianoche en hora local de Argentina (UTC-3) */
export function argentinaNowMinutes(): number {
    const now = new Date();
    const arMs = now.getTime() + now.getTimezoneOffset() * 60000 - 3 * 60 * 60000;
    const ar = new Date(arMs);
    return ar.getHours() * 60 + ar.getMinutes();
}

export function generateTimeSlots(openTime: string, closeTime: string, durationMin: number, isToday: boolean) {
    const slots: string[] = [];
    const [openH, openM] = openTime.split(":").map(Number);
    const [closeH, closeM] = closeTime.split(":").map(Number);
    const startMinutes = openH * 60 + openM;
    let endMinutes = closeH * 60 + closeM;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;

    let minStart = startMinutes;
    if (isToday) {
        const nowMinutes = argentinaNowMinutes();
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

/** "09:00" -> "9:00 a. m." (sin cero adelante, formato español) */
export function formatTime12h(time: string): string {
    if (!time) return "";
    const [rawH, m] = time.split(":").map(Number);
    const h = ((rawH % 24) + 24) % 24;
    const ampm = h < 12 ? "a. m." : "p. m.";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** 25000 -> "25,000" */
export function formatPrice(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

function getRemainingDaysOfMonth(): Date[] {
    const days: Date[] = [];
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const remaining = lastDay - today.getDate();
    const totalDays = Math.max(remaining + 1, 30);
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        days.push(d);
    }
    return days;
}

export interface AvailabilitySelection {
    date: Date;
    startTime: string;   // "20:00"
    endTime: string;     // "22:00"
    duration: number;    // minutos
    price: number;
    dayOfWeek: number;   // 0=Lunes..6=Domingo
}

interface AvailabilityPickerProps {
    facility: Facility;
    /** Notifica la selección actual (o null si está incompleta) */
    onChange: (selection: AvailabilitySelection | null) => void;
    /** Etiqueta del primer paso (por defecto "Elige el día") */
    dayLabel?: string;
}

export function AvailabilityPicker({ facility, onChange, dayLabel = "1. Elige el día" }: AvailabilityPickerProps) {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [duration, setDuration] = useState<number>(facility.minBookingDuration || 60);

    const days = useMemo(() => getRemainingDaysOfMonth(), []);

    const dayOfWeek = useMemo(() => (selectedDate.getDay() + 6) % 7, [selectedDate]);
    const schedule = facility.schedules?.find((s) => s.dayOfWeek === dayOfWeek && s.isActive);

    // Precargar disponibilidad de TODOS los días que tienen horario activo.
    // Así la habilitación del día y la lista de horas usan la MISMA fuente
    // (el backend), evitando días "habilitados" que luego no tienen horas.
    const dayInfos = useMemo(
        () =>
            days.map((day) => {
                const dow = (day.getDay() + 6) % 7;
                const hasSchedule = !!facility.schedules?.find((s) => s.dayOfWeek === dow && s.isActive);
                return { day, dateStr: day.toISOString().split("T")[0], hasSchedule };
            }),
        [days, facility.schedules],
    );

    const availabilityQueries = useQueries({
        queries: dayInfos.map((info) => ({
            queryKey: ["availability", facility.id, info.dateStr],
            queryFn: () => apiClient.get<AvailabilityResponse>(`/facilities/${facility.id}/availability`, { date: info.dateStr }),
            enabled: info.hasSchedule,
            staleTime: 60_000,
        })),
    });

    // Mapa dateStr -> disponibilidad (slots del backend)
    const availabilityByDate = useMemo(() => {
        const map: Record<string, AvailabilityResponse | undefined> = {};
        dayInfos.forEach((info, i) => {
            map[info.dateStr] = availabilityQueries[i]?.data as AvailabilityResponse | undefined;
        });
        return map;
    }, [dayInfos, availabilityQueries]);

    const loadingByDate = useMemo(() => {
        const map: Record<string, boolean> = {};
        dayInfos.forEach((info, i) => {
            map[info.dateStr] = !!availabilityQueries[i]?.isLoading;
        });
        return map;
    }, [dayInfos, availabilityQueries]);

    /** ¿El día tiene al menos un slot disponible? */
    const dayHasAvailableSlots = (day: Date): boolean => {
        const dow = (day.getDay() + 6) % 7;
        const daySchedule = facility.schedules?.find((s) => s.dayOfWeek === dow && s.isActive);
        if (!daySchedule) return false;
        const ds = day.toISOString().split("T")[0];
        const resp = availabilityByDate[ds];
        // Si aún carga, lo dejamos habilitado provisionalmente (se recalcula al llegar)
        if (loadingByDate[ds] || !resp) {
            const isDayToday = day.toDateString() === new Date().toDateString();
            return generateTimeSlots(daySchedule.openTime, daySchedule.closeTime, facility.minBookingDuration, isDayToday).length > 0;
        }
        return resp.slots.some((s) => s.available);
    };

    const dateStr = selectedDate.toISOString().split("T")[0];
    const availability = availabilityByDate[dateStr];

    const isToday = selectedDate.toDateString() === new Date().toDateString();
    const timeSlots = useMemo(() => {
        if (availability?.slots) return availability.slots;
        if (!schedule) return [];
        const nowMin = argentinaNowMinutes();
        return generateTimeSlots(schedule.openTime, schedule.closeTime, facility.minBookingDuration, false)
            .map((t) => {
                if (!isToday) return { time: t, available: true };
                const [h, m] = t.split(":").map(Number);
                const slotMin = h * 60 + m;
                return { time: t, available: slotMin > nowMin };
            });
    }, [availability, schedule, facility, isToday]);

    const durationOptions = useMemo(() => {
        const options: number[] = [];
        for (let d = facility.minBookingDuration; d <= facility.maxBookingDuration; d += 30) {
            options.push(d);
        }
        return options.length ? options : [facility.minBookingDuration];
    }, [facility]);

    const endTime = useMemo(() => {
        if (!selectedSlot) return "";
        const [h, m] = selectedSlot.split(":").map(Number);
        const totalMin = h * 60 + m + duration;
        const endH = Math.floor(totalMin / 60);
        const endM = totalMin % 60;
        return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
    }, [selectedSlot, duration]);

    const price = useMemo(() => {
        if (!facility.pricing || !selectedSlot) return 0;
        const pricing = facility.pricing.find((p) => {
            const matchDay = p.dayOfWeek === null || p.dayOfWeek === undefined || p.dayOfWeek === dayOfWeek;
            return matchDay && selectedSlot >= p.startTime && selectedSlot < p.endTime;
        });
        if (!pricing) return 0;
        return Number(pricing.pricePerHour) * (duration / 60);
    }, [facility, selectedSlot, duration, dayOfWeek]);

    // Si el día seleccionado no tiene horarios disponibles, saltar al primer
    // día que sí tenga (una vez que la disponibilidad terminó de cargar).
    useEffect(() => {
        const anyLoading = Object.values(loadingByDate).some(Boolean);
        if (anyLoading) return;
        if (!dayHasAvailableSlots(selectedDate)) {
            const firstOk = days.find((d) => dayHasAvailableSlots(d));
            if (firstOk && firstOk.toDateString() !== selectedDate.toDateString()) {
                setSelectedDate(firstOk);
                setSelectedSlot(null);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availabilityByDate, loadingByDate]);

    // Notificar al padre cuando cambia la selección
    useEffect(() => {
        if (selectedSlot && schedule) {
            onChange({
                date: selectedDate,
                startTime: selectedSlot,
                endTime,
                duration,
                price,
                dayOfWeek,
            });
        } else {
            onChange(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSlot, endTime, duration, price, dayOfWeek, selectedDate, schedule]);

    return (
        <div className="flex flex-col gap-6">
            {/* Paso 1: día */}
            <div>
                <p className="mb-3 text-sm font-semibold text-default-700">{dayLabel}</p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {days.map((day) => {
                        const isSelected = day.toDateString() === selectedDate.toDateString();
                        const isDayToday = day.toDateString() === new Date().toDateString();
                        // Habilitación según disponibilidad REAL (backend), misma fuente que las horas
                        const dayHasSlots = dayHasAvailableSlots(day);
                        return (
                            <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => { if (dayHasSlots) { setSelectedDate(day); setSelectedSlot(null); } }}
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
                                <span className="text-[10px]">{MONTHS_ES[day.getMonth()].slice(0, 3)}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Paso 2: hora */}
            <div>
                <p className="mb-3 text-sm font-semibold text-default-700">2. Elige la hora de inicio</p>
                {!schedule ? (
                    <div className="rounded-lg bg-warning/10 p-4 text-center text-sm text-warning">
                        La instalación está cerrada este día
                    </div>
                ) : timeSlots.length === 0 ? (
                    <div className="rounded-lg bg-danger/10 p-4 text-center text-sm text-danger">
                        No hay horarios disponibles. Selecciona otro día.
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
                                    type="button"
                                    onClick={() => { if (slotAvailable) setSelectedSlot(slotTime); }}
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

            {/* Paso 3: duración */}
            {selectedSlot && (
                <div>
                    <p className="mb-3 text-sm font-semibold text-default-700">3. Duración</p>
                    <div className="flex flex-wrap gap-2">
                        {durationOptions.map((d) => (
                            <button
                                key={d}
                                type="button"
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

            {/* Resumen de selección */}
            {selectedSlot && schedule && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-default-50 px-4 py-3 text-sm text-default-600">
                    <span>🕐 {formatTime12h(selectedSlot)} - {formatTime12h(endTime)}</span>
                    <span>⏱️ {duration} min</span>
                    <span className="font-bold text-success">${formatPrice(price)} ARS</span>
                </div>
            )}
        </div>
    );
}
