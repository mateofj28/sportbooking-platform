"use client";

import { Input, Modal, ModalBody, ModalContent, ModalHeader, Spinner } from "@heroui/react";
import { ChevronRight, LocateFixed, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { provinceName, PROVINCES } from "@/lib/ar-provinces";
import type { LocalityInfo } from "@/lib/geo/locality-locator";
import { useLocalityIndex } from "@/components/shared/locality-picker";
import { useVenues } from "@/hooks/use-venues";

const MAX_RESULTS = 40;

/** Minúsculas y sin acentos, para buscar "neuquen" y encontrar "Neuquén". */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

interface LocationChooserModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Municipio elegido en la lista. */
    onChoose: (locality: LocalityInfo) => void;
    /** "Buscar cerca de mí" (GPS). Si es undefined, la opción no se muestra. */
    onLocateMe?: () => void;
    /** Municipio actual, para marcarla. */
    currentCode?: string | null;
}

/**
 * "¿Dónde querés jugar?": buscador de municipio + "Buscar cerca de mí".
 * Sin texto sugiere los municipios donde hay complejos.
 */
export function LocationChooserModal({ isOpen, onClose, onChoose, onLocateMe, currentCode }: LocationChooserModalProps) {
    const { data: index, isLoading } = useLocalityIndex();
    const { data: venues } = useVenues();
    const [text, setText] = useState("");

    // Municipios con complejos: se cruza el texto "municipio + provincia" del complejo con el catálogo
    const suggestions = useMemo(() => {
        if (!index || !venues) return [] as LocalityInfo[];
        const provinceByName = new Map(PROVINCES.map((p) => [fold(p.name), p.code]));
        const seen = new Set<string>();
        const out: LocalityInfo[] = [];
        for (const v of venues) {
            if (!v.city) continue;
            const city = fold(v.city);
            const prov = v.state ? provinceByName.get(fold(v.state)) : undefined;
            for (const l of index.values()) {
                if (fold(l.name) !== city || (prov && l.province !== prov) || seen.has(l.code)) continue;
                seen.add(l.code);
                out.push(l);
            }
        }
        return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
    }, [index, venues]);

    // Resultados: primero los que EMPIEZAN con el texto, después los que lo contienen
    const results = useMemo(() => {
        const q = fold(text);
        if (!index || !q) return [] as LocalityInfo[];
        const starts: LocalityInfo[] = [];
        const contains: LocalityInfo[] = [];
        for (const l of index.values()) {
            const n = fold(l.name);
            if (n.startsWith(q)) starts.push(l);
            else if (n.includes(q)) contains.push(l);
        }
        const byName = (a: LocalityInfo, b: LocalityInfo) => a.name.localeCompare(b.name, "es");
        return [...starts.sort(byName), ...contains.sort(byName)].slice(0, MAX_RESULTS);
    }, [index, text]);

    const searching = fold(text) !== "";
    const list = searching ? results : suggestions;

    const close = () => {
        setText("");
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={close} size="md" scrollBehavior="inside" placement="center">
            <ModalContent>
                <ModalHeader className="text-lg font-bold">¿Dónde querés jugar?</ModalHeader>
                <ModalBody className="gap-1 pb-6">
                    <Input
                        autoFocus
                        aria-label="Municipio"
                        placeholder={isLoading ? "Cargando municipios…" : "Municipio"}
                        variant="underlined"
                        value={text}
                        onValueChange={setText}
                        isClearable
                        isDisabled={isLoading}
                        startContent={<MapPin className="h-4 w-4 text-default-400" aria-hidden="true" />}
                        endContent={isLoading ? <Spinner size="sm" /> : undefined}
                    />

                    {onLocateMe && (
                        <button
                            type="button"
                            onClick={() => { setText(""); onLocateMe(); }}
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-primary hover:bg-default-100"
                        >
                            <LocateFixed className="h-4 w-4" aria-hidden="true" />
                            Buscar cerca de mí
                        </button>
                    )}

                    {!searching && suggestions.length > 0 && (
                        <p className="px-1 pt-2 text-xs text-default-400">Municipios con complejos</p>
                    )}

                    {searching && !isLoading && results.length === 0 && (
                        <p className="px-1 py-4 text-sm text-default-500">No encontramos un municipio con ese nombre.</p>
                    )}

                    <ul aria-label={searching ? "Resultados" : "Municipios sugeridos"} className="divide-y divide-divider">
                        {list.map((l) => (
                            <li key={l.code}>
                                <button
                                    type="button"
                                    onClick={() => { onChoose(l); close(); }}
                                    aria-current={l.code === currentCode ? "true" : undefined}
                                    className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left hover:bg-default-100"
                                >
                                    <MapPin className="h-4 w-4 flex-shrink-0 text-default-400" aria-hidden="true" />
                                    <span className="min-w-0 flex-1 truncate text-sm text-default-500">
                                        <span className="font-semibold text-foreground">{l.name}</span>
                                        , {provinceName(l.province)}, Argentina
                                    </span>
                                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-default-400" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
