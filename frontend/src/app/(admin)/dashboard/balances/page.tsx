"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import { Spinner } from "@heroui/react";
import { BanknotesIcon, BuildingOffice2Icon, ChartPieIcon, CurrencyDollarIcon, ExclamationTriangleIcon, WalletIcon } from "@heroicons/react/24/outline";
import { SummaryCard } from "@/components/shared/wallet-ui";
import { useAdminBalancesSummary } from "@/hooks/use-wallet";
import { useAuthStore } from "@/stores/auth-store";
import { formatPoints } from "@/lib/points";

/** Balances del negocio (admin general). Los pagos a complejos están en Créditos → Solicitudes de pago. */
export default function BalancesPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const isAdmin = user?.role === "ADMIN";

    useEffect(() => {
        if (isHydrated && user && !isAdmin) router.replace("/dashboard");
    }, [isHydrated, user, isAdmin, router]);

    const { data, isLoading, isError, error } = useAdminBalancesSummary(isAdmin);

    if (!isAdmin || isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
    if (isError || !data) return <p role="alert" className="text-sm text-danger">{error?.message ?? "No se pudieron cargar los balances"}</p>;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold">Balances</h1>
                <p className="mt-1 text-sm text-default-500">
                    Dinero real ingresado por la compra de créditos (1 crédito = $1) y pagos a los complejos.
                </p>
            </div>

            {!data.balanced && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    Los saldos no cuadran (recaudado ≠ en billeteras + gastado). Avisá a soporte técnico antes de pagar.
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard icon={<BanknotesIcon className="h-5 w-5 text-success" />} label="Recaudado" value={formatPoints(data.collected)} hint="Recargas menos ajustes (dinero real ingresado)" />
                <SummaryCard icon={<WalletIcon className="h-5 w-5 text-primary" />} label="En billeteras de clientes" value={formatPoints(data.inWallets)} hint="Créditos cargados que todavía no se usaron" />
                <SummaryCard icon={<ChartPieIcon className="h-5 w-5 text-secondary" />} label="Comisión de la empresa" value={formatPoints(data.commission)} hint="De los turnos ya jugados" />
                <SummaryCard icon={<CurrencyDollarIcon className="h-5 w-5 text-success" />} label="Pagado a complejos" value={formatPoints(data.paidToVenues)} />
                <SummaryCard icon={<BuildingOffice2Icon className="h-5 w-5 text-warning" />} label="Pendiente de pagar a complejos" value={formatPoints(data.pendingToVenues)} hint={`${formatPoints(data.requestedByVenues)} ya solicitados`} />
                <SummaryCard icon={<WalletIcon className="h-5 w-5 text-default-500" />} label="Pagado en turnos por jugar" value={formatPoints(data.spentNotPlayed)} hint="Reservas pagadas que todavía no se jugaron" />
            </div>

            <p className="text-sm text-default-500">
                El saldo por complejo, las solicitudes y los pagos realizados están en{" "}
                <NextLink href="/dashboard/points?tab=payouts" className="font-medium text-primary hover:underline">
                    Créditos → Solicitudes de pago
                </NextLink>.
            </p>
        </div>
    );
}
