// ============================================================
// lib/clock.ts
// Reloj de la app: hora del SERVIDOR y fechas en hora de ARGENTINA (UTC-3, sin horario de verano).
//
// Por qué: Date.now() es el reloj de la PC del usuario. Si está atrasado o adelantado, la app
// mostraría como pendiente un turno que ya pasó, ofrecería horarios vencidos o calcularía mal las
// 24 h para cancelar. Y "hoy" según el navegador depende de su zona (en Colombia, entre las 22:00 y
// las 00:00 ya es "mañana" en Argentina).
//
// Cómo: ClockSync (providers/clock-sync.tsx) le pregunta la hora a la base
// (RPC server_now, migración 061) al abrir la app y cada 10 min, y guarda la diferencia con la PC.
// Todo lo que decide algo de negocio usa serverNow() / serverDate() / los helpers "Ar" de abajo.
// Este archivo no importa nada de red: lo pueden usar libs y validaciones.
// ============================================================

const STORAGE_KEY = "server-clock-offset-ms";
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Diferencia servidor − PC en ms. Arranca con la última conocida (visitas anteriores). */
let offsetMs = (() => {
    if (typeof window === "undefined") return 0;
    const v = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) ? v : 0;
})();

/** Guarda una nueva diferencia (la llama ClockSync). Devuelve cuánto cambió, en ms. */
export function setServerOffset(ms: number): number {
    const delta = Math.abs(ms - offsetMs);
    offsetMs = ms;
    try { window.localStorage.setItem(STORAGE_KEY, String(Math.round(ms))); } catch { /* modo privado */ }
    return delta;
}

/** Diferencia actual servidor − PC (ms). */
export function serverOffsetMs(): number {
    return offsetMs;
}

/** Ahora, según el servidor (ms desde epoch). Usar en lugar de Date.now() para reglas de negocio. */
export function serverNow(): number {
    return Date.now() + offsetMs;
}

/** Ahora, según el servidor, como Date. Usar en lugar de new Date(). */
export function serverDate(): Date {
    return new Date(serverNow());
}

/** Hoy en Argentina como "YYYY-MM-DD". */
export function arTodayStr(now: number = serverNow()): string {
    return new Date(now - AR_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Hoy en Argentina como Date en la medianoche LOCAL del navegador con año/mes/día de Argentina.
 * Los selectores de días trabajan con estos Date (getDate(), getDay(), toDateString()) y luego
 * interpretan año/mes/día como fecha de Argentina; así "hoy" y el día de la semana son los de AR
 * aunque el navegador esté en otra zona.
 */
export function arTodayLocalDate(now: number = serverNow()): Date {
    const [y, m, d] = arTodayStr(now).split("-").map(Number);
    return new Date(y, m - 1, d);
}

/** ¿Ese día (Date con año/mes/día de AR, como los de arTodayLocalDate) es hoy en Argentina? */
export function isArToday(day: Date, now: number = serverNow()): boolean {
    return day.toDateString() === arTodayLocalDate(now).toDateString();
}

/** Minutos desde la medianoche de Argentina (0..1439). */
export function arNowMinutes(now: number = serverNow()): number {
    const ar = new Date(now - AR_OFFSET_MS);
    return ar.getUTCHours() * 60 + ar.getUTCMinutes();
}
