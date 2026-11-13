"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Input, Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { Wallet } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { DataTable } from "@/components/shared/data-table";
import { PointsAmount } from "@/components/shared/points-amount";
import { WhatsappTopupButton } from "@/components/shared/whatsapp-topup-button";
import { LedgerFilters, LedgerPagination, type LedgerFilterValue } from "@/components/shared/ledger-filters";
import { useMyWalletHistory } from "@/hooks/use-wallet";
import { useAuthStore } from "@/stores/auth-store";
import { formatArDateTime, formatPoints, WALLET_TX_LABEL, WHATSAPP_TOPUP_LABEL } from "@/lib/points";

const KINDS = [
    { key: "ALL", label: "Todos los movimientos" },
    { key: "TOPUP", label: "Recargas" },
    { key: "ADJUSTMENT", label: "Ajustes" },
    { key: "BOOKING_PAYMENT", label: "Reservas" },
    { key: "BOOKING_REFUND", label: "Devoluciones" },
];
const PAGE_SIZE = 20;
const MAX_TOPUP = 10_000_000;

export default function WalletPage() {
    const router = useRouter();
    const { isAuthenticated, isHydrated } = useAuthStore();
    const [filters, setFilters] = useState<LedgerFilterValue>({ from: "", to: "", kind: "ALL" });
    const [page, setPage] = useState(1);
    const [buyText, setBuyText] = useState("");

    useEffect(() => {
        if (isHydrated && !isAuthenticated) router.replace("/login");
    }, [isHydrated, isAuthenticated, router]);

    const { data, isLoading, isError, error } = useMyWalletHistory({ ...filters, page, size: PAGE_SIZE });

    const buyPoints = Number(buyText);
    const buyValid = buyText === "" || (Number.isInteger(buyPoints) && buyPoints > 0 && buyPoints <= MAX_TOPUP);

    if (!isHydrated) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    if (!isAuthenticated) return null;

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-8">
                <div>
                    <h1 className="text-2xl font-bold">Mi billetera</h1>
                    <p className="mt-1 text-sm text-default-500">Pagás tus reservas con puntos. 1 punto = $1.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card shadow="none" className="bg-content1">
                        <CardBody className="flex flex-row items-center gap-4 p-6">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                                <Wallet className="h-6 w-6 text-primary" aria-hidden="true" />
                            </div>
                            <div>
                                <p className="text-sm text-default-500">Saldo disponible</p>
                                <p className="text-3xl font-bold tabular-nums">{data ? formatPoints(data.balance) : "…"}</p>
                            </div>
                        </CardBody>
                    </Card>

                    <Card shadow="none" className="bg-content1">
                        <CardBody className="gap-3 p-6">
                            <p className="text-sm font-semibold">Cargar puntos</p>
                            <p className="text-xs text-default-500">
                                Escribinos por WhatsApp al {WHATSAPP_TOPUP_LABEL}, hacé la transferencia y te cargamos los puntos.
                            </p>
                            <div className="flex flex-wrap items-start gap-2">
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    label="¿Cuántos puntos?"
                                    size="sm"
                                    variant="bordered"
                                    className="max-w-[180px]"
                                    min={1}
                                    max={MAX_TOPUP}
                                    value={buyText}
                                    onValueChange={(v) => setBuyText(v.replace(/[^\d]/g, ""))}
                                    isInvalid={!buyValid}
                                    errorMessage={!buyValid ? "Ingresá un número entero mayor que 0" : undefined}
                                />
                                <WhatsappTopupButton points={buyValid && buyText ? buyPoints : null} isDisabled={!buyValid} />
                            </div>
                        </CardBody>
                    </Card>
                </div>

                <section className="space-y-3" aria-label="Movimientos">
                    <h2 className="text-lg font-semibold">Movimientos</h2>
                    <LedgerFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} kinds={KINDS} />

                    {isError ? (
                        <p role="alert" className="text-sm text-danger">{error?.message}</p>
                    ) : (
                        <>
                            <DataTable aria-label="Movimientos de mi billetera">
                                <TableHeader>
                                    <TableColumn>FECHA Y HORA</TableColumn>
                                    <TableColumn>DETALLE</TableColumn>
                                    <TableColumn align="end">PUNTOS</TableColumn>
                                    <TableColumn align="end">SALDO</TableColumn>
                                </TableHeader>
                                <TableBody
                                    isLoading={isLoading}
                                    loadingContent={<Spinner />}
                                    emptyContent="Todavía no tenés movimientos"
                                >
                                    {(data?.items ?? []).map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell className="text-default-500">{formatArDateTime(t.createdAt)}</TableCell>
                                            <TableCell>
                                                <p className="font-medium">{WALLET_TX_LABEL[t.kind]}</p>
                                                <p className="max-w-[420px] truncate text-xs text-default-400">
                                                    {t.kind === "TOPUP" || t.kind === "ADJUSTMENT" ? (t.reason ?? t.detail) : t.detail.replace(/^(Reserva|Devolución) — /, "")}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-right"><PointsAmount amount={t.amount} /></TableCell>
                                            <TableCell className="text-right tabular-nums text-default-500">{formatPoints(t.balanceAfter)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </DataTable>
                            <LedgerPagination total={data?.total ?? 0} page={page} size={PAGE_SIZE} onPage={setPage} />
                        </>
                    )}
                </section>
            </main>
        </div>
    );
}
