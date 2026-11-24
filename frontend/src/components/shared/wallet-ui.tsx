"use client";

import { useState } from "react";
import { Button, Card, CardBody } from "@heroui/react";
import { ArrowDownRightIcon, ArrowUpRightIcon, CalculatorIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import { formatPoints } from "@/lib/points";
import { getReceiptUrl } from "@/hooks/use-wallet";
import { useToastStore } from "@/stores/toast-store";

/** Abre un comprobante privado de liquidación con una URL temporal (5 min). */
export function ReceiptButton({ path }: { path: string }) {
    const addToast = useToastStore((s) => s.addToast);
    const [loading, setLoading] = useState(false);
    return (
        <Button
            size="sm"
            variant="light"
            startContent={loading ? undefined : <DocumentTextIcon className="h-4 w-4" />}
            isLoading={loading}
            onPress={async () => {
                setLoading(true);
                try {
                    window.open(await getReceiptUrl(path), "_blank", "noopener,noreferrer");
                } catch (e) {
                    addToast((e as Error).message, "error");
                } finally {
                    setLoading(false);
                }
            }}
        >
            Ver comprobante
        </Button>
    );
}

/**
 * Total de la columna "Créditos" de un historial: entradas, salidas y neto de TODOS los
 * movimientos que cumplen los filtros (lo calcula la base, no solo la página visible).
 */
export function LedgerTotals({ sumIn, sumOut, sumNet, count, filtered, inHint, outHint }: {
    sumIn: number; sumOut: number; sumNet: number; count: number; filtered: boolean; inHint: string; outHint: string;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-3" aria-label="Total de la columna Créditos">
            <SummaryCard icon={<ArrowUpRightIcon className="h-5 w-5 text-success" />} label="Entradas" value={`+${formatPoints(sumIn)}`} hint={inHint} />
            <SummaryCard icon={<ArrowDownRightIcon className="h-5 w-5 text-danger" />} label="Salidas" value={`−${formatPoints(sumOut)}`} hint={outHint} />
            <SummaryCard
                icon={<CalculatorIcon className="h-5 w-5 text-primary" />}
                label="Total"
                value={`${sumNet < 0 ? "−" : ""}${formatPoints(Math.abs(sumNet))}`}
                hint={`${count} movimiento${count !== 1 ? "s" : ""}${filtered ? " con los filtros aplicados" : ""}`}
            />
        </div>
    );
}

/** Tarjeta de resumen (plana, sin sombra). */
export function SummaryCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
    return (
        <Card shadow="none" className="bg-content1">
            <CardBody className="gap-1 p-5">
                <div className="flex items-center gap-2 text-sm text-default-500">{icon}{label}</div>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                {hint && <p className="text-xs text-default-400">{hint}</p>}
            </CardBody>
        </Card>
    );
}
