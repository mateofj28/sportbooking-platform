"use client";

import { Button } from "@heroui/react";
import { LocateFixed, MapPin } from "lucide-react";
import { provinceName } from "@/lib/ar-provinces";
import type { CurrentProvince } from "@/hooks/use-current-province";

/**
 * Explica qué ubicación se usa para las promociones y, si no es la precisa,
 * cómo mejorarla. Se apoya en useCurrentProvince (GPS, o IP como respaldo).
 */
export function LocationNotice({ location }: { location: CurrentProvince }) {
    const { province, source, ready, locating, permission, retry } = location;

    // Mientras se espera la primera respuesta o el cartel de permiso, no ensuciar la pantalla
    if (!ready || locating) return null;

    // Ubicación precisa: solo contar para qué zona son
    if (source === "gps") {
        return (
            <p className="flex items-center gap-1.5 text-xs text-default-500">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {province ? `Promociones para ${provinceName(province)}` : "Estás fuera de Argentina: te mostramos las promociones nacionales"}
            </p>
        );
    }

    // El navegador no tiene GPS: no hay nada que ofrecer
    if (permission === "unsupported") return null;

    const zone = province ? `las de ${provinceName(province)} (ubicación aproximada)` : "las promociones nacionales";

    return (
        <div
            role="status"
            className="flex flex-col gap-3 rounded-2xl border border-divider bg-content1 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div>
                    <p className="text-sm font-semibold">Promociones de donde estés</p>
                    <p className="text-xs text-default-500">
                        {permission === "denied"
                            ? `La ubicación está bloqueada en tu navegador. Activala desde el candado de la barra de direcciones para ver las promociones de tu zona. Mientras tanto te mostramos ${zone}.`
                            : `Compartí tu ubicación para ver las promociones de la provincia en la que estás. Mientras tanto te mostramos ${zone}.`}
                    </p>
                    <p className="mt-1 text-[11px] text-default-400">
                        Solo usamos la provincia para elegir las promociones; tu ubicación no se guarda.
                    </p>
                </div>
            </div>
            {permission !== "denied" && (
                <Button size="sm" color="primary" variant="flat" startContent={<LocateFixed className="h-4 w-4" />} onPress={retry}>
                    Usar mi ubicación
                </Button>
            )}
        </div>
    );
}
