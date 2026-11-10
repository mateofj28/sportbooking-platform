// ============================================================
// scripts/build-ar-provinces.mjs
//
// Genera public/geo/ar-provinces.json: los límites de las 24 jurisdicciones
// argentinas en un formato compacto, para saber en qué provincia está una
// coordenada SIN mandarla a ningún servicio externo (lib/geo/province-locator.ts).
//
// Fuente: Servicio de Normalización de Datos Geográficos (Georef), límites del IGN.
//   https://infra.datos.gob.ar/georef/provincias.geojson
//   Licencia: Creative Commons Attribution 4.0 (CC BY 4.0) — datos.gob.ar
//
// Uso:
//   node scripts/build-ar-provinces.mjs <ruta-al-provincias.geojson>
//
// Qué hace:
//   - Conserva solo el código ISO 3166-2:AR (iso_id, ej. "AR-X") de cada provincia.
//   - Redondea coordenadas a 4 decimales (~11 m): de sobra para elegir publicidad
//     por provincia y reduce mucho el tamaño.
//   - Quita puntos repetidos tras el redondeo y precalcula el bbox de cada provincia
//     (descarte rápido antes del cálculo punto-en-polígono).
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VALID_CODES = new Set([
    "AR-A", "AR-B", "AR-C", "AR-D", "AR-E", "AR-F", "AR-G", "AR-H",
    "AR-J", "AR-K", "AR-L", "AR-M", "AR-N", "AR-P", "AR-Q", "AR-R",
    "AR-S", "AR-T", "AR-U", "AR-V", "AR-W", "AR-X", "AR-Y", "AR-Z",
]); // = public.ar_province_codes() y lib/ar-provinces.ts

const input = process.argv[2];
if (!input) {
    console.error("Uso: node scripts/build-ar-provinces.mjs <provincias.geojson>");
    process.exit(1);
}

const round = (n) => Math.round(n * 1e4) / 1e4;
const ANTARCTIC_LAT = -60;

/** Anillo [[lon,lat],...] redondeado y sin puntos consecutivos repetidos. */
function cleanRing(ring) {
    const out = [];
    for (const [lon, lat] of ring) {
        const p = [round(lon), round(lat)];
        const last = out[out.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    return out.length >= 4 ? out : null; // un anillo cerrado necesita al menos 4 puntos
}

const geo = JSON.parse(readFileSync(input, "utf8"));
const provinces = [];

for (const f of geo.features) {
    const code = f.properties?.iso_id;
    if (!VALID_CODES.has(code)) throw new Error(`Código de provincia inesperado: ${code}`);

    const g = f.geometry;
    const rawPolygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (!rawPolygons) throw new Error(`Geometría no soportada en ${code}: ${g.type}`);

    // Cada polígono: [anillo exterior, ...huecos]
    const polygons = rawPolygons
        .map((poly) => poly.map(cleanRing).filter(Boolean))
        .filter((poly) => poly.length > 0)
        // Se excluye el sector antártico de Tierra del Fuego (polígonos enteros al sur de
        // los 60° S): ~800 polígonos de costa, la mitad del archivo, sin canchas ni usuarios.
        // Un punto ahí queda "sin provincia" -> solo publicidad nacional.
        .filter((poly) => Math.max(...poly[0].map(([, lat]) => lat)) >= ANTARCTIC_LAT);

    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const poly of polygons) for (const [lon, lat] of poly[0]) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
    }

    provinces.push({ code, bbox: [minLon, minLat, maxLon, maxLat], polygons });
}

if (provinces.length !== VALID_CODES.size) {
    throw new Error(`Se esperaban ${VALID_CODES.size} provincias y llegaron ${provinces.length}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../public/geo/ar-provinces.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
    version: 1,
    source: "Georef / IGN (datos.gob.ar), CC BY 4.0",
    provinces,
}));

const points = provinces.reduce((n, p) => n + p.polygons.reduce((m, poly) => m + poly.reduce((k, r) => k + r.length, 0), 0), 0);
console.log(`OK ${outPath}: ${provinces.length} provincias, ${points} puntos`);
