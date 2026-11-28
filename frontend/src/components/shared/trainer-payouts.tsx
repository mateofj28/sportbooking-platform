"use client";

// ============================================================
// components/shared/trainer-payouts.tsx
// Pagos a entrenadores (admin general, migración 069): saldo por entrenador, solicitudes pendientes,
// pagos realizados y los modales "Registrar pago" y "Rechazar". Mismo esquema que payout-panel.tsx
// de los complejos; se muestra en Créditos → Solicitudes de pago → Entrenadores.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
    Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup,
    Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow, Textarea,
} from "@heroui/react";
import { PaperClipIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/shared/data-table";
import { PointsInput } from "@/components/shared/points-input";
import { LedgerFilters, LedgerPagination, type LedgerFilterValue } from "@/components/shared/ledger-filters";
import { ReceiptButton } from "@/components/shared/wallet-ui";
import {
    useAdminTrainerBalances, useAdminTrainerPayments, useAdminTrainerPayoutRequests, usePayTrainer, useRejectTrainerPayout,
    type PendingTrainerPayout, type TrainerBalance,
} from "@/hooks/use-trainer-money";
import { useToastStore } from "@/stores/toast-store";
import { formatDateTimeAr } from "@/lib/datetime";
import { formatPesos, formatPoints } from "@/lib/points";

const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const RECEIPT_MAX = 5 * 1024 * 1024;
const PAGE_SIZE = 20;

type PayTarget = { kind: "request"; request: PendingTrainerPayout } | { kind: "direct"; trainer: TrainerBalance };

export function TrainerPayoutsPanel() {
    const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
    const [toReject, setToReject] = useState<PendingTrainerPayout | null>(null);
    const [balPage, setBalPage] = useState(1);
    const balances = useAdminTrainerBalances(null, balPage, PAGE_SIZE);
    const requests = useAdminTrainerPayoutRequests(null);
    const [pf, setPf] = useState<LedgerFilterValue>({ from: "", to: "", kind: "ALL" });
    const [search, setSearch] = useState("");
    const [payPage, setPayPage] = useState(1);
    const payments = useAdminTrainerPayments({ trainerId: null, from: pf.from, to: pf.to, search: search.trim(), page: payPage, size: PAGE_SIZE });

    return (
        <div className="space-y-8">
            <section className="space-y-3" aria-label="Solicitudes de entrenadores">
                <h2 className="text-lg font-semibold">Solicitudes pendientes</h2>
                <DataTable aria-label="Solicitudes de pago de entrenadores">
                    <TableHeader>
                        <TableColumn>ENTRENADOR</TableColumn>
                        <TableColumn>SOLICITADA</TableColumn>
                        <TableColumn align="end">MONTO</TableColumn>
                        <TableColumn align="end">ACCIONES</TableColumn>
                    </TableHeader>
                    <TableBody isLoading={requests.isLoading} loadingContent={<Spinner />} emptyContent={requests.isLoading ? " " : "No hay solicitudes pendientes"}>
                        {(requests.data ?? []).map((r) => (
                            <TableRow key={r.id}>
                                <TableCell className="font-medium">{r.trainerName}</TableCell>
                                <TableCell className="text-default-500">{formatDateTimeAr(r.requestedAt)}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(r.amount)}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button size="sm" color="primary" variant="flat" onPress={() => setPayTarget({ kind: "request", request: r })}>Registrar pago</Button>
                                        <Button size="sm" color="danger" variant="light" onPress={() => setToReject(r)}>Rechazar</Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </section>

            <section className="space-y-3" aria-label="Saldo por entrenador">
                <h2 className="text-lg font-semibold">Saldo por entrenador</h2>
                <DataTable aria-label="Saldo por entrenador">
                    <TableHeader>
                        <TableColumn>ENTRENADOR</TableColumn>
                        <TableColumn align="end">SIN COBRAR</TableColumn>
                        <TableColumn align="end">SOLICITADO</TableColumn>
                        <TableColumn align="end">DISPONIBLE</TableColumn>
                        <TableColumn align="end">COMISIÓN</TableColumn>
                        <TableColumn>ÚLTIMO PAGO</TableColumn>
                        <TableColumn align="end">ACCIONES</TableColumn>
                    </TableHeader>
                    <TableBody isLoading={balances.isLoading} loadingContent={<Spinner />} emptyContent={balances.isLoading ? " " : "Todavía no hay clases terminadas"}>
                        {(balances.data?.items ?? []).map((b) => (
                            <TableRow key={b.trainerId}>
                                <TableCell className="font-medium">{b.trainerName}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPoints(b.balance)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPoints(b.reserved)}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(b.available)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPoints(b.commission)}</TableCell>
                                <TableCell className="text-default-500">{b.lastPaidAt ? formatDateTimeAr(b.lastPaidAt) : "—"}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" color="primary" variant="light" isDisabled={b.available <= 0}
                                        onPress={() => setPayTarget({ kind: "direct", trainer: b })}>Pagar</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
                {balances.data && (
                    <p className="text-xs text-default-500">
                        Total sin cobrar {formatPoints(balances.data.totals.balance)} · solicitado {formatPoints(balances.data.totals.reserved)} ·
                        comisión de clases {formatPoints(balances.data.totals.commission)}
                    </p>
                )}
                <LedgerPagination total={balances.data?.total ?? 0} page={balPage} size={PAGE_SIZE} onPage={setBalPage} noun={["entrenador", "entrenadores"]} />
            </section>

            <section className="space-y-3" aria-label="Pagos realizados a entrenadores">
                <h2 className="text-lg font-semibold">Pagos realizados</h2>
                <LedgerFilters value={pf} onChange={(v) => { setPf(v); setPayPage(1); }} extraActive={!!search} onClearExtra={() => setSearch("")}>
                    <Input size="sm" variant="bordered" className="w-full max-w-xs" label="Nº de transferencia"
                        value={search} onValueChange={(v) => { setSearch(v); setPayPage(1); }} isClearable onClear={() => setSearch("")} />
                </LedgerFilters>
                <DataTable aria-label="Pagos a entrenadores">
                    <TableHeader>
                        <TableColumn>FECHA Y HORA</TableColumn>
                        <TableColumn>ENTRENADOR</TableColumn>
                        <TableColumn align="end">MONTO</TableColumn>
                        <TableColumn>ORIGEN</TableColumn>
                        <TableColumn align="end">COMPROBANTE</TableColumn>
                    </TableHeader>
                    <TableBody isLoading={payments.isLoading} loadingContent={<Spinner />} emptyContent={payments.isLoading ? " " : "Todavía no hay pagos"}>
                        {(payments.data?.items ?? []).map((p) => (
                            <TableRow key={p.id}>
                                <TableCell className="text-default-500">{formatDateTimeAr(p.paidAt)}</TableCell>
                                <TableCell className="font-medium">{p.trainerName}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(p.amount)}</TableCell>
                                <TableCell className="text-default-500">
                                    {p.requested ? "Solicitado" : "Por la empresa"}{p.transferRef ? ` · ${p.transferRef}` : ""}
                                </TableCell>
                                <TableCell className="text-right">
                                    {p.receiptPath ? <ReceiptButton path={p.receiptPath} /> : <span className="text-xs text-default-300">—</span>}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
                {payments.data && <p className="text-xs text-default-500">Total pagado con estos filtros: {formatPoints(payments.data.sumAmount)}</p>}
                <LedgerPagination total={payments.data?.total ?? 0} page={payPage} size={PAGE_SIZE} onPage={setPayPage} noun={["pago", "pagos"]} />
            </section>

            <PayTrainerModal target={payTarget} onClose={() => setPayTarget(null)} />
            <RejectTrainerModal request={toReject} onClose={() => setToReject(null)} />
        </div>
    );
}

function PayTrainerModal({ target, onClose }: { target: PayTarget | null; onClose: () => void }) {
    const addToast = useToastStore((s) => s.addToast);
    const pay = usePayTrainer();
    const fileRef = useRef<HTMLInputElement>(null);
    const [mode, setMode] = useState<"all" | "custom">("all");
    const [amount, setAmount] = useState<number | null>(null);
    const [transferRef, setTransferRef] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    const key = target ? (target.kind === "request" ? target.request.id : target.trainer.trainerId) : null;
    useEffect(() => { setMode("all"); setAmount(null); setTransferRef(""); setFile(null); setError(null); }, [key]);
    if (!target) return null;

    const isRequest = target.kind === "request";
    const trainerId = isRequest ? target.request.trainerId : target.trainer.trainerId;
    const name = isRequest ? target.request.trainerName : target.trainer.trainerName;
    const available = isRequest ? target.request.amount : target.trainer.available;
    const toPay = isRequest || mode === "all" ? available : amount ?? 0;
    const amountError = !isRequest && mode === "custom" && amount !== null && (amount <= 0 || amount > available)
        ? `Podés pagar entre 1 y ${formatPoints(available)}` : null;
    const amountOk = isRequest || mode === "all" || (amount !== null && !amountError);
    const proofOk = transferRef.trim().length > 0 || !!file;

    const pickFile = (f: File | undefined) => {
        setError(null);
        if (!f) return;
        if (!RECEIPT_TYPES.includes(f.type)) return setError("El comprobante tiene que ser una imagen (JPG, PNG, WebP) o un PDF.");
        if (f.size > RECEIPT_MAX) return setError("El comprobante pesa más de 5 MB.");
        setFile(f);
    };

    const submit = () => pay.mutate(
        { trainerId, requestId: isRequest ? target.request.id : null, amount: isRequest || mode === "all" ? null : amount, transferRef, file },
        {
            onSuccess: (r) => { addToast(`Pago registrado: ${formatPoints(r.amount)} a ${name}`); onClose(); },
            onError: (e: Error) => setError(e.message),
        },
    );

    return (
        <Modal isOpen onClose={() => !pay.isPending && onClose()} size="md" placement="center" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader>{isRequest ? "Pagar solicitud" : "Pagar a entrenador"}</ModalHeader>
                <ModalBody className="gap-4">
                    <dl className="space-y-1 rounded-xl border border-divider p-4 text-sm">
                        <div className="flex justify-between"><dt className="text-default-500">Entrenador</dt><dd className="font-medium">{name}</dd></div>
                        <div className="flex justify-between"><dt className="text-default-500">{isRequest ? "Solicitada" : "Disponible"}</dt>
                            <dd>{isRequest ? formatDateTimeAr(target.request.requestedAt) : formatPoints(available)}</dd></div>
                        <div className="flex justify-between border-t border-divider pt-1">
                            <dt className="text-default-500">Monto a transferir</dt>
                            <dd className="text-lg font-bold">{amountOk ? formatPesos(toPay) : "—"}</dd>
                        </div>
                    </dl>
                    {isRequest ? (
                        <p className="text-xs text-default-500">El monto es el que pidió el entrenador y no se puede cambiar.</p>
                    ) : (
                        <>
                            <RadioGroup label="¿Cuánto pagás?" value={mode} onValueChange={(v) => { setMode(v as "all" | "custom"); setError(null); }}>
                                <Radio value="all" description={formatPesos(available)}>Todo lo disponible</Radio>
                                <Radio value="custom">Otro monto</Radio>
                            </RadioGroup>
                            {mode === "custom" && (
                                <PointsInput label="Monto a pagar" isRequired max={available} value={amount}
                                    onChange={(v) => { setAmount(v); setError(null); }}
                                    isInvalid={!!amountError} errorMessage={amountError ?? undefined} />
                            )}
                        </>
                    )}
                    <p className="text-xs text-default-500">Cargá el número de transferencia, el comprobante, o ambos.</p>
                    <Input label="Número de transferencia" variant="bordered" maxLength={120} placeholder="Ej: TRF-000123"
                        value={transferRef} onValueChange={(v) => { setTransferRef(v); setError(null); }} />
                    <div>
                        <input ref={fileRef} type="file" accept={RECEIPT_TYPES.join(",")} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                        <Button variant="bordered" startContent={<PaperClipIcon className="h-4 w-4" aria-hidden="true" />} onPress={() => fileRef.current?.click()}>
                            {file ? "Cambiar comprobante" : "Adjuntar comprobante"}
                        </Button>
                        <p className="mt-1 text-xs text-default-400">{file ? file.name : "Imagen o PDF, hasta 5 MB"}</p>
                    </div>
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={pay.isPending}>Cancelar</Button>
                    <Button color="primary" onPress={submit} isDisabled={!amountOk || !proofOk} isLoading={pay.isPending}>
                        Registrar pago{amountOk ? ` de ${formatPoints(toPay)}` : ""}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function RejectTrainerModal({ request, onClose }: { request: PendingTrainerPayout | null; onClose: () => void }) {
    const addToast = useToastStore((s) => s.addToast);
    const reject = useRejectTrainerPayout();
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { setReason(""); setError(null); }, [request?.id]);
    const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 300;

    const submit = () => {
        if (!request) return;
        reject.mutate({ requestId: request.id, reason: reason.trim() }, {
            onSuccess: () => { addToast(`Solicitud de ${request.trainerName} rechazada`); onClose(); },
            onError: (e: Error) => setError(e.message),
        });
    };

    return (
        <Modal isOpen={!!request} onClose={() => !reject.isPending && onClose()} size="md" placement="center">
            <ModalContent>
                <ModalHeader>Rechazar solicitud</ModalHeader>
                <ModalBody className="gap-3">
                    {request && (
                        <p className="text-sm text-default-600">
                            {request.trainerName} pidió <strong>{formatPoints(request.amount)}</strong>. Si la rechazás, ese monto vuelve a su disponible y puede pedir de nuevo.
                        </p>
                    )}
                    <Textarea label="Motivo" variant="bordered" isRequired minRows={2} maxLength={300}
                        value={reason} onValueChange={(v) => { setReason(v); setError(null); }}
                        description={`${reason.trim().length}/300 · lo ve el entrenador`} isInvalid={reason.length > 0 && !reasonOk} />
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={reject.isPending}>Cancelar</Button>
                    <Button color="danger" onPress={submit} isDisabled={!reasonOk} isLoading={reject.isPending}>Rechazar solicitud</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
