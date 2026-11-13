"use client";

import { Autocomplete, AutocompleteItem, Select, SelectItem, Spinner } from "@heroui/react";
import { useMemo } from "react";
import { PROVINCES } from "@/lib/ar-provinces";
import { useLocalityIndex } from "@/components/shared/locality-picker";

export interface MunicipalityValue {
    /** Provincia ISO 3166-2:AR (ej. "AR-R"). */
    provinceCode: string;
    /** Municipio del catálogo (ej. "mun-620161"). */
    localityCode: string;
}

interface MunicipalityFieldsProps {
    value: MunicipalityValue;
    onChange: (value: MunicipalityValue) => void;
    isRequired?: boolean;
    errorMessage?: string;
}

/**
 * Provincia + Municipio, del mismo catálogo que usan la publicidad y "¿Dónde querés jugar?"
 * (public/geo/ar-localities-index.json). Elegir otra provincia limpia el municipio.
 */
export function MunicipalityFields({ value, onChange, isRequired, errorMessage }: MunicipalityFieldsProps) {
    const { data: index, isLoading } = useLocalityIndex();

    const municipalities = useMemo(() => {
        if (!index || !value.provinceCode) return [];
        return [...index.values()]
            .filter((l) => l.province === value.provinceCode)
            .sort((a, b) => a.name.localeCompare(b.name, "es"));
    }, [index, value.provinceCode]);

    return (
        <div className="grid gap-4 sm:grid-cols-2" role="group" aria-label="Ubicación del complejo">
            <Select
                label="Provincia"
                placeholder="Elegí la provincia"
                variant="bordered"
                isRequired={isRequired}
                selectedKeys={value.provinceCode ? [value.provinceCode] : []}
                onSelectionChange={(keys: unknown) => {
                    const code = (Array.from(keys as Set<string>)[0] as string) ?? "";
                    if (code !== value.provinceCode) onChange({ provinceCode: code, localityCode: "" });
                }}
            >
                {PROVINCES.map((p) => <SelectItem key={p.code}>{p.name}</SelectItem>)}
            </Select>
            <Autocomplete
                label="Municipio"
                placeholder={value.provinceCode ? "Buscar municipio..." : "Elegí una provincia primero"}
                variant="bordered"
                isRequired={isRequired}
                isDisabled={!value.provinceCode || isLoading}
                endContent={isLoading ? <Spinner size="sm" /> : undefined}
                selectedKey={value.localityCode || null}
                onSelectionChange={(key) => onChange({ ...value, localityCode: key ? String(key) : "" })}
                isInvalid={!!errorMessage}
                errorMessage={errorMessage}
                listboxProps={{ emptyContent: "No hay municipios con ese nombre" }}
            >
                {municipalities.map((l) => (
                    <AutocompleteItem key={l.code} textValue={l.name}>
                        <div className="flex flex-col">
                            <span className="text-sm">{l.name}</span>
                            <span className="text-xs text-default-400">{l.category}</span>
                        </div>
                    </AutocompleteItem>
                ))}
            </Autocomplete>
        </div>
    );
}
