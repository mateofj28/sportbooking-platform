"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup,
    Spinner, Tab, TableBody, TableCell, TableColumn, TableHeader, TableRow, Tabs, Textarea,
} from "@heroui/react";
import { Search, SlidersHorizontal } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PointsAmount } from "@/components/shared/points-amount";
import { ReceiptButton } from "@/components/shared/wallet-ui";
import { PointsInput } from "@/components/shared/points-input";
import { LedgerFilters, LedgerPagination, type LedgerFilterValue } from "@/components/shared/ledger-filters";
import { useAdjustPoints, useAdminPointsUsers, useAdminWalletHistory, type PointsUser } from "@/hooks/use-wallet";
import { useAuthStore } from "@/stores/auth-store";
import { useToastStore } from "@/stores/toast-store";
import { formatArDateTime, formatPesos, formatPoints } from "@/lib/points";

const PAGE_SIZE = 20;
const MAX_ADJUST = 100_000_000;
const ROLE_LABEL: Record<string, string> = { CLIENT: "Cliente", VENUE_ADMIN: "Admin de sede", ADMIN: "Admin general" };
const HISTORY_KINDS = [
    { key: "ALL", label: "Todos los movimientos" },
    { key: "TOPUP", label: "Cargas de puntos" },
    { key: "ADJUSTMENT", label: "Ajustes (restas)" },
    { key: "SETTLEMENT", label: "Pagos a complejos" },
];

/** Gestión de puntos (admin general): cargar/ajustar puntos y ver el historial global. */
export default function PointsPage() {
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const isHydrated = useAuthStore((s) => s.isHydrated);
    const isAdmin = user?.role === "ADMIN";

    useEffect(() => {
        if (isHydrated && user && !isAdmin) router.replace("/dashboard");
    }, [isHydrated, user, isAdmin, router]);

    if (!isAdmin) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Puntos</h1>
                <p className="mt-1 text-sm text-default-500">
                    Cargá los puntos que compran los clientes (1 punto = $1) y corregí errores. Cada movimiento queda registrado con su motivo.
                </p>
            </div>
            <Tabs aria-label="Secciones de puntos" variant="underlined">
                <Tab key="users" title="Clientes"><UsersTab /></Tab>
                <Tab key="history" title="Historial global"><HistoryTab /></Tab>
            </Tabs>
        </div>
    );
}

function UsersTab() {
    const [text, setText] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [target, setTarget] = useState<PointsUser | null>(null);

    // Buscar al dejar de escribir
    useEffect(() => {
        const t = setTimeout(() => { setSearch(text.trim()); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [text]);

    const { data, isLoading, isError, error } = useAdminPointsUsers(search, page, PAGE_SIZE);

    return (
        <div className="space-y-3">
            <Input
                aria-label="Buscar cliente"
                placeholder="Buscar por nombre, email o DNI…"
                size="sm"
                variant="bordered"
                className="max-w-md"
                value={text}
                onValueChange={setText}
                isClearable
                onClear={() => setText("")}
                startContent={<Search className="h-4 w-4 text-default-400" aria-hidden="true" />}
            />
            {isError ? (
                <p role="alert" className="text-sm text-danger">{error?.message}</p>
            ) : (
                <>
                    <DataTable aria-label="Clientes y sus puntos">
                        <TableHeader>
                            <TableColumn>CLIENTE</TableColumn>
                            <TableColumn>ROL</TableColumn>
                            <TableColumn align="end">SALDO</TableColumn>
                            <TableColumn align="end">GASTADO (HISTÓRICO)</TableColumn>
                            <TableColumn align="end">ACCIONES</TableColumn>
                        </TableHeader>
                        <TableBody isLoading={isLoading} loadingContent={<Spinner />} emptyContent={search ? "Nadie coincide con la búsqueda" : "No hay usuarios"}>
                            {(data?.items ?? []).map((u) => (
                                <TableRow key={u.id}>
                                    <TableCell>
                                        <p className="font-medium">{u.firstName} {u.lastName}</p>
                                        <p className="text-xs text-default-400">{u.email}{u.dni ? ` · DNI ${u.dni}` : ""}</p>
                                    </TableCell>
                                    <TableCell><Chip size="sm" variant="flat">{ROLE_LABEL[u.role] ?? u.role}</Chip></TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums">{formatPoints(u.balance)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-default-500">{formatPoints(u.spent)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" variant="flat" color="primary"
                                            startContent={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
                                            onPress={() => setTarget(u)}>
                                            Ajustar puntos
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </DataTable>
                    <LedgerPagination total={data?.total ?? 0} page={page} size={PAGE_SIZE} onPage={setPage} />
                </>
            )}
            <AdjustModal user={target} onClose={() => setTarget(null)} />
        </div>
    );
}

function AdjustModal({ user, onClose }: { user: PointsUser | null; onClose: () => void }) {
    const addToast = useToastStore((s) => s.addToast);
    const adjust = useAdjustPoints();
    const [mode, setMode] = useState<"add" | "subtract">("add");
    const [amountValue, setAmountValue] = useState<number | null>(null);
    const [reason, setReason] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setMode("add"); setAmountValue(null); setReason(""); setConfirming(false); setError(null);
    }, [user?.id]);

    const amount = amountValue ?? 0;
    const amountOk = Number.isInteger(amount) && amount > 0 && amount <= MAX_ADJUST;
    const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 300;
    const signed = mode === "add" ? amount : -amount;
    const resulting = (user?.balance ?? 0) + (amountOk ? signed : 0);
    const wouldBeNegative = amountOk && resulting < 0;

    const amountError = amountValue !== null && !amountOk ? `Ingresá un número entero entre 1 y ${formatPoints(MAX_ADJUST)}` :
        wouldBeNegative ? `Tiene ${formatPoints(user?.balance ?? 0)}: no se le pueden restar ${formatPoints(amount)}` : null;

    const submit = () => {
        if (!user) return;
        adjust.mutate(
            { userId: user.id, amount: signed, reason: reason.trim() },
            {
                onSuccess: (r) => {
                    addToast(`${mode === "add" ? "Cargaste" : "Restaste"} ${formatPoints(amount)} a ${user.firstName}. Saldo: ${formatPoints(r.balance)}`);
                    onClose();
                },
                onError: (e: Error) => { setError(e.message); setConfirming(false); },
            },
        );
    };

    return (
        <Modal isOpen={!!user} onClose={() => !adjust.isPending && onClose()} size="md" placement="center">
            <ModalContent>
                <ModalHeader>Ajustar puntos</ModalHeader>
                <ModalBody className="gap-4">
                    {user && (
                        <p className="text-sm text-default-600">
                            {user.firstName} {user.lastName} · saldo actual <span className="font-semibold">{formatPoints(user.balance)}</span>
                        </p>
                    )}
                    {!confirming ? (
                        <>
                            <RadioGroup label="Operación" orientation="horizontal" value={mode} onValueChange={(v) => setMode(v as "add" | "subtract")}>
                                <Radio value="add" description="Recarga: dinero recibido">Sumar</Radio>
                                <Radio value="subtract" description="Corrección">Restar</Radio>
                            </RadioGroup>
                            <PointsInput
                                label="Cantidad de puntos" isRequired max={MAX_ADJUST}
                                value={amountValue}
                                onChange={(v) => { setAmountValue(v); setError(null); }}
                                isInvalid={!!amountError} errorMessage={amountError ?? undefined}
                            />
                            <Textarea
                                label="Motivo" variant="bordered" isRequired minRows={2} maxLength={300}
                                placeholder="Ej: Transferencia comprobante #123"
                                value={reason}
                                onValueChange={(v) => { setReason(v); setError(null); }}
                                description={`${reason.trim().length}/300 · obligatorio (mínimo 3 caracteres)`}
                                isInvalid={reason.length > 0 && !reasonOk}
                            />
                        </>
                    ) : (
                        <div className="space-y-2 rounded-xl border border-divider p-4 text-sm">
                            <p>Vas a <strong>{mode === "add" ? "sumar" : "restar"} {formatPoints(amount)}</strong> ({formatPesos(amount)}).</p>
                            <p>Saldo resultante: <strong>{formatPoints(resulting)}</strong></p>
                            <p className="text-default-500">Motivo: {reason.trim()}</p>
                            <p className="text-xs text-default-400">El movimiento no se puede editar ni borrar; para corregirlo, hacé otro ajuste.</p>
                        </div>
                    )}
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </ModalBody>
                <ModalFooter>
                    {confirming ? (
                        <>
                            <Button variant="light" onPress={() => setConfirming(false)} isDisabled={adjust.isPending}>Volver</Button>
                            <Button color={mode === "add" ? "primary" : "danger"} onPress={submit} isLoading={adjust.isPending}>
                                Confirmar {mode === "add" ? "carga" : "resta"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="light" onPress={onClose}>Cancelar</Button>
                            <Button color="primary" isDisabled={!amountOk || !reasonOk || wouldBeNegative} onPress={() => setConfirming(true)}>
                                Continuar
                            </Button>
                        </>
                    )}
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}

function HistoryTab() {
    const [filters, setFilters] = useState<LedgerFilterValue>({ from: "", to: "", kind: "ALL" });
    const [page, setPage] = useState(1);
    const params = useMemo(() => ({ ...filters, page, size: PAGE_SIZE }), [filters, page]);
    const { data, isLoading, isError, error } = useAdminWalletHistory(params);

    return (
        <div className="space-y-3">
            <LedgerFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} kinds={HISTORY_KINDS} />
            {isError ? (
                <p role="alert" className="text-sm text-danger">{error?.message}</p>
            ) : (
                <>
                    <DataTable aria-label="Historial global de puntos">
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
                                        <p className="font-medium">{m.detail}</p>
                                        <p className="max-w-[420px] truncate text-xs text-default-400">
                                            {m.reason ?? (m.transferRef ? `Transferencia ${m.transferRef}` : "")}
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
        </div>
    );
}
