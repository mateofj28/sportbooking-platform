"use client";

import {
    Navbar as HeroNavbar,
    NavbarBrand,
    NavbarContent,
    NavbarItem,
    NavbarMenuToggle,
    NavbarMenu,
    NavbarMenuItem,
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
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { NotificationBell } from "@/components/layout/notification-bell";
import { Trophy, LogOut, User, Calendar, LayoutDashboard, Sun, Moon, Menu, ChevronLeft, Monitor, Check } from "lucide-react";

export function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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

    return (
        <HeroNavbar
            onMenuOpenChange={setIsMenuOpen}
            maxWidth="xl"
            classNames={{
                base: "bg-gradient-to-r from-blue-400 to-blue-900 border-b border-blue-800",
                content: "text-white",
            }}
        >
            <NavbarContent>
                {inDashboard ? (
                    <button
                        onClick={openSidebar}
                        aria-label="Abrir menú"
                        className="flex items-center justify-center rounded-lg p-1 text-white hover:bg-white/10 lg:hidden"
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                ) : (
                    <NavbarMenuToggle
                        aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
                        className="sm:hidden"
                    />
                )}
                <NavbarBrand>
                    <Link href="/" className="flex items-center gap-2 text-white">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                            <Trophy className="h-4 w-4 text-white" />
                        </div>
                        <p className="font-bold text-white text-lg">SportBooking</p>
                    </Link>
                </NavbarBrand>
            </NavbarContent>

            <NavbarContent className="hidden gap-6 sm:flex" justify="center">
                {isAuthenticated && user?.role === "CLIENT" && (
                    <NavbarItem>
                        <Link href="/inicio" className="text-sm font-medium text-white hover:text-blue-200">
                            Inicio
                        </Link>
                    </NavbarItem>
                )}
                {user?.role !== "VENUE_ADMIN" && (
                    <NavbarItem>
                        <Link href="/facilities" className="text-sm font-medium text-white hover:text-blue-200">
                            Instalaciones
                        </Link>
                    </NavbarItem>
                )}
                {isAuthenticated && (
                    <NavbarItem>
                        <Link href="/bookings" className="text-sm font-medium text-white hover:text-blue-200">
                            Mis Reservas
                        </Link>
                    </NavbarItem>
                )}
                {(user?.role === "ADMIN" || user?.role === "VENUE_ADMIN") && (
                    <NavbarItem>
                        <Link href="/dashboard" className="text-sm font-medium text-white hover:text-blue-200">
                            Dashboard
                        </Link>
                    </NavbarItem>
                )}
            </NavbarContent>

            <NavbarContent justify="end">
                {/* Campana de notificaciones: solo para administradores */}
                {isAuthenticated && (user?.role === "ADMIN" || user?.role === "VENUE_ADMIN") && (
                    <NavbarItem>
                        <NotificationBell />
                    </NavbarItem>
                )}
                {/* Botón de tema: solo visible cuando NO está autenticado */}
                {mounted && !isAuthenticated && (
                    <NavbarItem>
                        <Button isIconOnly variant="light" size="sm" onPress={toggleTheme} aria-label="Cambiar tema">
                            {isDark ? <Sun className="h-4 w-4 text-yellow-300" /> : <Moon className="h-4 w-4 text-white/80" />}
                        </Button>
                    </NavbarItem>
                )}
                {!isHydrated ? (
                    <NavbarItem>
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
                                className="transition-transform"
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
                                            <MenuItem href="/profile" icon={<User className="h-4 w-4" />} label="Mi Perfil" />
                                            <MenuItem href="/bookings" icon={<Calendar className="h-4 w-4" />} label="Mis Reservas" />
                                            {(user?.role === "ADMIN" || user?.role === "VENUE_ADMIN") && (
                                                <MenuItem href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard Admin" />
                                            )}
                                            {/* Tema con flecha */}
                                            <button
                                                type="button"
                                                onClick={() => setDropdownView("theme")}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left"
                                            >
                                                {isDark
                                                    ? <Moon className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                                    : <Sun className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                                                }
                                                <span className="flex-1">Tema</span>
                                                <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-default-400 flex-shrink-0" />
                                            </button>
                                        </div>
                                        {/* Cerrar sesión */}
                                        <div className="border-t border-divider py-1">
                                            <button
                                                type="button"
                                                onClick={logout}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors text-left"
                                            >
                                                <LogOut className="h-4 w-4 flex-shrink-0" />
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
                                                <ChevronLeft className="h-4 w-4 text-default-500 flex-shrink-0" />
                                                Tema
                                            </button>
                                            {/* Opciones */}
                                            <div className="py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { if (isDark) toggleTheme(); }}
                                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left"
                                        >
                                                    <Sun className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                                                    <span className="flex-1">Claro</span>
                                                    {!isDark && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { if (!isDark) toggleTheme(); }}
                                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left"
                                        >
                                                    <Moon className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                                    <span className="flex-1">Oscuro</span>
                                                    {isDark && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                                                </button>
                                            </div>
                                        </div>
                            )}
                            </PopoverContent>
                        </Popover>
                ) : (
                    <>
                        <NavbarItem className="hidden sm:flex">
                                    <Link href="/login" className="text-sm font-medium text-white hover:text-blue-200">
                                Iniciar Sesión
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

            <NavbarMenu>
                {inDashboard ? null : <>
                {isAuthenticated && user?.role === "CLIENT" && (
                    <NavbarMenuItem>
                        <Link className="w-full" href="/inicio" size="lg">
                            Inicio
                        </Link>
                    </NavbarMenuItem>
                )}
                {user?.role !== "VENUE_ADMIN" && (
                    <NavbarMenuItem>
                        <Link className="w-full" href="/facilities" size="lg">
                            Instalaciones
                        </Link>
                    </NavbarMenuItem>
                )}
                {isAuthenticated && (
                    <>
                        <NavbarMenuItem>
                            <Link className="w-full" href="/bookings" size="lg">
                                Mis Reservas
                            </Link>
                        </NavbarMenuItem>
                        <NavbarMenuItem>
                            <Link className="w-full" href="/profile" size="lg">
                                Mi Perfil
                            </Link>
                        </NavbarMenuItem>
                    </>
                )}
                {(user?.role === "ADMIN" || user?.role === "VENUE_ADMIN") && (
                    <NavbarMenuItem>
                        <Link className="w-full" href="/dashboard" size="lg">
                            Dashboard
                        </Link>
                    </NavbarMenuItem>
                )}
                {!isAuthenticated && (
                    <>
                        <NavbarMenuItem>
                            <Link className="w-full" href="/login" size="lg">
                                Iniciar Sesión
                            </Link>
                        </NavbarMenuItem>
                        <NavbarMenuItem>
                            <Link className="w-full" color="primary" href="/register" size="lg">
                                Registrarse
                            </Link>
                        </NavbarMenuItem>
                    </>
                )}
                </>}
            </NavbarMenu>
        </HeroNavbar>
    );
}

/** Item de menú reutilizable para el popover del usuario */
function MenuItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <a
            href={href}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-default-100 transition-colors text-left text-foreground"
        >
            <span className="flex-shrink-0 text-default-500">{icon}</span>
            {label}
        </a>
    );
}
