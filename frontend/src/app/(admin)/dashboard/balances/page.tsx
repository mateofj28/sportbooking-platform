"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { AlertTriangle, BadgeDollarSign, Banknote, Building2, Clock, PiggyBank, Wallet } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { ReceiptButton, SummaryCard } from "@/components/shared/wallet-ui";
import { PayModal, PayoutRequestsTable, RejectModal, type PayTarget } from "@/components/shared/payout-admin";
import { useAdminBalances, type PendingPayoutRequest } from "@/hooks/use-wallet";
import { useAuthStore } from "@/stores/auth-store";
import { formatDateTimeAr } from "@/lib/datetime";
import { formatPoints } from "@/lib/points";

/** Balances del negocio y pagos a los complejos (admin general). */
export default function BalancesPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const isAdmin = user?.role === "ADMIN";
    const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
    const [toReject, setToReject] = useState<PendingPayoutRequest | null>(null);

    useEffect(() => {
        if (isHydrated && user && !isAdmin) router.replace("/dashboard");
    }, [isHydrated, user, isAdmin, router]);

    const { data, isLoading, isError, error } = useAdminBalances();

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
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    Los saldos no cuadran (recaudado ≠ en billeteras + gastado). Avisá a soporte técnico antes de pagar.
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard icon={<Banknote className="h-5 w-5 text-success" />} label="Recaudado" value={formatPoints(data.collected)} hint="Recargas menos ajustes (dinero real ingresado)" />
                <SummaryCard icon={<Wallet className="h-5 w-5 text-primary" />} label="En billeteras de clientes" value={formatPoints(data.inWallets)} hint="Créditos cargados que todavía no se usaron" />
                <SummaryCard icon={<PiggyBank className="h-5 w-5 text-secondary" />} label="Comisión de la empresa" value={formatPoints(data.commission)} hint="De los turnos ya jugados" />
                <SummaryCard icon={<BadgeDollarSign className="h-5 w-5 text-success" />} label="Pagado a complejos" value={formatPoints(data.paidToVenues)} />
                <SummaryCard icon={<Building2 className="h-5 w-5 text-warning" />} label="Pendiente de pagar a complejos" value={formatPoints(data.pendingToVenues)} hint={`${formatPoints(data.requestedByVenues)} ya solicitados`} />
                <SummaryCard icon={<Wallet className="h-5 w-5 text-default-500" />} label="Pagado en turnos por jugar" value={formatPoints(data.spentNotPlayed)} hint="Reservas pagadas que todavía no se jugaron" />
            </div>

            {/* Solicitudes pendientes */}
            <section className="space-y-3" aria-label="Solicitudes de pago pendientes">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Clock className="h-5 w-5 text-warning" aria-hidden="true" /> Solicitudes de pago pendientes
                </h2>
                <PayoutRequestsTable
                    requests={data.requests}
                    onPay={(r) => setPayTarget({ kind: "request", request: r })}
                    onReject={setToReject}
                />
            </section>

            {/* Saldo por complejo */}
            <section className="space-y-3" aria-label="Saldo por complejo">
                <h2 className="text-lg font-semibold">Saldo por complejo</h2>
                <DataTable aria-label="Saldo por complejo">
                    <TableHeader>
                        <TableColumn>COMPLEJO</TableColumn>
                        <TableColumn align="end">SIN COBRAR</TableColumn>
                        <TableColumn align="end">SOLICITADO</TableColumn>
                        <TableColumn align="end">DISPONIBLE</TableColumn>
                        <TableColumn align="end">COMISIÓN</TableColumn>
                        <TableColumn>ÚLTIMO PAGO</TableColumn>
                        <TableColumn align="end">ACCIONES</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Todavía no hay turnos jugados">
                        {data.venues.map((v) => (
                            <TableRow key={v.venueId}>
                                <TableCell className="font-medium">{v.venueName}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPoints(v.balance)}</TableCell>
                                <TableCell className="text-right tabular-nums text-default-500">{formatPoints(v.reserved)}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(v.available)}</TableCell>
                                <TableCell className="text-right tabular-nums text-default-500">{formatPoints(v.commission)}</TableCell>
                                <TableCell className="text-default-500">{v.lastPaidAt ? formatDateTimeAr(v.lastPaidAt) : "—"}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" variant="bordered" isDisabled={v.available <= 0} onPress={() => setPayTarget({ kind: "direct", venue: v })}>
                                        Pagar
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
                <p className="text-xs text-default-400">
                    &quot;Pagar&quot; paga sin que el complejo lo pida, hasta lo disponible. Lo ya solicitado se paga desde la solicitud.
                </p>
            </section>

            {/* Pagos realizados */}
            <section className="space-y-3" aria-label="Pagos realizados">
                <h2 className="text-lg font-semibold">Pagos realizados</h2>
                <DataTable aria-label="Pagos realizados a complejos">
                    <TableHeader>
                        <TableColumn>FECHA Y HORA</TableColumn>
                        <TableColumn>COMPLEJO</TableColumn>
                        <TableColumn align="end">MONTO</TableColumn>
                        <TableColumn>ORIGEN</TableColumn>
                        <TableColumn align="end">COMPROBANTE</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Todavía no hay pagos">
                        {data.payments.map((p) => (
                            <TableRow key={p.id}>
                                <TableCell className="text-default-500">{formatDateTimeAr(p.paidAt)}</TableCell>
                                <TableCell className="font-medium">{p.venueName}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(p.amount)}</TableCell>
                                <TableCell className="text-default-500">
                                    {p.requested ? "Solicitado por el complejo" : "Pago directo"}
                                    {p.transferRef && <p className="text-xs text-default-400">Transferencia {p.transferRef}</p>}
                                </TableCell>
                                <TableCell className="text-right">
                                    {p.receiptPath ? <ReceiptButton path={p.receiptPath} /> : <span className="text-xs text-default-300">—</span>}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </section>

            <PayModal target={payTarget} onClose={() => setPayTarget(null)} />
            <RejectModal request={toReject} onClose={() => setToReject(null)} />
        </div>
    );
}
