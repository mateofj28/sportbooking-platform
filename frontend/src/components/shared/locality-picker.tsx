"use client";

import { Autocomplete, AutocompleteItem, Button, Chip, Select, SelectItem, Spinner } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PROVINCES, provinceName } from "@/lib/ar-provinces";
import { loadLocalityIndex, type LocalityInfo } from "@/lib/geo/locality-locator";

/** Catálogo de localidades (municipios), cargado una sola vez. */
export function useLocalityIndex() {
    return useQuery({
        queryKey: ["ar-localities-index"],
        queryFn: loadLocalityIndex,
        staleTime: Infinity,
        gcTime: Infinity,
    });
}

const ALL_PROVINCES = "ALL";
const MAX_RESULTS = 50;

/** Minúsculas y sin acentos, para buscar "neuquen" y encontrar "Neuquén". */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

interface LocalitySearchProps {
    /** Códigos que no se ofrecen (ya elegidos). */
    exclude?: Set<string>;
    onSelect: (code: string) => void;
    label?: string;
    isDisabled?: boolean;
}

/**
 * Buscador de UN municipio: primero (opcional) la provincia, después el nombre.
 * Muestra hasta 50 resultados para que la lista sea manejable (hay 2.116).
 */
export function LocalitySearch({ exclude, onSelect, label = "Buscar municipio", isDisabled }: LocalitySearchProps) {
    const { data: index, isLoading } = useLocalityIndex();
    const [province, setProvince] = useState<string>(ALL_PROVINCES);
    const [text, setText] = useState("");

    const results = useMemo(() => {
        if (!index) return [] as LocalityInfo[];
        const q = fold(text.trim());
        const out: LocalityInfo[] = [];
        for (const l of index.values()) {
            if (province !== ALL_PROVINCES && l.province !== province) continue;
            if (exclude?.has(l.code)) continue;
            if (q && !fold(l.name).includes(q)) continue;
            out.push(l);
            if (out.length >= MAX_RESULTS) break;
        }
        return out;
    }, [index, province, text, exclude]);

    return (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,200px)_1fr]">
            <Select
                label="Provincia"
                size="sm"
                variant="bordered"
                disallowEmptySelection
                selectedKeys={[province]}
                onSelectionChange={(keys: unknown) => { setProvince((Array.from(keys as Set<string>)[0] as string) || ALL_PROVINCES); setText(""); }}
                isDisabled={isDisabled}
            >
                {[
                    <SelectItem key={ALL_PROVINCES}>Todas las provincias</SelectItem>,
                    ...PROVINCES.map((p) => <SelectItem key={p.code}>{p.name}</SelectItem>),
                ]}
            </Select>
            <Autocomplete
                label={label}
                size="sm"
                variant="bordered"
                placeholder={isLoading ? "Cargando municipios…" : "Escribí el nombre"}
                inputValue={text}
                onInputChange={setText}
                items={results}
                isDisabled={isDisabled || isLoading}
                endContent={isLoading ? <Spinner size="sm" /> : undefined}
                listboxProps={{ emptyContent: text ? "No hay municipios con ese nombre" : "Escribí para buscar" }}
                selectedKey={null}
                onSelectionChange={(key) => {
                    if (key) {
                        onSelect(String(key));
                        setText("");
                    }
                }}
                allowsCustomValue={false}
            >
                {(l) => (
                    <AutocompleteItem key={l.code} textValue={`${l.name} (${provinceName(l.province)})`}>
                        <div className="flex flex-col">
                            <span className="text-sm">{l.name}</span>
                            <span className="text-xs text-default-400">{l.category} · {provinceName(l.province)}</span>
                        </div>
                    </AutocompleteItem>
                )}
            </Autocomplete>
        </div>
    );
}

interface LocalityPickerProps {
    value: string[];
    onChange: (codes: string[]) => void;
    max: number;
    isInvalid?: boolean;
    errorMessage?: string;
}

/** Selección de VARIOS municipios: buscador + chips de los elegidos. */
export function LocalityPicker({ value, onChange, max, isInvalid, errorMessage }: LocalityPickerProps) {
    const { data: index } = useLocalityIndex();
    const selected = useMemo(() => new Set(value), [value]);
    const full = value.length >= max;

    const add = (code: string) => {
        if (!selected.has(code) && value.length < max) onChange([...value, code]);
    };
    const remove = (code: string) => onChange(value.filter((c) => c !== code));

    // Orden de los chips: provincia y nombre
    const sorted = useMemo(() => {
        if (!index) return value;
        return [...value].sort((a, b) => {
            const la = index.get(a), lb = index.get(b);
            return (la?.province ?? "").localeCompare(lb?.province ?? "") || (la?.name ?? a).localeCompare(lb?.name ?? b, "es");
        });
    }, [value, index]);

    return (
        <div className="space-y-3" role="group" aria-label="Municipios donde se muestra">
            <LocalitySearch exclude={selected} onSelect={add} label="Agregar municipio" isDisabled={full} />

            <div className="flex items-center justify-between text-xs text-default-500">
                <span>
                    {value.length === 0 ? "Ningún municipio elegido" : `${value.length} municipio${value.length !== 1 ? "s" : ""} elegido${value.length !== 1 ? "s" : ""}`}
                    {full && ` (máximo ${max})`}
                </span>
                {value.length > 0 && (
                    <Button size="sm" variant="light" onPress={() => onChange([])}>Quitar todos</Button>
                )}
            </div>

            {sorted.length > 0 && (
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {sorted.map((code) => {
                        const l = index?.get(code);
                        return (
                            <Chip key={code} size="sm" variant="flat" onClose={() => remove(code)}>
                                {l ? `${l.name} (${provinceName(l.province)})` : code}
                            </Chip>
                        );
                    })}
                </div>
            )}

            {isInvalid && errorMessage && <p role="alert" className="text-xs text-danger">{errorMessage}</p>}
        </div>
    );
}
