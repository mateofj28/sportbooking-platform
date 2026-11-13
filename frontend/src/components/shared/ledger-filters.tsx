"use client";

import { useMemo } from "react";
import { Button, DateRangePicker, Pagination, Select, SelectItem } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { todayAr, addYearsToDate } from "@/lib/ads";

export interface LedgerFilterValue {
    from: string;
    to: string;
    kind: string;
}

interface LedgerFiltersProps {
    value: LedgerFilterValue;
    onChange: (v: LedgerFilterValue) => void;
    /** Opciones de tipo; la primera debe ser { key: "ALL", label: "Todos los movimientos" }. */
    kinds: { key: string; label: string }[];
    children?: React.ReactNode;
}

/** Historial: hasta 2 años hacia atrás y nunca en el futuro (hora AR). */
const HISTORY_YEARS = 2;

/**
 * Filtros de los historiales de puntos: rango de fechas (hora AR) y tipo de movimiento.
 * Cambiar un filtro vuelve a la página 1 (lo maneja quien lo usa).
 */
export function LedgerFilters({ value, onChange, kinds, children }: LedgerFiltersProps) {
    const today = todayAr();
    const minDay = addYearsToDate(today, -HISTORY_YEARS);
    const minDate = useMemo(() => parseDate(minDay), [minDay]);
    const maxDate = useMemo(() => parseDate(today), [today]);
    const range = value.from && value.to ? { start: parseDate(value.from), end: parseDate(value.to) } : null;
    const hasFilters = !!value.from || value.kind !== "ALL";

    return (
        <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filtros del historial">
            <DateRangePicker
                aria-label="Rango de fechas"
                label="Fechas"
                size="sm"
                variant="bordered"
                className="w-full max-w-xs"
                // Cast: HeroUI trae su copia de @internationalized/date (mismo runtime)
                minValue={minDate as any}
                maxValue={maxDate as any}
                value={range as any}
                onChange={(v) => {
                    const r = v as { start: CalendarDate; end: CalendarDate } | null;
                    if (!r) return onChange({ ...value, from: "", to: "" });
                    const from = r.start.toString();
                    const to = r.end.toString();
                    // Fuera de límites (escrito a mano): se ignora
                    if (from < minDay || to > today || to < from) return;
                    onChange({ ...value, from, to });
                }}
            />
            <Select
                label="Tipo"
                size="sm"
                variant="bordered"
                className="w-full max-w-[220px]"
                disallowEmptySelection
                selectedKeys={[value.kind]}
                onSelectionChange={(keys: unknown) => onChange({ ...value, kind: (Array.from(keys as Set<string>)[0] as string) || "ALL" })}
            >
                {kinds.map((k) => <SelectItem key={k.key}>{k.label}</SelectItem>)}
            </Select>
            {children}
            {hasFilters && (
                <Button size="sm" variant="light" onPress={() => onChange({ from: "", to: "", kind: "ALL" })}>
                    Quitar filtros
                </Button>
            )}
        </div>
    );
}

/** Paginación del historial ("X movimientos" + páginas). */
export function LedgerPagination({ total, page, size, onPage }: { total: number; page: number; size: number; onPage: (p: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / size));
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-default-500">{total} movimiento{total !== 1 ? "s" : ""}</p>
            {pages > 1 && <Pagination size="sm" total={pages} page={page} onChange={onPage} showControls />}
        </div>
    );
}
