// ============================================================
// lib/navigation.ts
// ÚNICA lista de secciones de la vista de cliente. La leen:
//   - celular: la barra de abajo (las de `tab`) y la hoja "Más" (las de `group`);
//   - computadora: el menú del avatar (las de `group`, más Mis Reservas y Mi billetera).
//
// Para sumar una sección (ej. "Escuela de fútbol"): poner su `href` y `available: true`.
// Aparece sola en "Más" (celular) y en el menú del avatar (computadora).
// Las que tienen `available: false` todavía no existen y no se muestran.
// ============================================================

import {
    AcademicCapIcon, BellIcon, CalendarIcon, ChartBarIcon, FireIcon, HomeIcon, MapPinIcon, UserIcon, WalletIcon,
} from "@heroicons/react/24/outline";
import {
    CalendarIcon as CalendarSolid, HomeIcon as HomeSolid, MapPinIcon as MapPinSolid, WalletIcon as WalletSolid,
} from "@heroicons/react/24/solid";
import type { IconComponent } from "@/lib/icon-type";

export type NavRole = "CLIENT" | "ADMIN" | "VENUE_ADMIN";
export type NavGroupKey = "account" | "activity";

export interface NavSection {
    key: string;
    label: string;
    href: string;
    icon: IconComponent;
    /** Ícono relleno para la sección actual (pestañas de la barra de abajo). */
    activeIcon?: IconComponent;
    /** Va en la barra de abajo del celular (máximo 4: la quinta es "Más"). */
    tab?: boolean;
    /** Grupo dentro de "Más" (celular) y del menú del avatar (computadora). */
    group?: NavGroupKey;
    /** Quién la ve. Sin valor: todos los usuarios con sesión. */
    roles?: NavRole[];
    /** false = todavía no existe: no se muestra en ningún menú. */
    available: boolean;
    /** Rutas que cuentan como esta sección (por defecto, href y sus subrutas). */
    match?: (path: string) => boolean;
}

export const NAV_GROUPS: { key: NavGroupKey; label: string }[] = [
    { key: "account", label: "Mi cuenta" },
    { key: "activity", label: "Actividad" },
];

export const NAV_SECTIONS: NavSection[] = [
    // Barra de abajo (celular)
    { key: "inicio", label: "Inicio", href: "/inicio", icon: HomeIcon, activeIcon: HomeSolid, tab: true, available: true, match: (p) => p === "/inicio" },
    { key: "canchas", label: "Canchas", href: "/facilities", icon: MapPinIcon, activeIcon: MapPinSolid, tab: true, available: true },
    { key: "reservas", label: "Mis reservas", href: "/bookings", icon: CalendarIcon, activeIcon: CalendarSolid, tab: true, available: true },
    { key: "billetera", label: "Billetera", href: "/wallet", icon: WalletIcon, activeIcon: WalletSolid, tab: true, available: true },

    // "Más" -> Mi cuenta
    { key: "perfil", label: "Mi Perfil", href: "/profile", icon: UserIcon, group: "account", available: true },
    // Por ahora las notificaciones in-app son solo de los administradores
    { key: "notificaciones", label: "Notificaciones", href: "/dashboard/notifications", icon: BellIcon, group: "account", roles: ["ADMIN", "VENUE_ADMIN"], available: true },

    // "Más" -> Actividad (todavía no existen: poner href y available: true cuando estén)
    { key: "estadisticas", label: "Estadísticas", href: "/estadisticas", icon: ChartBarIcon, group: "activity", available: false },
    { key: "entrenamientos", label: "Entrenamientos", href: "/entrenamientos", icon: FireIcon, group: "activity", available: false },
    { key: "escuela", label: "Escuela de fútbol", href: "/escuela-de-futbol", icon: AcademicCapIcon, group: "activity", available: false },
];

/** Desde cuántas opciones la hoja "Más" muestra un buscador. */
export const MORE_SEARCH_FROM = 9;

function visibleFor(s: NavSection, role: string | undefined): boolean {
    return s.available && (!s.roles || s.roles.includes((role ?? "CLIENT") as NavRole));
}

/** ¿La ruta actual pertenece a esta sección? */
export function isSectionActive(s: NavSection, path: string): boolean {
    return s.match ? s.match(path) : path === s.href || path.startsWith(s.href + "/");
}

/** Pestañas de la barra de abajo (sin "Más"). */
export function tabSections(role: string | undefined): NavSection[] {
    return NAV_SECTIONS.filter((s) => s.tab && visibleFor(s, role));
}

/** Secciones de "Más" / menú del avatar, agrupadas y sin grupos vacíos. */
export function groupedSections(role: string | undefined): { key: NavGroupKey; label: string; items: NavSection[] }[] {
    return NAV_GROUPS
        .map((g) => ({ ...g, items: NAV_SECTIONS.filter((s) => s.group === g.key && visibleFor(s, role)) }))
        .filter((g) => g.items.length > 0);
}
