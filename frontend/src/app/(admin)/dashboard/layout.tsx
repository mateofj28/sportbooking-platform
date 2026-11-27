"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { AdminSidebar, canOpenPanelRoute } from "@/components/layout/admin-sidebar";
import { Navbar } from "@/components/layout/navbar";
import { useAuthStore } from "@/stores/auth-store";

/** Roles con panel: admin general, admin de sede y entrenador (spec entrenadores E9). */
const PANEL_ROLES = ["ADMIN", "VENUE_ADMIN", "TRAINER"];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname() ?? "/dashboard";
    const { isAuthenticated, isHydrated, user } = useAuthStore();
    const hasPanel = !!user && PANEL_ROLES.includes(user.role);
    // Cada rol entra solo a sus pantallas (la autorización real está en la base)
    const allowed = hasPanel && canOpenPanelRoute(user?.role, pathname);

    useEffect(() => {
        if (!isHydrated) return;
        if (!isAuthenticated || !hasPanel) router.replace("/login");
        else if (!allowed) router.replace("/dashboard");
    }, [isHydrated, isAuthenticated, hasPanel, allowed, router]);

    if (!isHydrated || (isAuthenticated && hasPanel && !allowed)) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!isAuthenticated || !hasPanel) {
        return null;
    }

    return (
        <div className="h-screen overflow-hidden flex flex-col">
            <Navbar />
            <div className="flex flex-1 overflow-hidden">
                <AdminSidebar />
                <main className="flex-1 overflow-y-auto overflow-x-hidden bg-default-50 p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
