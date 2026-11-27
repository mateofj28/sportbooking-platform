"use client";

// ============================================================
// components/layout/bottom-nav.tsx
// Barra de navegación fija abajo (vista de cliente, solo en celular: < 640 px).
// Las 4 pestañas fijas salen de lib/navigation.ts (`tab`); la quinta es "Más".
// "Más" abre una hoja desde abajo con el resto de las secciones en una grilla agrupada
// (Mi cuenta, Actividad...), el tema, el panel de administración (admins) y cerrar sesión.
// Con muchas opciones (MORE_SEARCH_FROM) la hoja muestra un buscador.
// La monta el Navbar (fuera del panel y con sesión). Su alto se reserva en globals.css
// (data-bottom-nav), así ninguna pantalla queda tapada.
// ============================================================

import { useMemo, useState } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Input, Modal, ModalBody, ModalContent, useDisclosure } from "@heroui/react";
import {
    ArrowRightStartOnRectangleIcon, CheckIcon, MagnifyingGlassIcon, MoonIcon, Squares2X2Icon, SquaresPlusIcon, SunIcon,
} from "@heroicons/react/24/outline";
import { SquaresPlusIcon as SquaresPlusSolid } from "@heroicons/react/24/solid";
import { useAuthStore } from "@/stores/auth-store";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { groupedSections, isSectionActive, MORE_SEARCH_FROM, tabSections } from "@/lib/navigation";

const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-primary" : "text-default-500"
    }`;

export function BottomNav() {
    const pathname = usePathname() ?? "";
    const role = useAuthStore((s) => s.user?.role);
    const { isOpen, onOpen, onClose } = useDisclosure();

    const tabs = tabSections(role);
    // "Más" se marca si la pantalla actual es una de sus secciones (ej. Mi Perfil)
    const moreActive = isOpen || groupedSections(role).some((g) => g.items.some((s) => isSectionActive(s, pathname)));

    return (
        <>
            <nav
                data-bottom-nav
                aria-label="Navegación principal"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
            >
                <ul className="mx-auto flex max-w-md items-stretch">
                    {tabs.map((t) => {
                        const active = isSectionActive(t, pathname);
                        const Icon = active && t.activeIcon ? t.activeIcon : t.icon;
                        return (
                            <li key={t.key} className="flex min-w-0 flex-1">
                                <NextLink href={t.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                                    <Icon className="h-6 w-6" aria-hidden="true" />
                                    <span className="max-w-full truncate">{t.label}</span>
                                </NextLink>
                            </li>
                        );
                    })}
                    <li className="flex min-w-0 flex-1">
                        <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={isOpen} className={itemClass(moreActive)}>
                            {moreActive
                                ? <SquaresPlusSolid className="h-6 w-6" aria-hidden="true" />
                                : <SquaresPlusIcon className="h-6 w-6" aria-hidden="true" />}
                            <span>Más</span>
                        </button>
                    </li>
                </ul>
            </nav>
            <MoreSheet isOpen={isOpen} onClose={onClose} />
        </>
    );
}

/** Hoja "Más": secciones en grilla agrupada, tema, panel y salida. */
function MoreSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const pathname = usePathname() ?? "";
    const user = useAuthStore((s) => s.user);
    const { logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const [query, setQuery] = useState("");
    const isAdminUser = user?.role === "ADMIN" || user?.role === "VENUE_ADMIN" || user?.role === "TRAINER";
    const panelLabel = user?.role === "TRAINER" ? "Mi panel" : "Panel de administración";

    const groups = useMemo(() => groupedSections(user?.role), [user?.role]);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const showSearch = total >= MORE_SEARCH_FROM;

    // Búsqueda sin mayúsculas ni acentos
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const q = norm(query);
    const visibleGroups = q
        ? groups.map((g) => ({ ...g, items: g.items.filter((s) => norm(s.label).includes(q)) })).filter((g) => g.items.length > 0)
        : groups;

    const close = () => { setQuery(""); onClose(); };
    const row = "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-foreground hover:bg-default-100";
    const themeBtn = (active: boolean) =>
        `flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${active ? "border-primary text-primary" : "border-divider text-foreground"}`;

    // Hoja desde abajo: ancho completo, alto según el contenido (máx. 85% de la pantalla)
    return (
        <Modal
            isOpen={isOpen}
            onClose={close}
            placement="bottom"
            scrollBehavior="inside"
            classNames={{
                wrapper: "items-end",
                base: "m-0! w-full max-w-full max-h-[85dvh] rounded-t-2xl rounded-b-none sm:hidden",
            }}
        >
            <ModalContent>
                <ModalBody className="gap-1 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5">
                    <div className="px-3 pb-2">
                        <p className="text-base font-semibold">{user?.firstName} {user?.lastName}</p>
                        <p className="truncate text-xs text-default-500">{user?.email}</p>
                    </div>

                    {showSearch && (
                        <Input
                            type="search"
                            aria-label="Buscar en el menú"
                            placeholder="Buscar en el menú…"
                            size="sm"
                            variant="bordered"
                            className="px-1 pb-2"
                            value={query}
                            onValueChange={setQuery}
                            startContent={<MagnifyingGlassIcon className="h-4 w-4 text-default-400" aria-hidden="true" />}
                        />
                    )}

                    {visibleGroups.map((g) => (
                        <section key={g.key} aria-label={g.label} className="pb-2">
                            <p className="px-3 pb-2 pt-1 text-xs font-medium text-default-500">{g.label}</p>
                            <ul className="grid grid-cols-3 gap-2 px-1">
                                {g.items.map((s) => {
                                    const active = isSectionActive(s, pathname);
                                    const Icon = s.icon;
                                    return (
                                        <li key={s.key}>
                                            <NextLink
                                                href={s.href}
                                                onClick={close}
                                                aria-current={active ? "page" : undefined}
                                                className={`flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-medium ${active ? "border-primary bg-primary/10 text-primary" : "border-divider text-foreground hover:bg-default-100"
                                                    }`}
                                            >
                                                <Icon className="h-6 w-6" aria-hidden="true" />
                                                <span className="leading-tight">{s.label}</span>
                                            </NextLink>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                    {q && visibleGroups.length === 0 && (
                        <p className="px-3 py-4 text-center text-sm text-default-500">Ninguna opción coincide con la búsqueda</p>
                    )}

                    <div className="border-t border-divider pt-3" role="group" aria-label="Tema">
                        <p className="px-3 pb-2 text-xs font-medium text-default-500">Ajustes</p>
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
                        {isAdminUser && (
                            <NextLink href="/dashboard" onClick={close} className={row}>
                                <Squares2X2Icon className="h-5 w-5 text-default-500" aria-hidden="true" /> {panelLabel}
                            </NextLink>
                        )}
                        <button type="button" onClick={() => { close(); logout(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-danger hover:bg-danger/10">
                            <ArrowRightStartOnRectangleIcon className="h-5 w-5" aria-hidden="true" /> Cerrar sesión
                        </button>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
