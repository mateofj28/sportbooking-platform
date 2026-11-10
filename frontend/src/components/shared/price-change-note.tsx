"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { PriceChange } from "@/hooks/use-bookings";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Aviso en una fecha pendiente de pago cuyo precio cambió porque el complejo
 * actualizó la tarifa (migración 029): "antes $63,000 · ahora $100,000".
 */
export function PriceChangeNote({ change, className = "" }: { change?: PriceChange; className?: string }) {
    if (!change) return null;
    const up = change.newTotal > change.oldTotal;
    const Icon = up ? TrendingUp : TrendingDown;
    return (
        <p role="status" className={`flex items-center gap-1.5 text-xs ${up ? "text-warning-600" : "text-success-600"} ${className}`}>
            <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span>
                {up ? "Subió el precio" : "Bajó el precio"} por cambio de tarifa: antes{" "}
                <span className="line-through">{money(change.oldTotal)}</span>, ahora {money(change.newTotal)} {change.currency}
            </span>
        </p>
    );
}
