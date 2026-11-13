"use client";

import { Input } from "@heroui/react";
import { formatPesos, formatPointsNumber } from "@/lib/points";

interface PointsInputProps {
    label: string;
    /** Cantidad entera, o null si el campo está vacío. */
    value: number | null;
    onChange: (value: number | null) => void;
    max?: number;
    isRequired?: boolean;
    isInvalid?: boolean;
    errorMessage?: string;
    size?: "sm" | "md" | "lg";
    className?: string;
}

/**
 * Cantidad de puntos con separador de miles mientras se escribe ("5,000") y su
 * equivalente en pesos debajo ("= $5,000 ARS"). Solo enteros positivos.
 * Es un campo de texto numérico (sin flechas), como pide la regla de diseño.
 */
export function PointsInput({ label, value, onChange, max = 100_000_000, isRequired, isInvalid, errorMessage, size = "md", className }: PointsInputProps) {
    return (
        <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            label={label}
            size={size}
            variant="bordered"
            className={className}
            isRequired={isRequired}
            value={value === null ? "" : formatPointsNumber(value)}
            onValueChange={(v) => {
                const digits = v.replace(/\D/g, "").replace(/^0+/, "");
                if (!digits) return onChange(null);
                onChange(Math.min(Number(digits), max));
            }}
            endContent={<span className="text-xs text-default-400">pts</span>}
            isInvalid={isInvalid}
            errorMessage={errorMessage}
            description={!isInvalid && value ? `= ${formatPesos(value)}` : undefined}
        />
    );
}
