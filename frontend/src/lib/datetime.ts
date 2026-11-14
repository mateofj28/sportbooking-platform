/**
 * Utilidades de fecha/hora que SIEMPRE muestran la hora de Argentina (UTC-3),
 * sin importar la zona horaria del navegador del usuario.
 *
 * Importante: un instante ISO (ej: "2026-10-13T04:00:00Z") debe mostrarse en
 * hora AR. Usar `new Date(iso).getHours()` toma la zona del navegador y produce
 * horas incorrectas para usuarios fuera de Argentina. Estas funciones evitan eso.
 */

export const AR_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** Partes de hora/minuto del instante, en hora de Argentina. */
function arHourMinute(dateStr: string): { h: number; m: number } {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: AR_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(new Date(dateStr));
    let h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    if (h === 24) h = 0; // algunos entornos devuelven 24 para medianoche
    return { h, m };
}

// ------------------------------------------------------------
// FORMATO ÚNICO DE LA APP (regla de diseño, ver .kiro/steering/diseno.md):
//   fecha       "13 nov 2026"
//   hora        "8:45 pm"   (12 h, sin cero adelante, "am"/"pm" en minúscula)
//   fecha+hora  "13 nov 2026, 8:45 pm"
// Siempre en hora de Argentina. No armar fechas/horas a mano en las pantallas.
// ------------------------------------------------------------

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** 20, 45 -> "8:45 pm" */
function clock(h: number, m: number): string {
    const hh = ((h % 24) + 24) % 24;
    const ampm = hh < 12 ? "am" : "pm";
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "2026-10-13T04:00:00Z" -> "1:00 am" (hora AR, sin cero adelante). */
export function formatTimeAr(dateStr: string): string {
    if (!dateStr) return "";
    const { h, m } = arHourMinute(dateStr);
    return clock(h, m);
}

/** Hora de reloj "HH:mm" (horarios, tarifas, slots) -> "8:45 pm". Horas >= 24 (cruce de medianoche) se envuelven. */
export function formatClock(time: string): string {
    if (!time) return "";
    const [h, m] = time.split(":").map(Number);
    return clock(h || 0, m || 0);
}

/** Instante -> "13 nov 2026" (hora AR). */
export function formatDateShortAr(dateStr: string): string {
    if (!dateStr) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: AR_TIME_ZONE, day: "numeric", month: "numeric", year: "numeric",
    }).formatToParts(new Date(dateStr));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    return `${get("day")} ${MONTHS_SHORT[get("month") - 1] ?? ""} ${get("year")}`;
}

/** Instante -> "13 nov 2026, 8:45 pm" (hora AR). Formato de fecha y hora de todas las tablas. */
export function formatDateTimeAr(dateStr: string | null | undefined): string {
    if (!dateStr) return "";
    return `${formatDateShortAr(dateStr)}, ${formatTimeAr(dateStr)}`;
}

/** Fecha larga en hora AR, ej: "lunes, 12 de octubre de 2026". */
export function formatDateAr(
    dateStr: string,
    options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" },
): string {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("es-AR", { ...options, timeZone: AR_TIME_ZONE });
}
