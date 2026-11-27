"use client";

import {
    Navbar as HeroNavbar,
    NavbarBrand,
    NavbarContent,
    NavbarItem,
    Button,
    Link,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
    DropdownSection,
    Avatar,
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@heroui/react";
import { useState } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { NotificationBell } from "@/components/layout/notification-bell";
import { BottomNav } from "@/components/layout/bottom-nav";
import { groupedSections } from "@/lib/navigation";
import { ArrowRightStartOnRectangleIcon, Bars3Icon, CalendarIcon, CheckIcon, ChevronLeftIcon, ComputerDesktopIcon, EyeIcon, MoonIcon, Squares2X2Icon, SunIcon, TrophyIcon, WalletIcon } from "@heroicons/react/24/outline";
import { useMyBalance } from "@/hooks/use-wallet";
import { formatPoints, formatPointsNumber } from "@/lib/points";

/** 98764000 -> "98.8M" (saldo corto en móvil). */
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
/** Desde este saldo, en celular se muestra corto (1.2B): un número más largo no entra en la barra. */
const COMPACT_FROM = 1_000_000_000;

/** Saldo para la barra en celular: completo ("98,764,000") salvo que sea muy grande ("1.2B"). */
function mobileBalance(n: number): string {
    return Math.abs(n) >= COMPACT_FROM ? COMPACT.format(n) : formatPointsNumber(n);
}

/** Saldo de créditos del usuario, con link a "Mi billetera". */
function NavBalance() {
    const { data: balance, isLoading } = useMyBalance();
    return (
        <Link
            href="/wallet"
            aria-label={`Mi billetera: ${formatPoints(balance ?? 0)}`}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-2.5 py-1 text-sm font-medium text-white hover:bg-white/25 sm:px-3"
        >
            <WalletIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {isLoading ? "…" : (
                <>
                    {/* Celular: el número completo (98,764,000), corto solo desde mil millones.
                        Desde 640 px: con la palabra (98,764,000 créditos) */}
                    <span className="tabular-nums sm:hidden">{mobileBalance(balance ?? 0)}</span>
                    <span className="hidden sm:inline">{formatPoints(balance ?? 0)}</span>
                </>
            )}
        </Link>
    );
}

export function Navbar() {
    const [dropdownView, setDropdownView] = useState<"main" | "theme">("main");
    // Selectores granulares: el Navbar solo re-renderiza cuando cambia
    // el campo exacto que necesita, no en cada escritura al store
    const user = useAuthStore((s) => s.user);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const { logout } = useAuth();
    const { isDark, toggleTheme, mounted } = useTheme();
    const pathname = usePathname();
    const openSidebar = useSidebarStore((s) => s.open);

    // Dentro del panel admin, en móvil el menú lo abre un botón en el navbar
    // (arriba a la izquierda) que despliega el drawer del sidebar.
    const inDashboard = pathname?.startsWith("/dashboard");

    // Los administradores también pueden usar la app como clientes (ver canchas, reservar, ver
    // sus propias reservas). El contexto lo define la ruta: /dashboard = gestión; el resto = cliente.
    // Usuarios con panel (/dashboard): admins y entrenadores. Con el entrenador, "Mi panel".
    const isAdminUser = user?.role === "ADMIN" || user?.role === "VENUE_ADMIN" || user?.role === "TRAINER";
    const panelLabel = user?.role === "TRAINER" ? "Mi panel" : "Panel de administración";
    const showClientLinks = !(isAdminUser && inDashboard);

    return (
        <>
        <HeroNavbar
            maxWidth="xl"
            classNames={{
                base: "bg-[#2F54D6] border-b border-[#2F54D6] dark:bg-gradient-to-r dark:from-blue-400 dark:to-blue-900 dark:border-blue-800",
                content: "text-white gap-2 sm:gap-4",
                // Móvil: menos padding y separación para que todo entre sin desbordar
                wrapper: "px-3 gap-2 sm:px-6 sm:gap-4",
            }}
        >
            <NavbarContent>
                {inDashboard ? (
                    <button
                        onClick={openSidebar}
                        aria-label="Abrir menú"
                        className="flex items-center justify-center rounded-lg p-1 text-white hover:bg-white/10 lg:hidden"
                    >
                        <Bars3Icon className="h-6 w-6" />
                    </button>
                ) : null}
                <NavbarBrand>
                    <Link href="/" className="flex items-center gap-2 text-white">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                            <TrophyIcon className="h-4 w-4 text-white" />
                        </div>
                        <p className="font-bold text-lg text-white! max-[419px]:hidden">SportBooking</p>
                    </Link>
                </NavbarBrand>
            </NavbarContent>

            <NavbarContent className="hidden gap-6 sm:flex" justify="center">
                {/* Vista de cliente: la ven los clientes y también los admins fuera del panel */}
                {showClientLinks && isAuthenticated && (
                    <NavbarItem>
                        <Link href="/inicio" className="text-sm font-medium text-white hover:text-white/80">
                            Inicio
                        </Link>
                    </NavbarItem>
                )}
                {showClientLinks && (
                    <NavbarItem>
                        <Link href="/facilities" className="text-sm font-medium text-white hover:text-white/80">
                            Instalaciones
                        </Link>
                    </NavbarItem>
                )}
                {showClientLinks && isAuthenticated && (
                    <NavbarItem>
                        <Link href="/bookings" className="text-sm font-medium text-white hover:text-white/80">
                            Mis Reservas
                        </Link>
                    </NavbarItem>
                )}
                {/* Cambio de contexto para administradores: panel de gestión <-> vista de cliente */}
                {isAdminUser && (
                    <NavbarItem>
                        <Link
                            href={inDashboard ? "/inicio" : "/dashboard"}
                            className="flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1 text-sm font-medium text-white hover:bg-white/10"
                        >
                            {inDashboard
                                ? <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                : <Squares2X2Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                            {inDashboard ? "Vista de cliente" : panelLabel}
                        </Link>
                    </NavbarItem>
                )}
            </NavbarContent>

            <NavbarContent justify="end">
                {/* Saldo de créditos: en la vista de cliente (R1.8) */}
                {isHydrated && isAuthenticated && !inDashboard && (
                    <NavbarItem>
                        <NavBalance />
                    </NavbarItem>
                )}
                    {/* Campana de notificaciones: administradores, y solo dentro del panel (/dashboard).
                    En la vista de cliente no hay notificaciones del negocio: el contexto lo define la ruta. */}
                    {isAuthenticated && inDashboard && (user?.role === "ADMIN" || user?.role === "VENUE_ADMIN") && (
                    <NavbarItem>
                        <NotificationBell />
                    </NavbarItem>
                )}
                {/* Botón de tema: solo visible cuando NO está autenticado */}
                {mounted && !isAuthenticated && (
                    <NavbarItem className="hidden sm:flex">
                        <Button isIconOnly variant="light" size="sm" onPress={toggleTheme} aria-label="Cambiar tema">
                            {isDark ? <SunIcon className="h-4 w-4 text-yellow-300" /> : <MoonIcon className="h-4 w-4 text-white/80" />}
                        </Button>
                    </NavbarItem>
                )}
                {!isHydrated ? (
                    <NavbarItem className={inDashboard ? "" : "hidden sm:flex"}>
                        <div className="h-8 w-8 animate-pulse rounded-full bg-default-200" />
                    </NavbarItem>
                ) : isAuthenticated ? (
                        <Popover
                            placement="bottom-end"
                            onOpenChange={(open) => { if (!open) setDropdownView("main"); }}
                            motionProps={{
                                variants: {
                                    enter: { opacity: 1, scale: 1, transition: { duration: 0 } },
                                    exit: { opacity: 0, scale: 1, transition: { duration: 0 } },
                                },
                            }}
                        >
                            <PopoverTrigger>
                                <Avatar
                                as="button"
                                // En celular (fuera del panel) está la pestaña "Perfil" de la barra de abajo
                                className={`transition-transform ${inDashboard ? "" : "hidden sm:flex"}`}
                                color="primary"
                                name={`${user?.firstName} ${user?.lastName}`}
                                size="sm"
                                    src={user?.avatarUrl ?? undefined}
                            />
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-56 overflow-hidden rounded-xl shadow-xl border border-divider bg-content1">
                            {dropdownView === "main" ? (
                                    <div className="w-full">
                                        {/* Info */}
                                        <div className="px-4 py-3 border-b border-divider">
                                            <p className="font-semibold text-sm">{user?.firstName} {user?.lastName}</p>
                                            <p className="text-xs text-default-500 truncate">{user?.email}</p>
                                        </div>
                                        {/* Items */}
                                        <div className="py-1">
                                            <MenuItem href="/bookings" icon={<CalendarIcon className="h-4 w-4" />} label="Mis Reservas" />
                                            <MenuItem href="/wallet" icon={<WalletIcon className="h-4 w-4" />} label="Mi billetera" />
                                            {/* Mi Perfil, Notificaciones y las secciones nuevas (lib/navigation.ts) */}
                                            {groupedSections(user?.role).flatMap((g) => g.items).map((s) => {
                                                const Icon = s.icon;
                                                return <MenuItem key={s.key} href={s.href} icon={<Icon className="h-4 w-4" />} label={s.label} />;
                                            })}
                                            {isAdminUser && (
                                                inDashboard
                                                    ? <MenuItem href="/inicio" icon={<EyeIcon className="h-4 w-4" />} label="Vista de cliente" />
                                                    : <MenuItem href="/dashboard" icon={<Squares2X2Icon className="h-4 w-4" />} label={panelLabel} />
                                            )}
                                            {/* Tema con flecha */}
                                            <button
                                                type="button"
                                                onClick={() => setDropdownView("theme")}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left"
                                            >
                                                {isDark
                                                    ? <MoonIcon className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                                    : <SunIcon className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                                                }
                                                <span className="flex-1">Tema</span>
                                                <ChevronLeftIcon className="h-3.5 w-3.5 rotate-180 text-default-400 flex-shrink-0" />
                                            </button>
                                        </div>
                                        {/* Cerrar sesión */}
                                        <div className="border-t border-divider py-1">
                                            <button
                                                type="button"
                                                onClick={logout}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors text-left"
                                            >
                                                <ArrowRightStartOnRectangleIcon className="h-4 w-4 flex-shrink-0" />
                                                Cerrar Sesión
                                            </button>
                                        </div>
                                    </div>
                            ) : (
                                        <div className="w-full">
                                            {/* Header con botón volver */}
                                            <button
                                                type="button"
                                                onClick={() => setDropdownView("main")}
                                                className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-default-100 transition-colors border-b border-divider text-left"
                                            >
                                                <ChevronLeftIcon className="h-4 w-4 text-default-500 flex-shrink-0" />
                                                Tema
                                            </button>
                                            {/* Opciones */}
                                            <div className="py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { if (isDark) toggleTheme(); }}
                                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left"
                                        >
                                                    <SunIcon className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                                                    <span className="flex-1">Claro</span>
                                                    {!isDark && <CheckIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { if (!isDark) toggleTheme(); }}
                                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left"
                                        >
                                                    <MoonIcon className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                                    <span className="flex-1">Oscuro</span>
                                                    {isDark && <CheckIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                                                </button>
                                            </div>
                                        </div>
                            )}
                            </PopoverContent>
                        </Popover>
                ) : (
                    <>
                        <NavbarItem>
                                    <Link href="/login" className="whitespace-nowrap text-sm font-medium text-white hover:text-white/80">
                                <span className="sm:hidden">Ingresar</span>
                                <span className="hidden sm:inline">Iniciar Sesión</span>
                            </Link>
                        </NavbarItem>
                        <NavbarItem>
                                    <Button as={Link} href="/register" variant="bordered" size="sm" className="border-white/40 text-white hover:bg-white/10">
                                Registrarse
                            </Button>
                        </NavbarItem>
                    </>
                )}
            </NavbarContent>
        </HeroNavbar>
        {isHydrated && isAuthenticated && !inDashboard && <BottomNav />}
        </>
    );
}

/** Item de menú reutilizable para el popover del usuario */
function MenuItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <NextLink
            href={href}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left text-foreground"
        >
            <span className="flex-shrink-0 text-default-500">{icon}</span>
            {label}
        </NextLink>
    );
}
