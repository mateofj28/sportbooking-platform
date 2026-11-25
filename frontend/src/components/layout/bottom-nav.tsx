"use client";

// ============================================================
// components/layout/bottom-nav.tsx
// Barra de navegación fija abajo (vista de cliente, solo en celular: < 640 px).
// Inicio · Canchas · Mis reservas · Billetera · Perfil
// - Un toque a cada sección y al alcance del pulgar; la sección actual va en azul.
// - "Perfil" abre una hoja desde abajo con Mi Perfil, Tema, Panel de administración
//   (si es admin) y Cerrar sesión: en celular reemplaza al menú del avatar.
// - La monta el Navbar (fuera del panel y con sesión). El espacio que ocupa se reserva con
//   el atributo data-bottom-nav (ver globals.css), así ninguna pantalla queda tapada.
// ============================================================

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Modal, ModalBody, ModalContent, useDisclosure } from "@heroui/react";
import {
    ArrowRightStartOnRectangleIcon, CalendarIcon, CheckIcon, HomeIcon, MapPinIcon, MoonIcon,
    Squares2X2Icon, SunIcon, UserCircleIcon, UserIcon, WalletIcon,
} from "@heroicons/react/24/outline";
import {
    CalendarIcon as CalendarSolid, HomeIcon as HomeSolid, MapPinIcon as MapPinSolid,
    UserCircleIcon as UserCircleSolid, WalletIcon as WalletSolid,
} from "@heroicons/react/24/solid";
import type { IconComponent } from "@/lib/icon-type";
import { useAuthStore } from "@/stores/auth-store";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

interface Tab {
    href: string;
    label: string;
    icon: IconComponent;
    /** Ícono relleno para la sección actual. */
    activeIcon: IconComponent;
    /** Rutas que cuentan como esta sección (ej. el detalle de una cancha es "Canchas"). */
    match: (path: string) => boolean;
}

const TABS: Tab[] = [
    { href: "/inicio", label: "Inicio", icon: HomeIcon, activeIcon: HomeSolid, match: (p) => p === "/inicio" },
    { href: "/facilities", label: "Canchas", icon: MapPinIcon, activeIcon: MapPinSolid, match: (p) => p.startsWith("/facilities") },
    { href: "/bookings", label: "Mis reservas", icon: CalendarIcon, activeIcon: CalendarSolid, match: (p) => p.startsWith("/bookings") },
    { href: "/wallet", label: "Billetera", icon: WalletIcon, activeIcon: WalletSolid, match: (p) => p.startsWith("/wallet") },
];

const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-primary" : "text-default-500"
    }`;

export function BottomNav() {
    const pathname = usePathname() ?? "";
    const { isOpen, onOpen, onClose } = useDisclosure();
    const profileActive = pathname.startsWith("/profile") || isOpen;

    return (
        <>
            <nav
                data-bottom-nav
                aria-label="Navegación principal"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
            >
                <ul className="mx-auto flex max-w-md items-stretch">
                    {TABS.map((t) => {
                        const active = t.match(pathname);
                        const Icon = active ? t.activeIcon : t.icon;
                        return (
                            <li key={t.href} className="flex min-w-0 flex-1">
                                <NextLink href={t.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                                    <Icon className="h-6 w-6" aria-hidden="true" />
                                    <span className="max-w-full truncate">{t.label}</span>
                                </NextLink>
                            </li>
                        );
                    })}
                    <li className="flex min-w-0 flex-1">
                        <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={isOpen} className={itemClass(profileActive)}>
                            {profileActive
                                ? <UserCircleSolid className="h-6 w-6" aria-hidden="true" />
                                : <UserCircleIcon className="h-6 w-6" aria-hidden="true" />}
                            <span>Perfil</span>
                        </button>
                    </li>
                </ul>
            </nav>
            <ProfileSheet isOpen={isOpen} onClose={onClose} />
        </>
    );
}

/** Hoja de "Perfil": cuenta, tema y salida. */
function ProfileSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const user = useAuthStore((s) => s.user);
    const { logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const isAdminUser = user?.role === "ADMIN" || user?.role === "VENUE_ADMIN";

    const row = "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground hover:bg-default-100";
    const logoutRow = "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-danger hover:bg-danger/10";
    const themeBtn = (active: boolean) =>
        `flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${active ? "border-primary text-primary" : "border-divider text-foreground"}`;

    // Hoja desde abajo: ancho completo, alto según el contenido (máx. 85% de la pantalla)
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            placement="bottom"
            scrollBehavior="inside"
            classNames={{
                wrapper: "items-end",
                base: "m-0! w-full max-w-full max-h-[85dvh] rounded-t-2xl rounded-b-none sm:hidden",
            }}
        >
            <ModalContent>
                <ModalBody className="gap-1 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5">
                    <div className="px-3 pb-3">
                        <p className="text-base font-semibold">{user?.firstName} {user?.lastName}</p>
                        <p className="truncate text-xs text-default-500">{user?.email}</p>
                    </div>

                    <NextLink href="/profile" onClick={onClose} className={row}>
                        <UserIcon className="h-5 w-5 text-default-500" aria-hidden="true" /> Mi Perfil
                    </NextLink>
                    {isAdminUser && (
                        <NextLink href="/dashboard" onClick={onClose} className={row}>
                            <Squares2X2Icon className="h-5 w-5 text-default-500" aria-hidden="true" /> Panel de administración
                        </NextLink>
                    )}

                    <div className="mt-2 border-t border-divider pt-3" role="group" aria-label="Tema">
                        <p className="px-3 pb-1 text-xs font-medium text-default-500">Tema</p>
                        <div className="grid grid-cols-2 gap-2 px-1">
                            <button type="button" onClick={() => { if (isDark) toggleTheme(); }} aria-pressed={!isDark} className={themeBtn(!isDark)}>
                                <SunIcon className="h-4 w-4" aria-hidden="true" /> Claro
                                {!isDark && <CheckIcon className="h-4 w-4" aria-hidden="true" />}
                            </button>
                            <button type="button" onClick={() => { if (!isDark) toggleTheme(); }} aria-pressed={isDark} className={themeBtn(isDark)}>
                                <MoonIcon className="h-4 w-4" aria-hidden="true" /> Oscuro
                                {isDark && <CheckIcon className="h-4 w-4" aria-hidden="true" />}
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 border-t border-divider pt-2">
                        <button type="button" onClick={() => { onClose(); logout(); }} className={logoutRow}>
                            <ArrowRightStartOnRectangleIcon className="h-5 w-5" aria-hidden="true" /> Cerrar sesión
                        </button>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
