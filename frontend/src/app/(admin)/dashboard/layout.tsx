"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { Navbar } from "@/components/layout/navbar";
import { useAuthStore } from "@/stores/auth-store";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { isAuthenticated, isHydrated, user } = useAuthStore();

    useEffect(() => {
        if (isHydrated && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isHydrated, isAuthenticated, router]);

    if (!isHydrated) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <div className="flex flex-1">
                <AdminSidebar />
                <main className="flex-1 overflow-auto bg-default-50 p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}
