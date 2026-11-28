"use client";

// Billetera del entrenador (Req. 10.3–10.5): suma su tarifa cuando la clase termina, ve lo cobrado y
// solicita su pago (una solicitud pendiente a la vez). Ve su tarifa, no la comisión de la empresa.
import { useEffect, useState } from "react";
import {
    Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup,
    Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow,
} from "@heroui/react";
import { BanknotesIcon, CalendarDateRangeIcon, ClockIcon, WalletIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/shared/data-table";
import { PointsAmount } from "@/components/shared/points-amount";
import { PointsInput } from "@/components/shared/points-input";
import { LedgerFilters, LedgerPagination, type LedgerFilterValue } from "@/components/shared/ledger-filters";
import { LedgerTotals, ReceiptButton, SummaryCard } from "@/components/shared/wallet-ui";
import { useRequestTrainerPayout, useTrainerWallet } from "@/hooks/use-trainer-money";
import type { PayoutStatus } from "@/hooks/use-wallet";
import { useToastStore } from "@/stores/toast-store";
import { formatDateTimeAr } from "@/lib/datetime";
import { formatPesos, formatPoints } from "@/lib/points";

const KINDS = [
    { key: "ALL", label: "Todos los movimientos" },
    { key: "CLASS_CREDIT", label: "Clases dadas" },
    { key: "SETTLEMENT", label: "Pagos de la empresa" },
];
const PAGE_SIZE = 20;

const REQUEST_STATUS: Record<PayoutStatus, { label: string; color: "warning" | "success" | "danger" }> = {
    PENDING: { label: "Pendiente", color: "warning" },
    PAID: { label: "Pagada", color: "success" },
    REJECTED: { label: "Rechazada", color: "danger" },
};

export default function TrainerWalletPage() {
    const [filters, setFilters] = useState<LedgerFilterValue>({ from: "", to: "", kind: "ALL" });
    const [page, setPage] = useState(1);
    const [requestOpen, setRequestOpen] = useState(false);
    const { data, isLoading, isError, error } = useTrainerWallet(null, { ...filters, page, size: PAGE_SIZE });

    const pendingRequest = data?.pendingRequest ?? null;
    const available = data?.available ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Billetera</h1>
                    <p className="mt-1 text-sm text-default-500">
                        Sumás tu tarifa cuando termina cada clase pagada. Podés pedir que te paguen cuando quieras. 1 crédito = $1.
                    </p>
                </div>
                <Button color="primary" className="w-full sm:w-auto" startContent={<BanknotesIcon className="h-4 w-4" aria-hidden="true" />}
                    isDisabled={!data || !!pendingRequest || available <= 0} onPress={() => setRequestOpen(true)}>
                    Solicitar pago
                </Button>
            </div>

            {pendingRequest && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700">
                    <ClockIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>
                        Pediste el pago de <strong>{formatPoints(pendingRequest.amount)}</strong> ({formatPesos(pendingRequest.amount)}) el{" "}
                        {formatDateTimeAr(pendingRequest.requestedAt)}. Está pendiente: cuando se pague o se rechace, podés pedir otro.
                    </span>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard icon={<WalletIcon className="h-5 w-5 text-primary" />} label="Disponible para cobrar" value={data ? formatPoints(available) : "…"} hint={data ? formatPesos(available) : undefined} />
                <SummaryCard icon={<ClockIcon className="h-5 w-5 text-warning" />} label="Solicitado (pendiente)" value={data ? formatPoints(data.reserved) : "…"} hint="Lo que pediste y todavía no se pagó" />
                <SummaryCard icon={<CalendarDateRangeIcon className="h-5 w-5 text-success" />} label="Ganado este mes" value={data ? formatPoints(data.thisMonth) : "…"} hint="Clases terminadas en el mes en curso" />
            </div>

            {(data?.requests.length ?? 0) > 0 && (
                <section className="space-y-3" aria-label="Solicitudes de pago">
                    <h2 className="text-lg font-semibold">Solicitudes de pago</h2>
                    <DataTable aria-label="Solicitudes de pago">
                        <TableHeader>
                            <TableColumn>SOLICITADA</TableColumn>
                            <TableColumn align="end">MONTO</TableColumn>
                            <TableColumn>ESTADO</TableColumn>
                            <TableColumn>RESUELTA</TableColumn>
                        </TableHeader>
                        <TableBody>
                            {(data?.requests ?? []).map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="text-default-500">{formatDateTimeAr(r.requestedAt)}</TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums">{formatPoints(r.amount)}</TableCell>
                                    <TableCell>
                                        <Chip size="sm" variant="flat" color={REQUEST_STATUS[r.status].color}>{REQUEST_STATUS[r.status].label}</Chip>
                                        {r.rejectReason && <p className="mt-0.5 max-w-[320px] truncate text-xs text-default-400">Motivo: {r.rejectReason}</p>}
                                    </TableCell>
                                    <TableCell className="text-default-500">{r.resolvedAt ? formatDateTimeAr(r.resolvedAt) : "—"}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </DataTable>
                </section>
            )}

            <section className="space-y-3" aria-label="Movimientos">
                <h2 className="text-lg font-semibold">Movimientos</h2>
                <LedgerFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} kinds={KINDS} />
                {data && (
                    <LedgerTotals sumIn={data.sumIn} sumOut={data.sumOut} sumNet={data.sumNet} count={data.total}
                        filtered={!!filters.from || filters.kind !== "ALL"} inHint="Clases dadas" outHint="Pagos de la empresa" />
                )}
                {isError ? (
                    <p role="alert" className="text-sm text-danger">{error?.message}</p>
                ) : (
                    <>
                        <DataTable aria-label="Movimientos de la billetera">
                            <TableHeader>
                                <TableColumn>FECHA Y HORA</TableColumn>
                                <TableColumn>DETALLE</TableColumn>
                                <TableColumn align="end">CRÉDITOS</TableColumn>
                                <TableColumn align="end">COMPROBANTE</TableColumn>
                            </TableHeader>
                            <TableBody isLoading={isLoading} loadingContent={<Spinner />} emptyContent="Todavía no hay movimientos">
                                {(data?.items ?? []).map((m) => (
                                    <TableRow key={m.id}>
                                        <TableCell className="text-default-500">{formatDateTimeAr(m.createdAt)}</TableCell>
                                        <TableCell>
                                            <p className="font-medium">{m.kind === "SETTLEMENT" ? m.detail : "Clase dada"}</p>
                                            <p className="max-w-[420px] truncate text-xs text-default-400">
                                                {m.kind === "CLASS_CREDIT" ? m.detail.replace(/^Clase dada — /, "") : (m.transferRef ? `Transferencia ${m.transferRef}` : "")}
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

            <RequestPayoutModal isOpen={requestOpen} available={available} onClose={() => setRequestOpen(false)} />
        </div>
    );
}

function RequestPayoutModal({ isOpen, available, onClose }: { isOpen: boolean; available: number; onClose: () => void }) {
    const addToast = useToastStore((s) => s.addToast);
    const request = useRequestTrainerPayout();
    const [mode, setMode] = useState<"all" | "custom">("all");
    const [amount, setAmount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) { setMode("all"); setAmount(null); setError(null); }
    }, [isOpen]);

    const customError = mode === "custom" && amount !== null && (amount <= 0 || amount > available)
        ? `Podés pedir entre 1 y ${formatPoints(available)}` : null;
    const canSubmit = mode === "all" ? available > 0 : amount !== null && !customError;
    const toRequest = mode === "all" ? available : amount ?? 0;

    const submit = () => {
        request.mutate(mode === "all" ? null : amount, {
            onSuccess: (r) => { addToast(`Pediste el pago de ${formatPoints(r.amount)}. Te avisamos cuando se resuelva.`); onClose(); },
            onError: (e: Error) => setError(e.message),
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={() => !request.isPending && onClose()} size="md" placement="center">
            <ModalContent>
                <ModalHeader>Solicitar pago</ModalHeader>
                <ModalBody className="gap-4">
                    <p className="text-sm text-default-600">
                        Disponible para cobrar: <strong>{formatPoints(available)}</strong> ({formatPesos(available)})
                    </p>
                    <RadioGroup label="¿Cuánto querés cobrar?" value={mode} onValueChange={(v) => { setMode(v as "all" | "custom"); setError(null); }}>
                        <Radio value="all" description={formatPesos(available)}>Todo lo disponible</Radio>
                        <Radio value="custom">Otro monto</Radio>
                    </RadioGroup>
                    {mode === "custom" && (
                        <PointsInput label="Monto a cobrar" isRequired max={available} value={amount}
                            onChange={(v) => { setAmount(v); setError(null); }}
                            isInvalid={!!customError} errorMessage={customError ?? undefined} />
                    )}
                    <p className="text-xs text-default-400">Solo podés tener una solicitud pendiente a la vez. Si se rechaza, el monto vuelve a tu disponible.</p>
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={request.isPending}>Cancelar</Button>
                    <Button color="primary" onPress={submit} isDisabled={!canSubmit} isLoading={request.isPending}>
                        Solicitar {canSubmit ? formatPoints(toRequest) : ""}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
