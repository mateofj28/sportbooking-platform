// ============================================================
// scripts/build-ar-localities.mjs
//
// Genera las "localidades" para segmentar la publicidad a nivel municipal:
//   - Municipios de Georef (incluye los partidos de Buenos Aires y las comunas de CABA).
//   - Santiago del Estero y Santa Cruz no tienen municipios en Georef: ahí se usan sus
//     DEPARTAMENTOS como unidad local, para cubrir todo el país.
//
// Fuente: Servicio de Normalización de Datos Geográficos (Georef), límites del IGN.
//   https://infra.datos.gob.ar/georef/municipios.geojson
//   https://infra.datos.gob.ar/georef/departamentos.geojson
//   Licencia: Creative Commons Attribution 4.0 (CC BY 4.0) — datos.gob.ar
//
// Uso:
//   node scripts/build-ar-localities.mjs <municipios.geojson> <departamentos.geojson>
//
// Salidas:
//   public/geo/ar-localities.json        límites compactos (lib/geo/locality-locator.ts)
//   public/geo/ar-localities-index.json  catálogo liviano para el formulario de publicidad
//   ../supabase/migrations/034_ar_localities.sql  catálogo en la base (validación)
//
// Códigos: "mun-<id Georef>" para municipios y "dep-<id Georef>" para departamentos.
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Id de provincia de Georef -> código ISO 3166-2:AR (= public.ar_province_codes())
const PROVINCE_ISO = {
    "02": "AR-C", "06": "AR-B", "10": "AR-K", "14": "AR-X", "18": "AR-W", "22": "AR-H",
    "26": "AR-U", "30": "AR-E", "34": "AR-P", "38": "AR-Y", "42": "AR-L", "46": "AR-F",
    "50": "AR-M", "54": "AR-N", "58": "AR-Q", "62": "AR-R", "66": "AR-A", "70": "AR-J",
    "74": "AR-D", "78": "AR-Z", "82": "AR-S", "86": "AR-G", "90": "AR-T", "94": "AR-V",
};
// Provincias sin municipios en Georef: se usan sus departamentos
const DEPARTMENT_PROVINCES = new Set(["86", "78"]); // Santiago del Estero, Santa Cruz
const ANTARCTIC_LAT = -60;

const [munPath, depPath] = process.argv.slice(2);
if (!munPath || !depPath) {
    console.error("Uso: node scripts/build-ar-localities.mjs <municipios.geojson> <departamentos.geojson>");
    process.exit(1);
}

const round = (n) => Math.round(n * 1e4) / 1e4;

function cleanRing(ring) {
    const out = [];
    for (const [lon, lat] of ring) {
        const p = [round(lon), round(lat)];
        const last = out[out.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    return out.length >= 4 ? out : null;
}

function shapeOf(feature, code) {
    const g = feature.geometry;
    const raw = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : null;
    if (!raw) throw new Error(`Geometría no soportada en ${code}: ${g?.type}`);
    const polygons = raw
        .map((poly) => poly.map(cleanRing).filter(Boolean))
        .filter((poly) => poly.length > 0)
        .filter((poly) => Math.max(...poly[0].map(([, lat]) => lat)) >= ANTARCTIC_LAT);
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const poly of polygons) for (const [lon, lat] of poly[0]) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
    }
    return { bbox: [minLon, minLat, maxLon, maxLat], polygons };
}

const units = [];
function add(feature, kind) {
    const p = feature.properties;
    const provinceId = p.provincia?.id;
    const province = PROVINCE_ISO[provinceId];
    if (!province) throw new Error(`Provincia desconocida (${provinceId}) en ${p.id} ${p.nombre}`);
    const code = `${kind === "MUNICIPIO" ? "mun" : "dep"}-${p.id}`;
    const shape = shapeOf(feature, code);
    if (shape.polygons.length === 0) return; // íntegramente antártico
    units.push({
        code,
        name: String(p.nombre).trim(),
        category: String(p.categoria ?? (kind === "MUNICIPIO" ? "Municipio" : "Departamento")).trim(),
        province,
        kind,
        ...shape,
    });
}

const mun = JSON.parse(readFileSync(munPath, "utf8"));
for (const f of mun.features) add(f, "MUNICIPIO");

const dep = JSON.parse(readFileSync(depPath, "utf8"));
for (const f of dep.features) if (DEPARTMENT_PROVINCES.has(f.properties.provincia?.id)) add(f, "DEPARTAMENTO");

// Controles
const codes = new Set(units.map((u) => u.code));
if (codes.size !== units.length) throw new Error("Códigos duplicados");
const provincesCovered = new Set(units.map((u) => u.province));
if (provincesCovered.size !== 24) throw new Error(`Faltan provincias: cubiertas ${provincesCovered.size}/24`);

units.sort((a, b) => a.province.localeCompare(b.province) || a.name.localeCompare(b.name, "es"));

const here = dirname(fileURLToPath(import.meta.url));
const geoDir = resolve(here, "../public/geo");
mkdirSync(geoDir, { recursive: true });

// 1. Límites compactos
writeFileSync(resolve(geoDir, "ar-localities.json"), JSON.stringify({
    version: 1,
    source: "Georef / IGN (datos.gob.ar), CC BY 4.0",
    units: units.map(({ code, bbox, polygons }) => ({ code, bbox, polygons })),
}));

// 2. Índice para el formulario
writeFileSync(resolve(geoDir, "ar-localities-index.json"), JSON.stringify(
    units.map(({ code, name, category, province }) => ({ code, name, category, province })),
));

// 3. Migración con el catálogo
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const values = units.map((u) => `  (${sqlStr(u.code)}, ${sqlStr(u.name)}, ${sqlStr(u.category)}, ${sqlStr(u.province)}, ${sqlStr(u.kind)})`).join(",\n");
const sql = `-- SportBooking — Catálogo de localidades para la publicidad municipal
-- Migración: 034_ar_localities.sql
--
-- GENERADO por frontend/scripts/build-ar-localities.mjs (no editar a mano).
-- Fuente: Georef / IGN (datos.gob.ar), CC BY 4.0.
--
-- Unidad local = municipio de Georef (incluye partidos de Buenos Aires y comunas de
-- CABA). En Santiago del Estero y Santa Cruz, que no tienen municipios en Georef, se
-- usan sus departamentos. Total: ${units.length} localidades, las 24 jurisdicciones.
-- Códigos: "mun-<id>" / "dep-<id>". La publicidad (035) solo acepta códigos de acá.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ar_localities (
  code          text PRIMARY KEY,
  name          text NOT NULL,
  category      text NOT NULL,
  province_code text NOT NULL,
  kind          text NOT NULL,
  CONSTRAINT ar_localities_code_format CHECK (code ~ '^(mun|dep)-[0-9]+$'),
  CONSTRAINT ar_localities_province    CHECK (province_code = ANY (public.ar_province_codes())),
  CONSTRAINT ar_localities_kind        CHECK (kind IN ('MUNICIPIO', 'DEPARTAMENTO'))
);

COMMENT ON TABLE public.ar_localities IS
  'Unidades locales para segmentar publicidad (municipios; departamentos en Santiago del Estero y Santa Cruz). Generado desde Georef.';

-- Datos públicos: cualquier usuario autenticado puede leerlos; nadie escribe por la API.
ALTER TABLE public.ar_localities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ar_localities_select" ON public.ar_localities;
CREATE POLICY "ar_localities_select" ON public.ar_localities FOR SELECT TO authenticated USING (true);

INSERT INTO public.ar_localities (code, name, category, province_code, kind) VALUES
${values}
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, category = EXCLUDED.category,
      province_code = EXCLUDED.province_code, kind = EXCLUDED.kind;
`;
writeFileSync(resolve(here, "../../supabase/migrations/034_ar_localities.sql"), sql);

const points = units.reduce((n, u) => n + u.polygons.reduce((m, poly) => m + poly.reduce((k, r) => k + r.length, 0), 0), 0);
const byKind = units.reduce((acc, u) => ((acc[u.kind] = (acc[u.kind] || 0) + 1), acc), {});
console.log(`OK: ${units.length} localidades ${JSON.stringify(byKind)}, ${points} puntos, ${provincesCovered.size} provincias`);
