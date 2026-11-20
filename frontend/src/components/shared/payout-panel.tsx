"use client";

// ============================================================
// components/shared/payout-panel.tsx
// Pestaña "Solicitudes de pago" de Créditos (admin general): saldo por complejo, solicitudes
// pendientes y pagos realizados. Cada tabla pide a la base solo su página, con los filtros
// aplicados allá (migración 056); el filtro de complejo afecta a las tres.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Autocomplete, AutocompleteItem, Input, Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow, Button } from "@heroui/react";
import { Clock, Search } from "@/components/icons";
import { DataTable } from "@/components/shared/data-table";
import { ReceiptButton } from "@/components/shared/wallet-ui";
import { LedgerFilters, LedgerPagination, type LedgerFilterValue } from "@/components/shared/ledger-filters";
import { PayModal, PayoutRequestsTable, RejectModal, type PayTarget } from "@/components/shared/payout-admin";
import {
    useAdminPayoutRequests, useAdminVenueBalances, useAdminVenuePayments, type PendingPayoutRequest, type VenueBalance,
} from "@/hooks/use-wallet";
import { useAllVenues } from "@/hooks/use-venues";
import { formatDateTimeAr } from "@/lib/datetime";
import { formatPoints } from "@/lib/points";

const PAGE_SIZE = 20;
/** Opción "Todos los complejos" del filtro. */
const ALL_KEY = "ALL";

/**
 * Página que vuelve a 1 cuando cambian los filtros, sin pedir antes la página vieja con los
 * filtros nuevos (la página se guarda junto con la "firma" de los filtros).
 */
function usePageFor(filterKey: string) {
    const [state, setState] = useState({ key: filterKey, page: 1 });
    const page = state.key === filterKey ? state.page : 1;
    return [page, (p: number) => setState({ key: filterKey, page: p })] as const;
}

export function PayoutRequestsPanel() {
    const [venueKey, setVenueKey] = useState<string>(ALL_KEY);
    const venueId = venueKey === ALL_KEY ? null : venueKey;
    const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
    const [toReject, setToReject] = useState<PendingPayoutRequest | null>(null);

    return (
        <div className="space-y-8">
            <VenuePicker value={venueKey} onChange={setVenueKey} />

            <VenueBalancesSection venueId={venueId} onPay={(venue) => setPayTarget({ kind: "direct", venue })} />

            <RequestsSection
                venueId={venueId}
                onPay={(request) => setPayTarget({ kind: "request", request })}
                onReject={setToReject}
            />

            <PaymentsSection venueId={venueId} />

            <PayModal target={payTarget} onClose={() => setPayTarget(null)} />
            <RejectModal request={toReject} onClose={() => setToReject(null)} />
        </div>
    );
}

/** Complejo con búsqueda por nombre (sirve igual con 5 o con 500 complejos). */
function VenuePicker({ value, onChange }: { value: string; onChange: (k: string) => void }) {
    // Misma consulta y caché (10 min) que el resto del panel admin
    const { data: venues = [], isLoading } = useAllVenues();
    const items = useMemo(
        () => [{ id: ALL_KEY, name: "Todos los complejos", city: "" }, ...venues.map((v) => ({ id: v.id, name: v.name, city: v.city ?? "" }))],
        [venues],
    );
    return (
        <Autocomplete
            label="Complejo"
            size="sm"
            variant="bordered"
            className="max-w-xs"
            placeholder="Buscar complejo..."
            isLoading={isLoading}
            defaultItems={items}
            selectedKey={value}
            // Borrar el texto o elegir nada vuelve a "Todos los complejos"
            onSelectionChange={(k) => onChange(k ? String(k) : ALL_KEY)}
        >
            {(v) => (
                <AutocompleteItem key={v.id} textValue={v.name}>
                    <div>
                        <p className="text-sm">{v.name}</p>
                        {v.city && <p className="text-xs text-default-400">{v.city}</p>}
                    </div>
                </AutocompleteItem>
            )}
        </Autocomplete>
    );
}

function VenueBalancesSection({ venueId, onPay }: {
    venueId: string | null;
    onPay: (v: VenueBalance) => void;
}) {
    const [page, setPage] = usePageFor(venueId ?? ALL_KEY);
    const { data, isLoading, isFetching, isError, error } = useAdminVenueBalances(venueId, page, PAGE_SIZE);
    const items = data?.items ?? [];
    const totals = data?.totals;
    const showTotals = !!totals && (data?.total ?? 0) > 1;

    const rows = items.map((v) => (
        <TableRow key={v.venueId}>
            <TableCell className="font-medium">{v.venueName}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPoints(v.balance)}</TableCell>
            <TableCell className="text-right tabular-nums text-default-500">{formatPoints(v.reserved)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{formatPoints(v.available)}</TableCell>
            <TableCell className="text-right tabular-nums text-default-500">{formatPoints(v.commission)}</TableCell>
            <TableCell className="text-default-500">{v.lastPaidAt ? formatDateTimeAr(v.lastPaidAt) : "—"}</TableCell>
            <TableCell className="text-right">
                <Button size="sm" variant="bordered" isDisabled={v.available <= 0} onPress={() => onPay(v)}>Pagar</Button>
            </TableCell>
        </TableRow>
    ));
    if (showTotals && items.length > 0) {
        rows.push(
            <TableRow key="__total" className="border-t border-divider">
                <TableCell className="font-semibold">Total ({data!.total} complejos)</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(totals!.balance)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(totals!.reserved)}</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{formatPoints(totals!.available)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatPoints(totals!.commission)}</TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
            </TableRow>,
        );
    }

    return (
        <section className="space-y-3" aria-label="Saldo por complejo" aria-busy={isFetching}>
            <h2 className="text-lg font-semibold">Saldo por complejo</h2>
            {isError ? (
                <p role="alert" className="text-sm text-danger">{error?.message ?? "No se pudo cargar el saldo"}</p>
            ) : (
                <>
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
                        <TableBody isLoading={isLoading} loadingContent={<Spinner />} emptyContent={isLoading ? " " : "Todavía no hay turnos jugados"}>
                            {rows}
                        </TableBody>
                    </DataTable>
                    <LedgerPagination total={data?.total ?? 0} page={page} size={PAGE_SIZE} onPage={setPage} noun={["complejo", "complejos"]} />
                    <p className="text-xs text-default-400">
                        Ordenado por lo disponible para pagar. &quot;Pagar&quot; paga sin que el complejo lo pida, hasta lo disponible;
                        lo ya solicitado se paga desde la solicitud.
                    </p>
                </>
            )}
        </section>
    );
}

function RequestsSection({ venueId, onPay, onReject }: {
    venueId: string | null;
    onPay: (r: PendingPayoutRequest) => void;
    onReject: (r: PendingPayoutRequest) => void;
}) {
    const { data = [], isLoading, isError, error } = useAdminPayoutRequests(venueId);
    return (
        <section className="space-y-3" aria-label="Solicitudes de pago pendientes">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-5 w-5 text-warning" aria-hidden="true" /> Solicitudes de pago pendientes
            </h2>
            <p className="text-sm text-default-500">
                Pagá por el monto pedido o rechazá con un motivo (el monto vuelve a su disponible). Las más viejas primero.
            </p>
            {isError ? (
                <p role="alert" className="text-sm text-danger">{error?.message ?? "No se pudieron cargar las solicitudes"}</p>
            ) : (
                <PayoutRequestsTable requests={data} onPay={onPay} onReject={onReject} isLoading={isLoading} />
            )}
        </section>
    );
}

function PaymentsSection({ venueId }: { venueId: string | null }) {
    const [dates, setDates] = useState<LedgerFilterValue>({ from: "", to: "", kind: "ALL" });
    const [text, setText] = useState("");
    const [search, setSearch] = useState("");

    // Buscar al dejar de escribir (una consulta, no una por letra)
    useEffect(() => {
        const t = setTimeout(() => setSearch(text.trim()), 300);
        return () => clearTimeout(t);
    }, [text]);

    const filterKey = `${venueId ?? ALL_KEY}|${dates.from}|${dates.to}|${search}`;
    const [page, setPage] = usePageFor(filterKey);
    const { data, isLoading, isFetching, isError, error } = useAdminVenuePayments({
        venueId, from: dates.from, to: dates.to, search, page, size: PAGE_SIZE,
    });
    const items = data?.items ?? [];
    const filtered = !!venueId || !!dates.from || !!search;

    const rows = items.map((p) => (
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
    ));
    if (data && items.length > 0) {
        rows.push(
            <TableRow key="__total" className="border-t border-divider">
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-default-500">
                    {data.total} pago{data.total !== 1 ? "s" : ""}{filtered ? " con los filtros aplicados" : ""}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">{formatPoints(data.sumAmount)}</TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
            </TableRow>,
        );
    }

    return (
        <section className="space-y-3" aria-label="Pagos realizados" aria-busy={isFetching}>
            <h2 className="text-lg font-semibold">Pagos realizados</h2>
            <LedgerFilters
                value={dates}
                onChange={setDates}
                extraActive={!!text}
                onClearExtra={() => { setText(""); setSearch(""); }}
            >
                <Input
                    aria-label="Buscar por número de transferencia"
                    placeholder="Nº de transferencia…"
                    size="sm"
                    variant="bordered"
                    className="w-full max-w-[240px]"
                    maxLength={120}
                    value={text}
                    onValueChange={setText}
                    isClearable
                    onClear={() => setText("")}
                    startContent={<Search className="h-4 w-4 text-default-400" aria-hidden="true" />}
                />
            </LedgerFilters>
            {isError ? (
                <p role="alert" className="text-sm text-danger">{error?.message ?? "No se pudieron cargar los pagos"}</p>
            ) : (
                <>
                    <DataTable aria-label="Pagos realizados a complejos">
                        <TableHeader>
                            <TableColumn>FECHA Y HORA</TableColumn>
                            <TableColumn>COMPLEJO</TableColumn>
                            <TableColumn align="end">MONTO</TableColumn>
                            <TableColumn>ORIGEN</TableColumn>
                            <TableColumn align="end">COMPROBANTE</TableColumn>
                        </TableHeader>
                        <TableBody
                            isLoading={isLoading}
                            loadingContent={<Spinner />}
                            emptyContent={isLoading ? " " : filtered ? "Ningún pago coincide con los filtros" : "Todavía no hay pagos"}
                        >
                            {rows}
                        </TableBody>
                    </DataTable>
                    <LedgerPagination total={data?.total ?? 0} page={page} size={PAGE_SIZE} onPage={setPage} noun={["pago", "pagos"]} />
                </>
            )}
        </section>
    );
}
