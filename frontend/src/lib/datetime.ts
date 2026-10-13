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

/** "2026-10-13T04:00:00Z" -> "1:00 a. m." (hora AR, sin cero adelante). */
export function formatTimeAr(dateStr: string): string {
    if (!dateStr) return "";
    const { h, m } = arHourMinute(dateStr);
    const ampm = h < 12 ? "a. m." : "p. m.";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Fecha larga en hora AR, ej: "lunes, 12 de octubre de 2026". */
export function formatDateAr(
    dateStr: string,
    options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" },
): string {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("es-AR", { ...options, timeZone: AR_TIME_ZONE });
}
