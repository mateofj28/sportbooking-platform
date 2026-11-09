import { z } from "zod";
import { PROVINCE_CODES } from "@/lib/ar-provinces";
import {
    AD_LIMITS, AD_MAX_FUTURE_YEARS, AD_THEME_KEYS, arLocalToIso, maxAdDate, todayAr,
} from "@/lib/ads";

/**
 * Validación del formulario de publicidad.
 * Replica los CHECK y el trigger de la tabla advertisements para dar feedback inmediato;
 * la base sigue siendo la que garantiza la integridad (migraciones 015 y 019).
 */

// https://... o ruta interna "/algo". Bloquea javascript:, data:, http:// y //host.
const LINK_REGEX = /^(https:\/\/\S+|\/[^/\s]\S*|\/)$/;

const optionalText = (max: number, label: string) =>
    z
        .string()
        .trim()
        .max(max, `${label}: máximo ${max} caracteres`);

/** Valores con los que se abrió el formulario ("" si estaba vacío). */
export interface AdDatesBaseline {
    startsAt: string;
    endsAt: string;
}

/**
 * Esquema del formulario. Recibe los valores de fecha originales porque la regla de
 * "no en el pasado" solo se exige sobre valores NUEVOS o MODIFICADOS: así se puede seguir
 * editando o pausando un anuncio que ya empezó o ya venció sin que lo bloquee una fecha
 * vieja que no se tocó (misma lógica que el trigger de la base).
 */
export function createAdvertisementSchema(baseline: AdDatesBaseline = { startsAt: "", endsAt: "" }) {
    return z
        .object({
            title: z
                .string()
                .trim()
                .min(1, "El título es obligatorio")
                .max(AD_LIMITS.title, `Máximo ${AD_LIMITS.title} caracteres`),
            subtitle: optionalText(AD_LIMITS.subtitle, "Subtítulo"),
            description: optionalText(AD_LIMITS.description, "Descripción"),
            theme: z.enum(AD_THEME_KEYS as [string, ...string[]]),
            linkUrl: z
                .string()
                .trim()
                .max(AD_LIMITS.link, `Máximo ${AD_LIMITS.link} caracteres`)
                .refine((v) => v === "" || LINK_REGEX.test(v), "Debe empezar con https:// o con / (ruta interna)"),
            ctaLabel: optionalText(AD_LIMITS.cta, "Texto del botón"),
            scope: z.enum(["NATIONAL", "REGIONAL"]),
            provinces: z.array(z.enum(PROVINCE_CODES)),
            priority: z
                .number({ message: "La prioridad debe ser un número" })
                .int("Debe ser un número entero")
                .min(AD_LIMITS.priorityMin, `Mínimo ${AD_LIMITS.priorityMin}`)
                .max(AD_LIMITS.priorityMax, `Máximo ${AD_LIMITS.priorityMax}`),
            // "YYYY-MM-DDTHH:mm" en hora de Argentina ("" = sin límite)
            startsAt: z.string(),
            endsAt: z.string(),
            isActive: z.boolean(),
        })
        .superRefine((v, ctx) => {
            if (v.scope === "REGIONAL" && v.provinces.length === 0) {
                ctx.addIssue({ code: "custom", path: ["provinces"], message: "Elegí al menos una provincia" });
            }
            if (v.ctaLabel && !v.linkUrl) {
                ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "El botón necesita un enlace de destino" });
            }

            const now = new Date();
            const today = todayAr(now);
            const maxDate = maxAdDate(now);
            const tope = `No puede superar los ${AD_MAX_FUTURE_YEARS} años desde hoy`;

            const s = arLocalToIso(v.startsAt);
            const e = arLocalToIso(v.endsAt);

            if (v.startsAt) {
                if (s === null) {
                    ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Fecha de inicio inválida" });
                } else {
                    const day = v.startsAt.slice(0, 10);
                    if (v.startsAt !== baseline.startsAt && day < today) {
                        ctx.addIssue({ code: "custom", path: ["startsAt"], message: "El inicio no puede ser anterior a hoy" });
                    } else if (day > maxDate) {
                        ctx.addIssue({ code: "custom", path: ["startsAt"], message: tope });
                    }
                }
            }

            if (v.endsAt) {
                if (e === null) {
                    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Fecha de fin inválida" });
                } else {
                    const day = v.endsAt.slice(0, 10);
                    if (v.endsAt !== baseline.endsAt && new Date(e) <= now) {
                        ctx.addIssue({ code: "custom", path: ["endsAt"], message: "El fin debe ser una fecha y hora futuras" });
                    } else if (day > maxDate) {
                        ctx.addIssue({ code: "custom", path: ["endsAt"], message: tope });
                    }
                }
            }

            if (s && e && new Date(e) <= new Date(s)) {
                ctx.addIssue({ code: "custom", path: ["endsAt"], message: "El fin debe ser posterior al inicio" });
            }
        });
}

export type AdvertisementFormData = z.infer<ReturnType<typeof createAdvertisementSchema>>;

export const EMPTY_AD_FORM: AdvertisementFormData = {
    title: "",
    subtitle: "",
    description: "",
    theme: "blue",
    linkUrl: "",
    ctaLabel: "",
    scope: "NATIONAL",
    provinces: [],
    priority: 50,
    startsAt: "",
    endsAt: "",
    isActive: true,
};
