"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { CalendarCheck, Wallet } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PointsAmount } from "@/components/shared/points-amount";
import { LedgerFilters, LedgerPagination, type LedgerFilterValue } from "@/components/shared/ledger-filters";
import { useVenueWallet } from "@/hooks/use-wallet";
import { ReceiptButton, SummaryCard } from "@/components/shared/wallet-ui";
import { useAuthStore } from "@/stores/auth-store";
import { formatArDateTime, formatPeriod, formatPoints, VENUE_LEDGER_LABEL } from "@/lib/points";

const KINDS = [
    { key: "ALL", label: "Todos los movimientos" },
    { key: "BOOKING_CREDIT", label: "Turnos jugados" },
    { key: "SETTLEMENT", label: "Pagos de la empresa" },
];
const PAGE_SIZE = 20;

/** Billetera de la sede (admin de sede): lo que generó con turnos jugados y lo que le pagó la empresa. */
export default function VenueWalletPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const isVenueAdmin = user?.role === "VENUE_ADMIN";
    const [filters, setFilters] = useState<LedgerFilterValue>({ from: "", to: "", kind: "ALL" });
    const [page, setPage] = useState(1);

    // El admin general ve esto por sede en Balances
    useEffect(() => {
        if (isHydrated && user && !isVenueAdmin) router.replace(user.role === "ADMIN" ? "/dashboard/balances" : "/dashboard");
    }, [isHydrated, user, isVenueAdmin, router]);

    const { data, isLoading, isError, error } = useVenueWallet(null, { ...filters, page, size: PAGE_SIZE }, isVenueAdmin);

    if (!isVenueAdmin) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Billetera</h1>
                <p className="mt-1 text-sm text-default-500">
                    Tu complejo suma el precio de cada turno cuando se juega. La empresa te paga cada mes lo acumulado. 1 punto = $1.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <SummaryCard icon={<Wallet className="h-5 w-5 text-primary" />} label="Pendiente de cobro" value={data ? formatPoints(data.pending) : "…"} hint="Lo acumulado que la empresa todavía no te pagó" />
                <SummaryCard icon={<CalendarCheck className="h-5 w-5 text-success" />} label="Acreditado este mes" value={data ? formatPoints(data.thisMonth) : "…"} hint="Turnos jugados en el mes en curso" />
            </div>

            <section className="space-y-3" aria-label="Movimientos de la sede">
                <LedgerFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} kinds={KINDS} />
                {isError ? (
                    <p role="alert" className="text-sm text-danger">{error?.message}</p>
                ) : (
                    <>
                        <DataTable aria-label="Movimientos de la billetera de la sede">
                            <TableHeader>
                                <TableColumn>FECHA Y HORA</TableColumn>
                                <TableColumn>DETALLE</TableColumn>
                                <TableColumn align="end">PUNTOS</TableColumn>
                                <TableColumn align="end">COMPROBANTE</TableColumn>
                            </TableHeader>
                            <TableBody isLoading={isLoading} loadingContent={<Spinner />} emptyContent="Todavía no hay movimientos">
                                {(data?.items ?? []).map((m) => (
                                    <TableRow key={m.id}>
                                        <TableCell className="text-default-500">{formatArDateTime(m.createdAt)}</TableCell>
                                        <TableCell>
                                            <p className="font-medium">
                                                {VENUE_LEDGER_LABEL[m.kind]}
                                                {m.kind === "SETTLEMENT" && ` — ${formatPeriod(m.period)}`}
                                            </p>
                                            <p className="max-w-[420px] truncate text-xs text-default-400">
                                                {m.kind === "BOOKING_CREDIT" ? m.detail.replace(/^Turno jugado — /, "") : (m.transferRef ? `Transferencia ${m.transferRef}` : "")}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-right"><PointsAmount amount={m.amount} /></TableCell>
                                        <TableCell className="text-right">
                                            {m.receiptPath ? <ReceiptButton path={m.receiptPath} /> : <span className="text-xs text-default-300">—</span>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </DataTable>
                        <LedgerPagination total={data?.total ?? 0} page={page} size={PAGE_SIZE} onPage={setPage} />
                    </>
                )}
            </section>
        </div>
    );
}
