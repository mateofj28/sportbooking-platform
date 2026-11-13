import { formatSignedPoints } from "@/lib/points";

/**
 * Monto de un movimiento: verde con "+" si suma, rojo con "−" si resta.
 * No depende solo del color: lleva el signo y un texto para lectores de pantalla.
 */
export function PointsAmount({ amount, className = "" }: { amount: number; className?: string }) {
    const positive = amount > 0;
    return (
        // "!" porque globals.css fuerza el color de .font-semibold (regla de diseño)
        <span className={`font-semibold tabular-nums ${positive ? "text-success!" : "text-danger!"} ${className}`}>
            <span className="sr-only">{positive ? "Suma " : "Resta "}</span>
            {formatSignedPoints(amount)}
            <span className="ml-1 text-xs font-normal text-default-400">pts</span>
        </span>
    );
}
