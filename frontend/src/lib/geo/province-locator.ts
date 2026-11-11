// ============================================================
// lib/geo/province-locator.ts
//
// ¿En qué provincia argentina está una coordenada? Se resuelve EN EL NAVEGADOR
// con los límites oficiales (public/geo/ar-provinces.json, generado por
// scripts/build-ar-provinces.mjs desde Georef / IGN, CC BY 4.0).
//
// Privacidad: las coordenadas nunca salen del dispositivo. A la base solo viaja
// el código de provincia (ej. "AR-X"), que es lo único que necesita la publicidad.
// ============================================================

import { isProvinceCode } from "@/lib/ar-provinces";

export type Ring = [number, number][]; // [lon, lat]
export type Polygon = Ring[];          // [exterior, ...huecos]

interface ProvinceShape {
    code: string;
    bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
    polygons: Polygon[];
}

const DATA_URL = "/geo/ar-provinces.json";

let shapesPromise: Promise<ProvinceShape[]> | null = null;

/** Descarga los límites una sola vez por sesión (y solo cuando hace falta). */
function loadShapes(): Promise<ProvinceShape[]> {
    if (!shapesPromise) {
        shapesPromise = fetch(DATA_URL)
            .then((res) => {
                if (!res.ok) throw new Error(`No se pudieron cargar los límites (${res.status})`);
                return res.json();
            })
            .then((data: { provinces: ProvinceShape[] }) => data.provinces)
            .catch((e) => {
                shapesPromise = null; // permitir reintentar más tarde
                throw e;
            });
    }
    return shapesPromise;
}

/** Ray casting: ¿el punto cae dentro del anillo? */
function inRing(lon: number, lat: number, ring: Ring): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/** Dentro del exterior y fuera de todos los huecos. (Exportada: la usa locality-locator.) */
export function inPolygon(lon: number, lat: number, polygon: Polygon): boolean {
    if (!inRing(lon, lat, polygon[0])) return false;
    for (let h = 1; h < polygon.length; h++) if (inRing(lon, lat, polygon[h])) return false;
    return true;
}

/** Busca en una lista ya cargada (exportada para pruebas). */
export function findProvince(shapes: ProvinceShape[], lat: number, lon: number): string | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    for (const p of shapes) {
        const [minLon, minLat, maxLon, maxLat] = p.bbox;
        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
        if (p.polygons.some((poly) => inPolygon(lon, lat, poly))) {
            return isProvinceCode(p.code) ? p.code : null;
        }
    }
    // Fuera de Argentina, en el mar, o justo en un borde simplificado
    return null;
}

/**
 * Distancia (km) por debajo de la cual un punto que no cae en ninguna provincia se
 * considera "pegado al límite" (costa o borde simplificado, o una ciudad limítrofe
 * cruzando un río) y no "en otro país". La simplificación de los límites tiene un
 * error muy inferior a esto.
 */
const NEAR_KM = 5;
const KM_PER_DEG_LAT = 111.32;

/** Distancia aproximada (km) de un punto a un segmento, proyectando en un plano local. */
function distToSegmentKm(lat: number, lon: number, a: [number, number], b: [number, number]): number {
    const kx = KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180); // km por grado de longitud a esta latitud
    const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * KM_PER_DEG_LAT;
    const bx = (b[0] - lon) * kx, by = (b[1] - lat) * KM_PER_DEG_LAT;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const px = ax + t * dx, py = ay + t * dy;
    return Math.sqrt(px * px + py * py);
}

/**
 * ¿El punto está a menos de NEAR_KM de alguna provincia? (exportada para pruebas)
 * Solo se miden las provincias cuyo rectángulo, agrandado por el margen, contiene el punto.
 */
export function isNearArgentina(shapes: ProvinceShape[], lat: number, lon: number): boolean {
    const marginLat = NEAR_KM / KM_PER_DEG_LAT;
    const marginLon = NEAR_KM / (KM_PER_DEG_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
    for (const p of shapes) {
        const [minLon, minLat, maxLon, maxLat] = p.bbox;
        if (lon < minLon - marginLon || lon > maxLon + marginLon || lat < minLat - marginLat || lat > maxLat + marginLat) continue;
        for (const poly of p.polygons) {
            const ring = poly[0];
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                if (distToSegmentKm(lat, lon, ring[j], ring[i]) <= NEAR_KM) return true;
            }
        }
    }
    return false;
}

export interface LocateResult {
    /** Código ISO 3166-2:AR, o null si el punto no cae en ninguna provincia. */
    province: string | null;
    /**
     * true si el punto está lejos de Argentina (otro país): no tiene sentido usar la IP.
     * false si está dentro o cerca del territorio (un borde/costa simplificado o un país
     * limítrofe pegado a la frontera): ahí la IP puede desempatar.
     */
    abroad: boolean;
}

/** Provincia en la que está la coordenada, y si está claramente fuera del país. */
export async function locate(lat: number, lon: number): Promise<LocateResult> {
    const shapes = await loadShapes();
    const province = findProvince(shapes, lat, lon);
    return { province, abroad: province === null && !isNearArgentina(shapes, lat, lon) };
}

/**
 * Código ISO 3166-2:AR de la provincia en la que está la coordenada,
 * o null si no cae en ninguna (fuera del país, en el agua, Antártida).
 */
export async function provinceAt(lat: number, lon: number): Promise<string | null> {
    return (await locate(lat, lon)).province;
}
