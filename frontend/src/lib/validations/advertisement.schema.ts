import { z } from "zod";
import { PROVINCE_CODES } from "@/lib/ar-provinces";
import { AD_LIMITS, AD_THEME_KEYS, arLocalToIso } from "@/lib/ads";

/**
 * Validación del formulario de publicidad.
 * Replica los CHECK de la tabla advertisements para dar feedback inmediato;
 * la base sigue siendo la que garantiza la integridad.
 */

// https://... o ruta interna "/algo". Bloquea javascript:, data:, http:// y //host.
const LINK_REGEX = /^(https:\/\/\S+|\/[^/\s]\S*|\/)$/;

const optionalText = (max: number, label: string) =>
    z
        .string()
        .trim()
        .max(max, `${label}: máximo ${max} caracteres`);

export const advertisementSchema = z
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
        // datetime-local en hora de Argentina ("" = sin límite)
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
        if (v.startsAt && arLocalToIso(v.startsAt) === null) {
            ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Fecha de inicio inválida" });
        }
        if (v.endsAt && arLocalToIso(v.endsAt) === null) {
            ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Fecha de fin inválida" });
        }
        const s = arLocalToIso(v.startsAt);
        const e = arLocalToIso(v.endsAt);
        if (s && e && new Date(e) <= new Date(s)) {
            ctx.addIssue({ code: "custom", path: ["endsAt"], message: "El fin debe ser posterior al inicio" });
        }
    });

export type AdvertisementFormData = z.infer<typeof advertisementSchema>;

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
