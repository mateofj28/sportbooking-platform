"use client";

import { useId } from "react";
import { DatePicker, TimeInput } from "@heroui/react";
import { Time, parseDate } from "@internationalized/date";

interface DateTimeFieldProps {
    /** "YYYY-MM-DDTHH:mm" (hora local, sin zona) o "" si no hay valor. */
    value: string;
    onChange: (value: string) => void;
    /** Título del grupo, ej. "Comienza (opcional)". */
    label: string;
    /** Texto de ayuda bajo el grupo. */
    description?: string;
    isInvalid?: boolean;
    errorMessage?: string;
    /**
     * Hora que se completa sola al elegir el día ("HH:mm"). Queda visible en el
     * campo de hora, nunca oculta. Ej: "00:00" para un inicio, "23:59" para un fin.
     */
    defaultTime?: string;
    /** Día mínimo permitido ("YYYY-MM-DD"). Ej: hoy, o el día de inicio para el selector de fin. */
    minDate?: string;
    /** Día máximo permitido ("YYYY-MM-DD"). Evita años absurdos (2222, 3333). */
    maxDate?: string;
    /** Muestra "Quitar" cuando hay un valor (para campos opcionales). */
    isClearable?: boolean;
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** "YYYY-MM-DDTHH:mm" -> { date: "YYYY-MM-DD", time: "HH:mm" } */
function splitValue(value: string): { date: string; time: string } {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
    return m ? { date: m[1], time: m[2] } : { date: "", time: "" };
}

function toDate(date: string) {
    if (!date) return null;
    try {
        return parseDate(date);
    } catch {
        return null;
    }
}

function toTime(time: string): Time | null {
    const m = /^(\d{2}):(\d{2})$/.exec(time);
    return m ? new Time(Number(m[1]), Number(m[2])) : null;
}

/**
 * Fecha y hora como DOS controles independientes (DatePicker + TimeInput de HeroUI).
 *
 * Regla de diseño: nunca <input type="date|datetime-local|time"> nativo.
 *
 * Decisiones de UX:
 *  - La fecha manda. La hora queda deshabilitada hasta elegir el día (no existe una
 *    hora "suelta") y limpiar el día limpia la hora: nunca hay un estado a medias.
 *  - Al elegir el día, la hora toma `defaultTime` y se ve en el campo; se puede editar.
 *  - La hora se edita sin tocar el día, y viceversa: cada control cambia solo lo suyo.
 *  - El valor entra y sale como "YYYY-MM-DDTHH:mm" para integrarse con react-hook-form + Zod.
 */
export function DateTimeField({
    value,
    onChange,
    label,
    description,
    isInvalid,
    errorMessage,
    defaultTime = "00:00",
    minDate,
    maxDate,
    isClearable = true,
}: DateTimeFieldProps) {
    const id = useId();
    const { date, time } = splitValue(value);
    const hasDate = !!date;

    const emit = (nextDate: string, nextTime: string) => {
        if (!nextDate) return onChange("");
        onChange(`${nextDate}T${nextTime || defaultTime}`);
    };

    return (
        <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <p id={`${id}-label`} className="text-sm text-default-600">{label}</p>
                {isClearable && hasDate && (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        className="text-xs text-primary hover:underline"
                    >
                        Quitar
                    </button>
                )}
            </div>

            <div className="grid grid-cols-5 gap-3">
                <div className="col-span-3">
                    <DatePicker
                        aria-label={`${label} — fecha`}
                        variant="bordered"
                        showMonthAndYearPickers
                        value={toDate(date) as any}
                        minValue={(minDate ? toDate(minDate) : undefined) as any}
                        maxValue={(maxDate ? toDate(maxDate) : undefined) as any}
                        isInvalid={isInvalid}
                        onChange={(v) => {
                            // El valor llega como CalendarDate; ignorar si se vació
                            if (!v) return emit("", "");
                            emit(`${pad(v.year, 4)}-${pad(v.month)}-${pad(v.day)}`, time);
                        }}
                    />
                </div>
                <div className="col-span-2">
                    <TimeInput
                        aria-label={`${label} — hora`}
                        variant="bordered"
                        granularity="minute"
                        // 24 h siempre (como en Argentina y en las tablas del panel): sin esto toma el
                        // formato del navegador (ej. 12 h con a. m./p. m.) y es fácil cargar 11:59 por 23:59
                        hourCycle={24}
                        isDisabled={!hasDate}
                        isInvalid={isInvalid}
                        value={toTime(time) as any}
                        onChange={(v) => {
                            // Si se vacían los segmentos, vuelve a la hora por defecto (siempre visible)
                            emit(date, v ? `${pad(v.hour)}:${pad(v.minute)}` : defaultTime);
                        }}
                    />
                </div>
            </div>

            {isInvalid && errorMessage ? (
                <p role="alert" className="text-xs text-danger">{errorMessage}</p>
            ) : description ? (
                <p className="text-xs text-default-400">{description}</p>
            ) : null}
        </div>
    );
}
