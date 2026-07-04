"use client";

import { Link, Button } from "@heroui/react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
    LayoutDashboard,
    Calendar,
    MapPin,
    Users,
    Trophy,
    ArrowLeft,
    LogOut,
    Clock,
    DollarSign,
    Ban,
} from "lucide-react";

const menuItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/bookings", label: "Reservas", icon: Calendar },
    { href: "/dashboard/facilities", label: "Instalaciones", icon: MapPin },
    { href: "/dashboard/venues", label: "Sedes", icon: MapPin },
    { href: "/dashboard/schedules", label: "Horarios", icon: Clock },
    { href: "/dashboard/pricing", label: "Precios", icon: DollarSign },
    { href: "/dashboard/blocked-slots", label: "Bloqueos", icon: Ban },
    { href: "/dashboard/users", label: "Usuarios", icon: Users },
    { href: "/dashboard/sports", label: "Deportes", icon: Trophy },
];

export function AdminSidebar() {
    const pathname = usePathname();
    const { logout } = useAuth();

    return (
        <aside className="fixed top-[65px] left-0 hidden h-[calc(100vh-65px)] w-64 flex-shrink-0 border-r border-divider bg-content1 p-4 lg:block overflow-y-auto">
            <div className="flex h-full flex-col">
                <div className="mb-8 px-3 pt-2">
                    <h2 className="text-lg font-bold text-foreground">Admin Panel</h2>
                    <p className="text-xs text-default-500">Gestión de SportBooking</p>
                </div>

                <nav className="flex-1 space-y-1">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-default-600 hover:bg-default-100 hover:text-foreground"
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="space-y-1 border-t border-divider pt-4">
                    <Link
                        href="/"
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-default-600 hover:bg-default-100"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver al sitio
                    </Link>
                    <button
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
                    >
                        <LogOut className="h-4 w-4" />
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        </aside>
    );
}
