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

function normalize(name: string): string {
    return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/** Devuelve el ícono del servicio, o un ícono genérico si no hay match. */
export function amenityIcon(name: string): LucideIcon {
    return ICONS[normalize(name)] || Tag;
}
