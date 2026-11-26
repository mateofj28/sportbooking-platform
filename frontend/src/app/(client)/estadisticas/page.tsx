"use client";

// ============================================================
// app/(client)/estadisticas/page.tsx
// Estadísticas del cliente: cuántas reservas hizo y en qué estado están.
// Reservas = Realizadas + Completadas + Canceladas (negocio.md). Solo las propias
// (RPC my_booking_stats, migración 062), también para los admins que usan la app como cliente.
// ============================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Button, Spinner } from "@heroui/react";
import { CalendarDaysIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Navbar } from "@/components/layout/navbar";
import { SummaryCard } from "@/components/shared/wallet-ui";
import { useMyBookingStats } from "@/hooks/use-bookings";
import { useAuthStore } from "@/stores/auth-store";

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

export default function EstadisticasPage() {
    const router = useRouter();
    const { isAuthenticated, isHydrated } = useAuthStore();
    const { data, isLoading, isError, error } = useMyBookingStats();

    useEffect(() => {
        if (isHydrated && !isAuthenticated) router.replace("/login");
    }, [isHydrated, isAuthenticated, router]);

    if (!isHydrated) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    if (!isAuthenticated) return null;

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-6 py-8">
                <div>
                    <h1 className="text-2xl font-bold">Estadísticas</h1>
                    <p className="mt-1 text-sm text-default-500">Tus reservas en SportBooking.</p>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12"><Spinner size="lg" /></div>
                ) : isError || !data ? (
                    <p role="alert" className="text-sm text-danger">{error?.message ?? "No se pudieron cargar tus estadísticas"}</p>
                ) : data.total === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-divider py-12 text-center">
                        <CalendarDaysIcon className="h-10 w-10 text-default-300" aria-hidden="true" />
                        <p className="text-sm text-default-500">Todavía no hiciste ninguna reserva.</p>
                        <Button as={NextLink} href="/facilities" color="primary">Buscar una cancha</Button>
                    </div>
                ) : (
                    <>
                        <section aria-label="Reservas realizadas" className="space-y-4">
                            <SummaryCard
                                icon={<CalendarDaysIcon className="h-5 w-5 text-primary" />}
                                label="Reservas"
                                value={fmt(data.total)}
                                hint={`Todas las que hiciste · ${plural(data.canceladas, "cancelada", "canceladas")}`}
                            />
                            <div className="grid gap-4 sm:grid-cols-3">
                                <SummaryCard
                                    icon={<ClockIcon className="h-5 w-5 text-primary" />}
                                    label="Realizadas"
                                    value={fmt(data.realizadas)}
                                    hint="Pagadas, el turno todavía no se jugó"
                                />
                                <SummaryCard
                                    icon={<CheckCircleIcon className="h-5 w-5 text-success" />}
                                    label="Completadas"
                                    value={fmt(data.completadas)}
                                    hint="Turnos que ya jugaste"
                                />
                                <SummaryCard
                                    icon={<XCircleIcon className="h-5 w-5 text-danger" />}
                                    label="Canceladas"
                                    value={fmt(data.canceladas)}
                                    hint="Turnos pagados que se cancelaron"
                                />
                            </div>
                        </section>

                        <Button as={NextLink} href="/bookings" variant="bordered">Ver mis reservas</Button>
                    </>
                )}
            </main>
        </div>
    );
}
