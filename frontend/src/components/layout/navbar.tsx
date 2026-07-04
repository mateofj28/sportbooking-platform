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
    Avatar,
} from "@heroui/react";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, LogOut, User, Calendar, LayoutDashboard } from "lucide-react";

export function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { user, isAuthenticated, isHydrated } = useAuthStore();
    const { logout } = useAuth();

    return (
        <HeroNavbar
            onMenuOpenChange={setIsMenuOpen}
            maxWidth="xl"
            classNames={{
                base: "bg-background/80 backdrop-blur-md border-b border-divider",
            }}
        >
            <NavbarContent>
                <NavbarMenuToggle
                    aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
                    className="sm:hidden"
                />
                <NavbarBrand>
                    <Link href="/" className="flex items-center gap-2 text-inherit">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                            <Trophy className="h-4 w-4 text-white" />
                        </div>
                        <p className="font-bold text-inherit text-lg">SportBooking</p>
                    </Link>
                </NavbarBrand>
            </NavbarContent>

            <NavbarContent className="hidden gap-6 sm:flex" justify="center">
                <NavbarItem>
                    <Link color="foreground" href="/facilities" className="text-sm font-medium">
                        Instalaciones
                    </Link>
                </NavbarItem>
                {isAuthenticated && (
                    <NavbarItem>
                        <Link color="foreground" href="/bookings" className="text-sm font-medium">
                            Mis Reservas
                        </Link>
                    </NavbarItem>
                )}
                {user?.role === "ADMIN" && (
                    <NavbarItem>
                        <Link color="foreground" href="/dashboard" className="text-sm font-medium">
                            Dashboard
                        </Link>
                    </NavbarItem>
                )}
            </NavbarContent>

            <NavbarContent justify="end">
                {!isHydrated ? (
                    <NavbarItem>
                        <div className="h-8 w-8 animate-pulse rounded-full bg-default-200" />
                    </NavbarItem>
                ) : isAuthenticated ? (
                    <Dropdown placement="bottom-end">
                        <DropdownTrigger>
                            <Avatar
                                isBordered
                                as="button"
                                className="transition-transform"
                                color="primary"
                                name={`${user?.firstName} ${user?.lastName}`}
                                size="sm"
                                src={user?.avatarUrl}
                            />
                        </DropdownTrigger>
                        <DropdownMenu aria-label="Acciones de usuario" variant="flat">
                            <DropdownItem
                                key="profile-info"
                                className="h-14 gap-2"
                                textValue="Info"
                            >
                                <p className="font-semibold">
                                    {user?.firstName} {user?.lastName}
                                </p>
                                <p className="text-sm text-default-500">{user?.email}</p>
                            </DropdownItem>
                            <DropdownItem
                                key="my-profile"
                                href="/profile"
                                startContent={<User className="h-4 w-4" />}
                            >
                                Mi Perfil
                            </DropdownItem>
                            <DropdownItem
                                key="my-bookings"
                                href="/bookings"
                                startContent={<Calendar className="h-4 w-4" />}
                            >
                                Mis Reservas
                            </DropdownItem>
                            {user?.role === "ADMIN" ? (
                                <DropdownItem
                                    key="dashboard"
                                    href="/dashboard"
                                    startContent={<LayoutDashboard className="h-4 w-4" />}
                                >
                                    Dashboard Admin
                                </DropdownItem>
                            ) : (
                                <DropdownItem
                                    key="placeholder"
                                    className="hidden"
                                    textValue="hidden"
                                >
                                    {" "}
                                </DropdownItem>
                            )}
                            <DropdownItem
                                key="logout"
                                color="danger"
                                onPress={logout}
                                startContent={<LogOut className="h-4 w-4" />}
                            >
                                Cerrar Sesión
                            </DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                ) : (
                    <>
                        <NavbarItem className="hidden sm:flex">
                            <Link href="/login" className="text-sm font-medium">
                                Iniciar Sesión
                            </Link>
                        </NavbarItem>
                        <NavbarItem>
                            <Button as={Link} color="primary" href="/register" variant="flat" size="sm">
                                Registrarse
                            </Button>
                        </NavbarItem>
                    </>
                )}
            </NavbarContent>

            <NavbarMenu>
                <NavbarMenuItem>
                    <Link className="w-full" href="/facilities" size="lg">
                        Instalaciones
                    </Link>
                </NavbarMenuItem>
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
                {user?.role === "ADMIN" && (
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
            </NavbarMenu>
        </HeroNavbar>
    );
}
