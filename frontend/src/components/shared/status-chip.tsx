"use client";

import { Chip, type ChipProps } from "@heroui/react";

/**
 * Badge de estado del panel (Realizada, Cancelada, Fijo, Tu reserva…).
 *
 * Igual que <Chip size="sm" variant="flat"> (regla de diseño), pero con más aire a
 * los costados: el tamaño sm de HeroUI deja el texto casi pegado al borde.
 * Si lleva ícono (startContent), el espacio entre ícono y texto también es parejo.
 */
export function StatusChip({ classNames, ...props }: ChipProps) {
    return (
        <Chip
            size="sm"
            variant="flat"
            {...props}
            classNames={{
                ...classNames,
                base: ["h-6 gap-1 px-2.5", classNames?.base].filter(Boolean).join(" "),
                content: ["px-0.5", classNames?.content].filter(Boolean).join(" "),
            }}
        />
    );
}
