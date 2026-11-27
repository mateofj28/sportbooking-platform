import { formatPointsNumber } from "@/lib/points";

/** Monto neutro en créditos (tarifas, precios): sin signo ni color. */
export function Credits({ amount, className = "" }: { amount: number; className?: string }) {
    return (
        <span className={`tabular-nums ${className}`}>
            {formatPointsNumber(amount)}
            <span className="ml-1 text-xs text-default-400">créditos</span>
        </span>
    );
}
