import {
    DoorOpen, ShowerHead, Toilet, Wifi, ParkingSquare, Flame,
    UtensilsCrossed, Lightbulb, Shirt, Coffee, Armchair, Snowflake,
    Store, ShieldCheck, Accessibility, Tag, type LucideIcon,
} from "lucide-react";

/**
 * Mapea cada servicio (amenity) a su ícono de lucide-react.
 * Normaliza el nombre (sin acentos, minúsculas) para tolerar variaciones.
 */
const ICONS: Record<string, LucideIcon> = {
    vestuarios: DoorOpen,
    duchas: ShowerHead,
    banos: Toilet,
    wifi: Wifi,
    estacionamiento: ParkingSquare,
    parrilla: Flame,
    buffet: UtensilsCrossed,
    "iluminacion nocturna": Lightbulb,
    "alquiler de pecheras": Shirt,
    cafeteria: Coffee,
    tribunas: Armchair,
    "aire acondicionado": Snowflake,
    kiosco: Store,
    seguridad: ShieldCheck,
    accesible: Accessibility,
};

/**
 * Emoji con forma y color para cada servicio (amenity).
 * Mismas claves normalizadas que ICONS.
 */
const EMOJIS: Record<string, string> = {
    vestuarios: "🚪",
    duchas: "🚿",
    banos: "🚻",
    wifi: "📶",
    estacionamiento: "🅿️",
    parrilla: "🔥",
    buffet: "🍔",
    "iluminacion nocturna": "💡",
    "alquiler de pecheras": "🎽",
    cafeteria: "☕",
    tribunas: "🪑",
    "aire acondicionado": "❄️",
    kiosco: "🏪",
    seguridad: "🛡️",
    accesible: "♿",
};

function normalize(name: string): string {
    return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Devuelve el ícono del servicio, o un ícono genérico si no hay match. */
export function amenityIcon(name: string): LucideIcon {
    return ICONS[normalize(name)] || Tag;
}

/** Devuelve el emoji (con forma y color) del servicio, o 🏷️ si no hay match. */
export function amenityEmoji(name: string): string {
    return EMOJIS[normalize(name)] || "🏷️";
}
