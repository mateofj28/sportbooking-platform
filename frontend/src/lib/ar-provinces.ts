// ============================================================
// lib/ar-provinces.ts
// Catálogo estático de provincias argentinas (ISO 3166-2:AR).
//
// Por qué estático y no la API Georef:
//  - El código (AR-X) es el valor que se guarda en la base y en la
//    segmentación de publicidad: tiene que ser estable y no depender
//    de que una API externa esté disponible.
//  - Las 24 jurisdicciones no cambian.
// Debe coincidir con public.ar_province_codes() en la base (migración 015).
// ============================================================

export interface ProvinceOption {
    /** Código ISO 3166-2:AR, ej. "AR-X". Es lo que se persiste. */
    code: string;
    /** Nombre para mostrar. */
    name: string;
}

/** Las 24 jurisdicciones, ordenadas alfabéticamente por nombre. */
export const PROVINCES: readonly ProvinceOption[] = [
    { code: "AR-B", name: "Buenos Aires" },
    { code: "AR-K", name: "Catamarca" },
    { code: "AR-H", name: "Chaco" },
    { code: "AR-U", name: "Chubut" },
    { code: "AR-C", name: "Ciudad Autónoma de Buenos Aires" },
    { code: "AR-X", name: "Córdoba" },
    { code: "AR-W", name: "Corrientes" },
    { code: "AR-E", name: "Entre Ríos" },
    { code: "AR-P", name: "Formosa" },
    { code: "AR-Y", name: "Jujuy" },
    { code: "AR-L", name: "La Pampa" },
    { code: "AR-F", name: "La Rioja" },
    { code: "AR-M", name: "Mendoza" },
    { code: "AR-N", name: "Misiones" },
    { code: "AR-Q", name: "Neuquén" },
    { code: "AR-R", name: "Río Negro" },
    { code: "AR-A", name: "Salta" },
    { code: "AR-J", name: "San Juan" },
    { code: "AR-D", name: "San Luis" },
    { code: "AR-Z", name: "Santa Cruz" },
    { code: "AR-S", name: "Santa Fe" },
    { code: "AR-G", name: "Santiago del Estero" },
    { code: "AR-V", name: "Tierra del Fuego" },
    { code: "AR-T", name: "Tucumán" },
];

const BY_CODE = new Map(PROVINCES.map((p) => [p.code, p.name]));

/** Códigos válidos (para validación con Zod). */
export const PROVINCE_CODES = PROVINCES.map((p) => p.code) as [string, ...string[]];

export function isProvinceCode(value: unknown): value is string {
    return typeof value === "string" && BY_CODE.has(value);
}

/** "AR-X" -> "Córdoba". Si el código no existe devuelve el mismo valor. */
export function provinceName(code: string | null | undefined): string {
    if (!code) return "";
    return BY_CODE.get(code) ?? code;
}
