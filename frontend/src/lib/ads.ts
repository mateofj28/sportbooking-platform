// ============================================================
// lib/ads.ts
// Tipos y utilidades de la publicidad: nacional o por municipio (localidad).
// Las reglas de negocio (qué ve cada cliente) viven en la base:
// RPC get_active_advertisements (migración 035). Aquí solo hay presentación
// y utilidades para el panel de gestión.
// ============================================================

import type { LocalityInfo } from "@/lib/geo/locality-locator";
import { provinceName } from "@/lib/ar-provinces";

/** NATIONAL = todo el país. LOCAL = solo en los municipios elegidos. */
export type AdScope = "NATIONAL" | "LOCAL";

/** Máximo de municipios por publicidad (igual que el CHECK ads_scope_localities). Córdoba tiene 427. */
export const AD_MAX_LOCALITIES = 500;
export type AdStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "PAUSED";

/** Límites: deben coincidir con los CHECK de la tabla advertisements (migración 042). */
export const AD_LIMITS = {
    title: 80,
    alt: 150,
    link: 500,
    priorityMin: 0,
    priorityMax: 100,
} as const;

/**
 * Medidas de los banners. La imagen se muestra entera en un recuadro de esa proporción,
 * así que se exige la proporción (con un margen) y un ancho mínimo para que se vea nítida.
 * Archivo: JPG, PNG o WebP de hasta 2 MB (límite del bucket "ads").
 */
export const AD_IMAGE_SPECS = {
    desktop: { label: "computadora", width: 1920, height: 400, minWidth: 1200 },
    mobile: { label: "celular", width: 1080, height: 540, minWidth: 600 },
} as const;
export type AdImageKind = keyof typeof AD_IMAGE_SPECS;
export const AD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Margen aceptado sobre la proporción (10%). */
const AD_RATIO_TOLERANCE = 0.1;

/** Valida las medidas de un banner. null = válida; si no, el mensaje para el usuario. */
export function checkAdImageSize(kind: AdImageKind, width: number, height: number): string | null {
    const spec = AD_IMAGE_SPECS[kind];
    const target = spec.width / spec.height;
    const ratio = width / height;
    if (Math.abs(ratio - target) / target > AD_RATIO_TOLERANCE) {
        return `La imagen para ${spec.label} debe medir ${spec.width} × ${spec.height} px (o la misma proporción). La tuya mide ${width} × ${height} px.`;
    }
    if (width < spec.minWidth) {
        return `La imagen para ${spec.label} es muy chica (${width} px de ancho): se vería borrosa. Usá al menos ${spec.minWidth} px de ancho; lo ideal es ${spec.width} × ${spec.height} px.`;
    }
    return null;
}

/** Anuncio completo, tal como lo ve el admin. */
export interface Advertisement {
    id: string;
    /** Nombre interno (solo panel). */
    title: string;
    /** Qué dice la imagen (lectores de pantalla). */
    altText: string;
    imageUrl: string;
    imageMobileUrl: string | null;
    linkUrl: string | null;
    scope: AdScope;
    /** Códigos de localidad ("mun-<id>" / "dep-<id>"). Vacío si es nacional. */
    localities: string[];
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
    altText: string;
    imageUrl: string;
    imageMobileUrl: string | null;
    linkUrl: string | null;
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

/** "Rosario (Santa Fe)" — nombre legible de una localidad. */
export function localityLabel(code: string, index?: Map<string, LocalityInfo>): string {
    const l = index?.get(code);
    return l ? `${l.name} (${provinceName(l.province)})` : code;
}

/** "Todo el país" | "Rosario (Santa Fe)" | "Rosario (Santa Fe) y 3 más" (resumen corto para tablas). */
export function describeTargeting(ad: Pick<Advertisement, "scope" | "localities">, index?: Map<string, LocalityInfo>): string {
    if (ad.scope === "NATIONAL") return "Todo el país";
    const [first, ...rest] = ad.localities;
    if (!first) return "Sin municipios";
    return rest.length ? `${localityLabel(first, index)} y ${rest.length} más` : localityLabel(first, index);
}

// ---------- Fechas en hora de Argentina (UTC-3, sin horario de verano) ----------

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hasta cuántos años hacia adelante se puede programar una publicidad (igual que la base, migración 019). */
export const AD_MAX_FUTURE_YEARS = 2;

/** Hoy en Argentina como "YYYY-MM-DD" (no depende de la zona horaria del navegador). */
export function todayAr(now: Date = new Date()): string {
    return new Date(now.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Suma (o resta) años a un "YYYY-MM-DD".
 *
 * Si el día no existe en el año destino (29/02 en un año no bisiesto) se ajusta al
 * ÚLTIMO día de ese mes (28/02), igual que Postgres con `date ± interval 'N years'`.
 * Así los topes del selector coinciden con los que valida la base (migraciones 019 y 023);
 * con el desborde nativo de JS (29/02 -> 01/03) la pantalla ofrecería un día que la base
 * rechaza, o bloquearía uno que la base acepta.
 */
export function addYearsToDate(date: string, years: number): string {
    const [y, m, d] = date.split("-").map(Number);
    const targetYear = y + years;
    // Día 0 del mes siguiente = último día del mes destino
    const lastDayOfMonth = new Date(Date.UTC(targetYear, m, 0)).getUTCDate();
    return new Date(Date.UTC(targetYear, m - 1, Math.min(d, lastDayOfMonth))).toISOString().slice(0, 10);
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
