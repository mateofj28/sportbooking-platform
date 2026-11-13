"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem,
    Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow,
} from "@heroui/react";
import { AlertTriangle, BadgeDollarSign, Banknote, Building2, Paperclip, PiggyBank, Wallet } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { ReceiptButton, SummaryCard } from "@/components/shared/wallet-ui";
import { useAdminBalances, useSettleVenueMonth, type BalanceMonth } from "@/hooks/use-wallet";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";
import { formatArDateTime, formatPeriod, formatPoints } from "@/lib/points";

const STATUS: Record<BalanceMonth["status"], { label: string; color: "success" | "warning" | "default" }> = {
    PAID: { label: "Pagado", color: "success" },
    PENDING: { label: "Pendiente", color: "warning" },
    IN_PROGRESS: { label: "Mes en curso", color: "default" },
};
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const RECEIPT_MAX = 5 * 1024 * 1024;

/** Balances del negocio y liquidación mensual a los complejos (admin general). */
export default function BalancesPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const isAdmin = user?.role === "ADMIN";
    const [venueFilter, setVenueFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [toSettle, setToSettle] = useState<BalanceMonth | null>(null);

    useEffect(() => {
        if (isHydrated && user && !isAdmin) router.replace("/dashboard");
    }, [isHydrated, user, isAdmin, router]);

    const { data, isLoading, isError, error } = useAdminBalances();

    const venues = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of data?.months ?? []) m.set(r.venueId, r.venueName);
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
    }, [data]);

    const rows = (data?.months ?? []).filter((r) =>
        (venueFilter === "ALL" || r.venueId === venueFilter) && (statusFilter === "ALL" || r.status === statusFilter));

    if (!isAdmin || isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
    if (isError || !data) return <p role="alert" className="text-sm text-danger">{error?.message ?? "No se pudieron cargar los balances"}</p>;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Balances</h1>
                <p className="mt-1 text-sm text-default-500">
                    Dinero real ingresado por la compra de puntos (1 punto = $1) y pagos mensuales a los complejos.
                </p>
            </div>

            {!data.balanced && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    Los saldos no cuadran (recaudado ≠ en billeteras + gastado). Avisá a soporte técnico antes de liquidar.
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard icon={<Banknote className="h-5 w-5 text-success" />} label="Recaudado" value={formatPoints(data.collected)} hint="Recargas menos ajustes (dinero real ingresado)" />
                <SummaryCard icon={<Wallet className="h-5 w-5 text-primary" />} label="En billeteras de clientes" value={formatPoints(data.inWallets)} hint="Puntos cargados que todavía no se usaron" />
                <SummaryCard icon={<PiggyBank className="h-5 w-5 text-secondary" />} label="Comisión de la empresa" value={formatPoints(data.commission)} hint="De los turnos ya jugados" />
                <SummaryCard icon={<BadgeDollarSign className="h-5 w-5 text-success" />} label="Pagado a complejos" value={formatPoints(data.paidToVenues)} />
                <SummaryCard icon={<Building2 className="h-5 w-5 text-warning" />} label="Pendiente de pagar a complejos" value={formatPoints(data.pendingToVenues)} hint="Incluye el mes en curso" />
                <SummaryCard icon={<Wallet className="h-5 w-5 text-default-500" />} label="Pagado en turnos por jugar" value={formatPoints(data.spentNotPlayed)} hint="Reservas pagadas que todavía no se jugaron" />
            </div>

            <section className="space-y-3" aria-label="Liquidaciones por complejo">
                <h2 className="text-lg font-semibold">Liquidaciones por complejo y mes</h2>
                <div className="flex flex-wrap gap-3">
                    <Select label="Complejo" size="sm" variant="bordered" className="max-w-xs" disallowEmptySelection
                        selectedKeys={[venueFilter]} onSelectionChange={(k: unknown) => setVenueFilter((Array.from(k as Set<string>)[0] as string) || "ALL")}>
                        {[<SelectItem key="ALL">Todos los complejos</SelectItem>, ...venues.map(([id, name]) => <SelectItem key={id}>{name}</SelectItem>)]}
                    </Select>
                    <Select label="Estado" size="sm" variant="bordered" className="max-w-[200px]" disallowEmptySelection
                        selectedKeys={[statusFilter]} onSelectionChange={(k: unknown) => setStatusFilter((Array.from(k as Set<string>)[0] as string) || "ALL")}>
                        <SelectItem key="ALL">Todos los estados</SelectItem>
                        <SelectItem key="PENDING">Pendientes</SelectItem>
                        <SelectItem key="PAID">Pagados</SelectItem>
                        <SelectItem key="IN_PROGRESS">Mes en curso</SelectItem>
                    </Select>
                </div>

                <DataTable aria-label="Liquidaciones por complejo y mes">
                    <TableHeader>
                        <TableColumn>COMPLEJO</TableColumn>
                        <TableColumn>MES</TableColumn>
                        <TableColumn align="center">TURNOS</TableColumn>
                        <TableColumn align="end">A LIQUIDAR</TableColumn>
                        <TableColumn align="end">COMISIÓN</TableColumn>
                        <TableColumn>ESTADO</TableColumn>
                        <TableColumn align="end">ACCIONES</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Todavía no hay turnos jugados">
                        {rows.map((r) => (
                            <TableRow key={`${r.venueId}-${r.period}`}>
                                <TableCell className="font-medium">{r.venueName}</TableCell>
                                <TableCell>{formatPeriod(r.period)}</TableCell>
                                <TableCell className="text-center">{r.bookings}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(r.amount)}</TableCell>
                                <TableCell className="text-right tabular-nums text-default-500">{formatPoints(r.commission)}</TableCell>
                                <TableCell>
                                    <Chip size="sm" variant="flat" color={STATUS[r.status].color}>{STATUS[r.status].label}</Chip>
                                    {r.paidAt && <p className="mt-0.5 text-[11px] text-default-400">{formatArDateTime(r.paidAt)}{r.transferRef ? ` · ${r.transferRef}` : ""}</p>}
                                </TableCell>
                                <TableCell className="text-right">
                                    {r.status === "PENDING" && (
                                        <Button size="sm" color="primary" variant="flat" onPress={() => setToSettle(r)}>Registrar pago</Button>
                                    )}
                                    {r.status === "PAID" && r.receiptPath && <ReceiptButton path={r.receiptPath} />}
                                    {r.status === "IN_PROGRESS" && <span className="text-xs text-default-400">Se liquida al terminar el mes</span>}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </section>

            <SettleModal month={toSettle} onClose={() => setToSettle(null)} />
        </div>
    );
}

function SettleModal({ month, onClose }: { month: BalanceMonth | null; onClose: () => void }) {
    const addToast = useToastStore((s) => s.addToast);
    const settle = useSettleVenueMonth();
    const fileRef = useRef<HTMLInputElement>(null);
    const [transferRef, setTransferRef] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { setTransferRef(""); setFile(null); setError(null); }, [month?.venueId, month?.period]);

    const refOk = transferRef.trim().length <= 120;
    const canSubmit = refOk && (transferRef.trim().length > 0 || !!file);

    const pickFile = (f: File | undefined) => {
        setError(null);
        if (!f) return;
        if (!RECEIPT_TYPES.includes(f.type)) return setError("El comprobante tiene que ser una imagen (JPG, PNG, WebP) o un PDF.");
        if (f.size > RECEIPT_MAX) return setError("El comprobante pesa más de 5 MB.");
        setFile(f);
    };

    const submit = () => {
        if (!month) return;
        settle.mutate(
            { venueId: month.venueId, period: month.period, transferRef, file },
            {
                onSuccess: (r) => {
                    addToast(`Pago registrado: ${formatPoints(r.amount)} a ${month.venueName} (${formatPeriod(month.period)})`);
                    onClose();
                },
                onError: (e: Error) => setError(e.message),
            },
        );
    };

    return (
        <Modal isOpen={!!month} onClose={() => !settle.isPending && onClose()} size="md" placement="center">
            <ModalContent>
                <ModalHeader>Registrar pago a sede</ModalHeader>
                <ModalBody className="gap-4">
                    {month && (
                        <dl className="space-y-1 rounded-xl border border-divider p-4 text-sm">
                            <div className="flex justify-between"><dt className="text-default-500">Complejo</dt><dd className="font-medium">{month.venueName}</dd></div>
                            <div className="flex justify-between"><dt className="text-default-500">Mes</dt><dd>{formatPeriod(month.period)}</dd></div>
                            <div className="flex justify-between"><dt className="text-default-500">Turnos jugados</dt><dd>{month.bookings}</dd></div>
                            <div className="flex justify-between border-t border-divider pt-1"><dt className="text-default-500">Monto a transferir</dt><dd className="text-lg font-bold">{formatPoints(month.amount)}</dd></div>
                        </dl>
                    )}
                    <p className="text-xs text-default-500">El monto es el exacto del mes y no se puede cambiar. Cargá el número de transferencia, el comprobante, o ambos.</p>
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
                    <Button variant="light" onPress={onClose} isDisabled={settle.isPending}>Cancelar</Button>
                    <Button color="primary" onPress={submit} isDisabled={!canSubmit} isLoading={settle.isPending}>
                        Registrar pago de {month ? formatPoints(month.amount) : ""}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
