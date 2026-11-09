"use client";

import { MapPin } from "lucide-react";
import { ProvinceSelect } from "@/components/shared/province-select";
import { useSetMyProvince } from "@/hooks/use-my-province";
import { useToastStore } from "@/stores/toast-store";

/**
 * Aviso para clientes que todavía no eligieron su provincia.
 * Sin provincia solo ven publicidad nacional; al elegirla, el carrusel
 * se actualiza con las promociones de su zona.
 */
export function ProvincePrompt() {
    const setProvince = useSetMyProvince();
    const addToast = useToastStore((s) => s.addToast);

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-content1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div>
                    <p className="text-sm font-semibold">¿Desde dónde jugás?</p>
                    <p className="text-xs text-default-500">
                        Elegí tu provincia y te mostramos las promociones de tu zona.
                    </p>
                </div>
            </div>
            <div className="w-full sm:w-64">
                <ProvinceSelect
                    size="sm"
                    label="Provincia"
                    value={null}
                    isDisabled={setProvince.isPending}
                    onChange={(code) =>
                        setProvince.mutate(code, {
                            onSuccess: () => addToast("Provincia guardada"),
                            onError: () => addToast("No se pudo guardar la provincia", "error"),
                        })
                    }
                />
            </div>
        </div>
    );
}
