// ============================================================
// lib/ads.ts
// Tipos y utilidades de la publicidad segmentada por provincia.
// Las reglas de negocio (qué ve cada cliente) viven en la base:
// RPC get_active_advertisements. Aquí solo hay presentación y
// utilidades para el panel de gestión.
// ============================================================

import { provinceName } from "@/lib/ar-provinces";

export type AdTheme = "blue" | "emerald" | "violet" | "orange" | "rose" | "slate";
export type AdScope = "NATIONAL" | "REGIONAL";
export type AdStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "PAUSED";

/**
 * Paletas predefinidas. El admin elige un nombre, nunca CSS libre:
 * evita estilos rotos o inyectados y garantiza contraste con texto blanco.
 * Las clases son literales completas para que Tailwind las detecte.
 */
export const AD_THEMES: Record<AdTheme, { label: string; gradient: string; swatch: string }> = {
    blue: { label: "Azul", gradient: "from-blue-500 to-blue-700", swatch: "bg-blue-600" },
    emerald: { label: "Verde", gradient: "from-emerald-500 to-emerald-700", swatch: "bg-emerald-600" },
    violet: { label: "Violeta", gradient: "from-violet-500 to-violet-700", swatch: "bg-violet-600" },
    orange: { label: "Naranja", gradient: "from-orange-500 to-orange-700", swatch: "bg-orange-600" },
    rose: { label: "Rosa", gradient: "from-rose-500 to-rose-700", swatch: "bg-rose-600" },
    slate: { label: "Gris oscuro", gradient: "from-slate-600 to-slate-800", swatch: "bg-slate-700" },
};

export const AD_THEME_KEYS = Object.keys(AD_THEMES) as AdTheme[];

export function adGradient(theme: string): string {
    return (AD_THEMES[theme as AdTheme] ?? AD_THEMES.blue).gradient;
}

/** Límites: deben coincidir con los CHECK de la tabla advertisements. */
export const AD_LIMITS = {
    title: 80,
    subtitle: 60,
    description: 200,
    cta: 24,
    link: 500,
    priorityMin: 0,
    priorityMax: 100,
} as const;

/** Anuncio completo, tal como lo ve el admin. */
export interface Advertisement {
    id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    theme: AdTheme;
    linkUrl: string | null;
    ctaLabel: string | null;
    scope: AdScope;
    provinces: string[];
    priority: number;
    startsAt: string | null;
    endsAt: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

/** Lo que devuelve la RPC al cliente (solo columnas públicas). */
export interface ActiveAdvertisement {
    id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    theme: AdTheme;
    linkUrl: string | null;
    ctaLabel: string | null;
    scope: AdScope;
}

/** Estado de vigencia (mismo criterio que la RPC: inicio <= ahora < fin). */
export function getAdStatus(
    ad: Pick<Advertisement, "isActive" | "startsAt" | "endsAt">,
    now: Date = new Date(),
): AdStatus {
    if (!ad.isActive) return "PAUSED";
    if (ad.endsAt && new Date(ad.endsAt) <= now) return "EXPIRED";
    if (ad.startsAt && new Date(ad.startsAt) > now) return "SCHEDULED";
    return "ACTIVE";
}

export const AD_STATUS_META: Record<AdStatus, { label: string; color: "success" | "warning" | "default" | "danger" }> = {
    ACTIVE: { label: "Activa", color: "success" },
    SCHEDULED: { label: "Programada", color: "warning" },
    EXPIRED: { label: "Vencida", color: "danger" },
    PAUSED: { label: "Pausada", color: "default" },
};

/** "Todo el país" | "Córdoba" | "Córdoba, Santa Fe" (resumen corto para tablas). */
export function describeTargeting(ad: Pick<Advertisement, "scope" | "provinces">): string {
    if (ad.scope === "NATIONAL") return "Todo el país";
    return ad.provinces.map(provinceName).join(", ");
}

// ---------- Fechas en hora de Argentina (UTC-3, sin horario de verano) ----------

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hasta cuántos años hacia adelante se puede programar una publicidad (igual que la base, migración 019). */
export const AD_MAX_FUTURE_YEARS = 2;

/** Hoy en Argentina como "YYYY-MM-DD" (no depende de la zona horaria del navegador). */
export function todayAr(now: Date = new Date()): string {
    return new Date(now.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Suma años a un "YYYY-MM-DD". El 29/02 cae en el 01/03 si el año destino no es bisiesto. */
export function addYearsToDate(date: string, years: number): string {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

/** Día máximo programable, "YYYY-MM-DD". */
export function maxAdDate(now: Date = new Date()): string {
    return addYearsToDate(todayAr(now), AD_MAX_FUTURE_YEARS);
}

/**
 * Valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"), interpretado
 * como hora de Argentina -> ISO UTC. Vacío o inválido -> null.
 */
export function arLocalToIso(local: string): string | null {
    // El parser de Date de JS es permisivo con texto basura: se exige el formato exacto
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
    const d = new Date(`${local}:00-03:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO UTC -> "YYYY-MM-DDTHH:mm" en hora de Argentina, para <input type="datetime-local">. */
export function isoToArLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(new Date(iso).getTime() - AR_OFFSET_MS);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

/** "9 nov 2026, 20:30" en hora AR. */
export function formatAdDate(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

/** Resumen de vigencia para tablas. */
export function describeSchedule(ad: Pick<Advertisement, "startsAt" | "endsAt">): string {
    if (!ad.startsAt && !ad.endsAt) return "Sin límite";
    if (ad.startsAt && !ad.endsAt) return `Desde ${formatAdDate(ad.startsAt)}`;
    if (!ad.startsAt && ad.endsAt) return `Hasta ${formatAdDate(ad.endsAt)}`;
    return `${formatAdDate(ad.startsAt)} → ${formatAdDate(ad.endsAt)}`;
}
