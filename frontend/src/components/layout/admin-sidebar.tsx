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
    Menu,
    X,
} from "lucide-react";
import { useState, useEffect } from "react";

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

function SidebarContent({ onClose }: { onClose?: () => void }) {
    const pathname = usePathname();
    const { logout } = useAuth();

    return (
      <div className="flex h-full flex-col">
          <div className="mb-6 flex items-center justify-between px-3 pt-2">
              <div>
                  <h2 className="text-lg font-bold text-foreground">Admin Panel</h2>
                  <p className="text-xs text-default-500">Gestión de SportBooking</p>
              </div>
              {onClose && (
                  <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-default-100">
                      <X className="h-5 w-5 text-default-500" />
                  </button>
              )}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto">
              {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                      <Link
                          key={item.href}
                          href={item.href}
                    onPress={onClose}
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
    );
}

export function AdminSidebar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();

    // Close mobile sidebar on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    return (
        <>
            {/* Mobile toggle button */}
            <button
                onClick={() => setMobileOpen(true)}
                className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 lg:hidden"
                aria-label="Abrir menú"
            >
                <Menu className="h-5 w-5" />
            </button>

            {/* Mobile overlay + drawer */}
            {mobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setMobileOpen(false)}
                    />
                    {/* Drawer */}
                    <aside className="absolute left-0 top-0 h-full w-72 bg-content1 p-4 shadow-xl animate-slide-in-right overflow-y-auto">
                        <SidebarContent onClose={() => setMobileOpen(false)} />
                    </aside>
                </div>
            )}

            {/* Desktop sidebar */}
            <aside className="fixed top-[65px] left-0 hidden h-[calc(100vh-65px)] w-64 flex-shrink-0 border-r border-divider bg-content1 p-4 lg:block overflow-y-auto">
                <SidebarContent />
          </aside>
      </>
  );
}
