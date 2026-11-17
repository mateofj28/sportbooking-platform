"use client";

// ============================================================
// components/shared/payout-admin.tsx
// Pagos a complejos (admin general, migración 045): tabla de solicitudes pendientes y los
// modales "Registrar pago" (de una solicitud o directo) y "Rechazar". La pantalla que los usa
// está en payout-panel.tsx (pestaña "Solicitudes de pago" de Créditos).
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
    Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup,
    Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow, Textarea,
} from "@heroui/react";
import { Paperclip } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PointsInput } from "@/components/shared/points-input";
import { usePayVenue, useRejectPayout, type PendingPayoutRequest, type VenueBalance } from "@/hooks/use-wallet";
import { useToastStore } from "@/stores/toast-store";
import { formatDateTimeAr } from "@/lib/datetime";
import { formatPesos, formatPoints } from "@/lib/points";

const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const RECEIPT_MAX = 5 * 1024 * 1024;

/** A quién se paga: una solicitud (monto fijo) o un complejo por iniciativa propia. */
export type PayTarget =
    | { kind: "request"; request: PendingPayoutRequest }
    | { kind: "direct"; venue: VenueBalance };

/** Tabla de solicitudes de pago pendientes con "Registrar pago" y "Rechazar". */
export function PayoutRequestsTable({ requests, onPay, onReject, isLoading = false }: {
    requests: PendingPayoutRequest[];
    onPay: (r: PendingPayoutRequest) => void;
    onReject: (r: PendingPayoutRequest) => void;
    isLoading?: boolean;
}) {
    return (
        <DataTable aria-label="Solicitudes de pago pendientes">
            <TableHeader>
                <TableColumn>COMPLEJO</TableColumn>
                <TableColumn>SOLICITADA</TableColumn>
                <TableColumn align="end">MONTO</TableColumn>
                <TableColumn align="end">ACCIONES</TableColumn>
            </TableHeader>
            <TableBody isLoading={isLoading} loadingContent={<Spinner />} emptyContent={isLoading ? " " : "No hay solicitudes pendientes"}>
                {requests.map((r) => (
                    <TableRow key={r.id}>
                        <TableCell>
                            <p className="font-medium">{r.venueName}</p>
                            {r.requestedBy && <p className="text-xs text-default-400">Pidió: {r.requestedBy}</p>}
                        </TableCell>
                        <TableCell className="text-default-500">{formatDateTimeAr(r.requestedAt)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatPoints(r.amount)}</TableCell>
                        <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                                <Button size="sm" color="primary" variant="flat" onPress={() => onPay(r)}>Registrar pago</Button>
                                <Button size="sm" color="danger" variant="light" onPress={() => onReject(r)}>Rechazar</Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </DataTable>
    );
}

export function PayModal({ target, onClose }: { target: PayTarget | null; onClose: () => void }) {
    const addToast = useToastStore((s) => s.addToast);
    const pay = usePayVenue();
    const fileRef = useRef<HTMLInputElement>(null);
    const [mode, setMode] = useState<"all" | "custom">("all");
    const [amount, setAmount] = useState<number | null>(null);
    const [transferRef, setTransferRef] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    const targetKey = target ? (target.kind === "request" ? target.request.id : target.venue.venueId) : null;
    useEffect(() => {
        setMode("all"); setAmount(null); setTransferRef(""); setFile(null); setError(null);
    }, [targetKey]);

    if (!target) return <Modal isOpen={false} onClose={onClose}><ModalContent>{null}</ModalContent></Modal>;

    const isRequest = target.kind === "request";
    const venueId = isRequest ? target.request.venueId : target.venue.venueId;
    const venueName = isRequest ? target.request.venueName : target.venue.venueName;
    const available = isRequest ? target.request.amount : target.venue.available;
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

    const submit = () => {
        pay.mutate(
            {
                venueId,
                requestId: isRequest ? target.request.id : null,
                amount: isRequest || mode === "all" ? null : amount,
                transferRef,
                file,
            },
            {
                onSuccess: (r) => { addToast(`Pago registrado: ${formatPoints(r.amount)} a ${venueName}`); onClose(); },
                onError: (e: Error) => setError(e.message),
            },
        );
    };

    return (
        <Modal isOpen onClose={() => !pay.isPending && onClose()} size="md" placement="center" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader>{isRequest ? "Pagar solicitud" : "Pagar a complejo"}</ModalHeader>
                <ModalBody className="gap-4">
                    <dl className="space-y-1 rounded-xl border border-divider p-4 text-sm">
                        <div className="flex justify-between"><dt className="text-default-500">Complejo</dt><dd className="font-medium">{venueName}</dd></div>
                        {isRequest ? (
                            <div className="flex justify-between"><dt className="text-default-500">Solicitada</dt><dd>{formatDateTimeAr(target.request.requestedAt)}</dd></div>
                        ) : (
                            <div className="flex justify-between"><dt className="text-default-500">Disponible</dt><dd>{formatPoints(available)}</dd></div>
                        )}
                        <div className="flex justify-between border-t border-divider pt-1">
                            <dt className="text-default-500">Monto a transferir</dt>
                            <dd className="text-lg font-bold">{amountOk ? formatPesos(toPay) : "—"}</dd>
                        </div>
                    </dl>

                    {isRequest ? (
                        <p className="text-xs text-default-500">El monto es el que pidió el complejo y no se puede cambiar.</p>
                    ) : (
                        <>
                            <RadioGroup label="¿Cuánto pagás?" value={mode} onValueChange={(v) => { setMode(v as "all" | "custom"); setError(null); }}>
                                <Radio value="all" description={formatPesos(available)}>Todo lo disponible</Radio>
                                <Radio value="custom">Otro monto</Radio>
                            </RadioGroup>
                            {mode === "custom" && (
                                <PointsInput
                                    label="Monto a pagar" isRequired max={available}
                                    value={amount}
                                    onChange={(v) => { setAmount(v); setError(null); }}
                                    isInvalid={!!amountError} errorMessage={amountError ?? undefined}
                                />
                            )}
                        </>
                    )}

                    <p className="text-xs text-default-500">Cargá el número de transferencia, el comprobante, o ambos.</p>
                    <Input
                        label="Número de transferencia" variant="bordered" maxLength={120}
                        placeholder="Ej: TRF-000123"
                        value={transferRef} onValueChange={(v) => { setTransferRef(v); setError(null); }}
                    />
                    <div>
                        <input ref={fileRef} type="file" accept={RECEIPT_TYPES.join(",")} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                        <Button variant="bordered" startContent={<Paperclip className="h-4 w-4" aria-hidden="true" />} onPress={() => fileRef.current?.click()}>
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

export function RejectModal({ request, onClose }: { request: PendingPayoutRequest | null; onClose: () => void }) {
    const addToast = useToastStore((s) => s.addToast);
    const reject = useRejectPayout();
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { setReason(""); setError(null); }, [request?.id]);

    const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 300;

    const submit = () => {
        if (!request) return;
        reject.mutate(
            { requestId: request.id, reason: reason.trim() },
            {
                onSuccess: () => { addToast(`Solicitud de ${request.venueName} rechazada`); onClose(); },
                onError: (e: Error) => setError(e.message),
            },
        );
    };

    return (
        <Modal isOpen={!!request} onClose={() => !reject.isPending && onClose()} size="md" placement="center">
            <ModalContent>
                <ModalHeader>Rechazar solicitud</ModalHeader>
                <ModalBody className="gap-3">
                    {request && (
                        <p className="text-sm text-default-600">
                            {request.venueName} pidió <strong>{formatPoints(request.amount)}</strong>. Si la rechazás, ese monto vuelve a su disponible
                            y puede pedir de nuevo.
                        </p>
                    )}
                    <Textarea
                        label="Motivo" variant="bordered" isRequired minRows={2} maxLength={300}
                        placeholder="Ej: Faltan los datos bancarios del complejo"
                        value={reason}
                        onValueChange={(v) => { setReason(v); setError(null); }}
                        description={`${reason.trim().length}/300 · lo ve el complejo`}
                        isInvalid={reason.length > 0 && !reasonOk}
                    />
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
