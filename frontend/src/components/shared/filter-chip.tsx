"use client";

import type { ReactNode } from "react";

export type FilterChipColor = "primary" | "success" | "warning" | "danger" | "default";

/**
 * Seleccionado: relleno con el color del filtro. Se usan los tokens del tema
 * (bg-primary, text-primary-foreground…) para que funcione en claro y oscuro.
 * "default" (ej. Completadas) usa el color de texto como fondo para diferenciarse
 * del gris de los no seleccionados.
 */
const SELECTED: Record<FilterChipColor, string> = {
    primary: "bg-primary text-primary-foreground",
    success: "bg-success text-success-foreground",
    warning: "bg-warning text-warning-foreground",
    danger: "bg-danger text-danger-foreground",
    default: "bg-foreground text-background",
};

interface FilterChipProps {
    label: ReactNode;
    /** Número opcional que se muestra al lado, en un tono más suave. */
    count?: number;
    selected: boolean;
    color?: FilterChipColor;
    onSelect: () => void;
}

/**
 * Pastilla de filtro (ej. "Realizadas 6").
 *
 * - No seleccionada: relleno gris suave, sin borde.
 * - Seleccionada: relleno con el color del filtro.
 * - Es un <button> con aria-pressed: se usa con teclado (Tab + Enter/Espacio) y el
 *   lector de pantalla anuncia si está activa. Sin transiciones (regla de diseño).
 */
export function FilterChip({ label, count, selected, color = "primary", onSelect }: FilterChipProps) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            className={[
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected ? SELECTED[color] : "bg-default-100 text-default-700 hover:bg-default-200",
            ].join(" ")}
        >
            <span>{label}</span>
            {count !== undefined && (
                <span className={selected ? "opacity-80" : "text-default-400"}>{count}</span>
            )}
        </button>
    );
}
