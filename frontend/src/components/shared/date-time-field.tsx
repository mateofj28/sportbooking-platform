"use client";

import { DatePicker } from "@heroui/react";
import { parseDateTime, type CalendarDateTime } from "@internationalized/date";

interface DateTimeFieldProps {
    /** "YYYY-MM-DDTHH:mm" (hora local, sin zona) o "" si no hay valor. */
    value: string;
    onChange: (value: string) => void;
    label: string;
    description?: string;
    isInvalid?: boolean;
    errorMessage?: string;
    /** Muestra "Quitar fecha" cuando hay un valor (para campos opcionales). */
    isClearable?: boolean;
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

function toCalendarDateTime(value: string): CalendarDateTime | null {
    if (!value) return null;
    try {
        return parseDateTime(value);
    } catch {
        return null;
    }
}

/**
 * Fecha + hora con el DatePicker de HeroUI.
 * Regla de diseño: nunca usar <input type="date|datetime-local|time"> nativo
 * (cada navegador lo dibuja distinto y no respeta el tema de la app).
 *
 * El valor entra y sale como texto "YYYY-MM-DDTHH:mm" para integrarse con
 * formularios de texto (react-hook-form + Zod) sin conversiones en cada pantalla.
 */
export function DateTimeField({
    value,
    onChange,
    label,
    description,
    isInvalid,
    errorMessage,
    isClearable = true,
}: DateTimeFieldProps) {
    return (
        <div className="flex flex-col gap-1">
            <DatePicker
                label={label}
                variant="bordered"
                granularity="minute"
                hideTimeZone
                showMonthAndYearPickers
                // Cast: HeroUI incluye su propia copia de @internationalized/date y sus clases
                // no son asignables entre sí (mismo patrón que los demás DatePicker del proyecto)
                value={toCalendarDateTime(value) as any}
                onChange={(v) => {
                    if (!v) return onChange("");
                    // Con granularity="minute" el valor trae hora y minuto
                    const hour = "hour" in v ? v.hour : 0;
                    const minute = "minute" in v ? v.minute : 0;
                    onChange(`${pad(v.year, 4)}-${pad(v.month)}-${pad(v.day)}T${pad(hour)}:${pad(minute)}`);
                }}
                description={description}
                isInvalid={isInvalid}
                errorMessage={errorMessage}
            />
            {isClearable && value && (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    className="self-start text-xs text-primary hover:underline"
                >
                    Quitar fecha
                </button>
            )}
        </div>
    );
}
