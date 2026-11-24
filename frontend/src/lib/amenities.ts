import { ArrowRightEndOnRectangleIcon, BeakerIcon, BuildingStorefrontIcon, CakeIcon, CloudIcon, FireIcon, HandRaisedIcon, HomeIcon, HomeModernIcon, LightBulbIcon, ShieldCheckIcon, SparklesIcon, SwatchIcon, TagIcon, TruckIcon, WifiIcon } from "@heroicons/react/24/outline";
import type { IconComponent } from "@/lib/icon-type";

/**
 * Mapea cada servicio (amenity) a su ícono (Heroicons, ver components/icons.ts).
 * Normaliza el nombre (sin acentos, minúsculas) para tolerar variaciones.
 */
const ICONS: Record<string, IconComponent> = {
    vestuarios: ArrowRightEndOnRectangleIcon,
    duchas: SparklesIcon,
    banos: HomeIcon,
    wifi: WifiIcon,
    estacionamiento: TruckIcon,
    parrilla: FireIcon,
    buffet: CakeIcon,
    "iluminacion nocturna": LightBulbIcon,
    "alquiler de pecheras": SwatchIcon,
    cafeteria: BeakerIcon,
    tribunas: HomeModernIcon,
    "aire acondicionado": CloudIcon,
    kiosco: BuildingStorefrontIcon,
    seguridad: ShieldCheckIcon,
    accesible: HandRaisedIcon,
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
export function amenityIcon(name: string): IconComponent {
    return ICONS[normalize(name)] || TagIcon;
}

/** Devuelve el emoji (con forma y color) del servicio, o 🏷️ si no hay match. */
export function amenityEmoji(name: string): string {
    return EMOJIS[normalize(name)] || "🏷️";
}
