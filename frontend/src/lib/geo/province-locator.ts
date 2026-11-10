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

type Ring = [number, number][]; // [lon, lat]
type Polygon = Ring[];          // [exterior, ...huecos]

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

/** Dentro del exterior y fuera de todos los huecos. */
function inPolygon(lon: number, lat: number, polygon: Polygon): boolean {
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
 * Código ISO 3166-2:AR de la provincia en la que está la coordenada,
 * o null si no cae en ninguna (fuera del país, en el agua, Antártida).
 */
export async function provinceAt(lat: number, lon: number): Promise<string | null> {
    return findProvince(await loadShapes(), lat, lon);
}
