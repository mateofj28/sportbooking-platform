"use client";

import { Select, SelectItem } from "@heroui/react";
import { MapPin } from "lucide-react";
import { PROVINCES, isProvinceCode } from "@/lib/ar-provinces";

interface ProvinceSelectProps {
    /** Código ISO (ej. "AR-X") o "" / null si no hay selección. */
    value: string | null | undefined;
    onChange: (code: string) => void;
    label?: string;
    placeholder?: string;
    isRequired?: boolean;
    isInvalid?: boolean;
    errorMessage?: string;
    isDisabled?: boolean;
    description?: string;
    size?: "sm" | "md" | "lg";
}

/**
 * Selector de provincia (24 jurisdicciones, ISO 3166-2:AR).
 * Componente único para registro, perfil y el aviso del inicio:
 * así la ubicación del cliente se captura siempre igual.
 */
export function ProvinceSelect({
    value,
    onChange,
    label = "Provincia",
    placeholder = "Elegí tu provincia",
    isRequired,
    isInvalid,
    errorMessage,
    isDisabled,
    description,
    size,
}: ProvinceSelectProps) {
    const selected = isProvinceCode(value) ? [value] : [];

    return (
        <Select
            label={label}
            placeholder={placeholder}
            variant="bordered"
            size={size}
            isRequired={isRequired}
            isInvalid={isInvalid}
            errorMessage={errorMessage}
            isDisabled={isDisabled}
            description={description}
            disallowEmptySelection
            startContent={<MapPin className="h-4 w-4 text-default-400" />}
            selectedKeys={selected}
            onSelectionChange={(keys: unknown) => {
                const code = Array.from(keys as Set<string>)[0];
                if (code) onChange(code);
            }}
        >
            {PROVINCES.map((p) => (
                <SelectItem key={p.code}>{p.name}</SelectItem>
            ))}
        </Select>
    );
}
