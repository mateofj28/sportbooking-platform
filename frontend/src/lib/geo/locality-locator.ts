// ============================================================
// lib/geo/locality-locator.ts
//
// ¿En qué localidad (municipio) está una coordenada? Se resuelve EN EL NAVEGADOR con
// los límites oficiales (public/geo/ar-localities.json, generado por
// scripts/build-ar-localities.mjs desde Georef / IGN, CC BY 4.0).
//
// Localidad = municipio (incluye partidos de Buenos Aires y comunas de CABA); en
// Santiago del Estero y Santa Cruz, departamento. Código "mun-<id>" / "dep-<id>".
//
// Privacidad: las coordenadas nunca salen del dispositivo. A la base solo viaja el
// código de la localidad, que es lo único que necesita la publicidad.
// ============================================================

import { inPolygon, locate as locateProvince, type Polygon } from "@/lib/geo/province-locator";

interface LocalityShape {
    code: string;
    bbox: [number, number, number, number];
    polygons: Polygon[];
}

export interface LocalityInfo {
    code: string;
    name: string;
    category: string;
    /** Código ISO 3166-2:AR de su provincia. */
    province: string;
}

const SHAPES_URL = "/geo/ar-localities.json";
const INDEX_URL = "/geo/ar-localities-index.json";
const LOCALITY_CODE = /^(mun|dep)-\d+$/;

export function isLocalityCode(value: unknown): value is string {
    return typeof value === "string" && LOCALITY_CODE.test(value);
}

let shapesPromise: Promise<LocalityShape[]> | null = null;
let indexPromise: Promise<Map<string, LocalityInfo>> | null = null;

function loadJson<T>(url: string): Promise<T> {
    return fetch(url).then((res) => {
        if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
        return res.json() as Promise<T>;
    });
}

function loadShapes(): Promise<LocalityShape[]> {
    if (!shapesPromise) {
        shapesPromise = loadJson<{ units: LocalityShape[] }>(SHAPES_URL)
            .then((d) => d.units)
            .catch((e) => { shapesPromise = null; throw e; });
    }
    return shapesPromise;
}

/** Catálogo (código -> nombre, categoría y provincia). Se usa en el formulario y para mostrar nombres. */
export function loadLocalityIndex(): Promise<Map<string, LocalityInfo>> {
    if (!indexPromise) {
        indexPromise = loadJson<LocalityInfo[]>(INDEX_URL)
            .then((list) => new Map(list.map((l) => [l.code, l])))
            .catch((e) => { indexPromise = null; throw e; });
    }
    return indexPromise;
}

/** Busca en una lista ya cargada (exportada para pruebas). */
export function findLocality(shapes: LocalityShape[], lat: number, lon: number): string | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    for (const s of shapes) {
        const [minLon, minLat, maxLon, maxLat] = s.bbox;
        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
        if (s.polygons.some((poly) => inPolygon(lon, lat, poly))) return s.code;
    }
    return null;
}

export interface LocalityResult {
    /** Localidad en la que está el punto, o null si no cae en ninguna. */
    locality: LocalityInfo | null;
    /** Provincia (ISO) aunque no caiga en una localidad (ej. zona rural). */
    province: string | null;
    /** true si está claramente fuera de Argentina. */
    abroad: boolean;
}

/** Localidad (y provincia) de una coordenada. */
export async function locateLocality(lat: number, lon: number): Promise<LocalityResult> {
    const shapes = await loadShapes();
    const code = findLocality(shapes, lat, lon);
    if (code) {
        const info = (await loadLocalityIndex()).get(code) ?? null;
        return { locality: info, province: info?.province ?? null, abroad: false };
    }
    // No cae en ninguna localidad: ¿zona rural dentro de una provincia, o fuera del país?
    const p = await locateProvince(lat, lon);
    return { locality: null, province: p.province, abroad: p.abroad };
}
