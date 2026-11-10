"use client";

import { Button, Spinner } from "@heroui/react";
import { Globe, LocateFixed, MapPin } from "lucide-react";
import { provinceName } from "@/lib/ar-provinces";
import type { CurrentProvince } from "@/hooks/use-current-province";

/**
 * Explica qué ubicación se usa para las promociones y, si no es la precisa,
 * cómo mejorarla. Se apoya en useCurrentProvince (GPS, o IP como respaldo).
 */
export function LocationNotice({ location }: { location: CurrentProvince }) {
    const { province, source, abroad, ready, locating, permission, gpsError, retry } = location;

    if (!ready) return null;

    // Ubicación precisa: solo contar para qué zona son
    if (source === "gps" && !locating) {
        return (
            <p className="flex items-center gap-1.5 text-xs text-default-500">
                {abroad ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
                {province
                    ? `Promociones para ${provinceName(province)}`
                    : abroad
                        ? "Estás fuera de Argentina: te mostramos las promociones nacionales"
                        : "No pudimos ubicarte en una provincia: te mostramos las promociones nacionales"}
            </p>
        );
    }

    // El navegador no tiene GPS: no hay nada que ofrecer
    if (permission === "unsupported") return null;

    const zone = province ? `las de ${provinceName(province)} (ubicación aproximada)` : "las promociones nacionales";

    let message: string;
    if (locating) {
        message = "Buscando tu ubicación… Si el navegador te lo pide, permití el acceso.";
    } else if (permission === "denied") {
        message = `La ubicación está bloqueada para este sitio. Activala desde el candado de la barra de direcciones (o en los permisos del navegador del celular) para ver las promociones de tu zona. Mientras tanto te mostramos ${zone}.`;
    } else if (gpsError === "timeout") {
        message = `Tu dispositivo tardó demasiado en darnos la ubicación. Probá de nuevo, mejor al aire libre o con el GPS activado. Mientras tanto te mostramos ${zone}.`;
    } else if (gpsError === "unavailable") {
        message = `Tu dispositivo no pudo determinar la ubicación. Revisá que la ubicación (GPS) esté activada en el celular y probá de nuevo. Mientras tanto te mostramos ${zone}.`;
    } else if (gpsError === "limits") {
        message = `No pudimos procesar tu ubicación. Probá de nuevo en un momento. Mientras tanto te mostramos ${zone}.`;
    } else {
        message = `Compartí tu ubicación para ver las promociones de la provincia en la que estás. Mientras tanto te mostramos ${zone}.`;
    }

    return (
        <div
            role="status"
            aria-live="polite"
            className="flex flex-col gap-3 rounded-2xl border border-divider bg-content1 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    {locating
                        ? <Spinner size="sm" aria-hidden="true" />
                        : <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />}
                </div>
                <div>
                    <p className="text-sm font-semibold">Promociones de donde estés</p>
                    <p className="text-xs text-default-500">{message}</p>
                    <p className="mt-1 text-[11px] text-default-400">
                        Solo usamos la provincia para elegir las promociones; tu ubicación no se guarda.
                    </p>
                </div>
            </div>
            {permission !== "denied" && (
                <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={locating ? undefined : <LocateFixed className="h-4 w-4" />}
                    onPress={retry}
                    isLoading={locating}
                >
                    {locating ? "Buscando…" : "Usar mi ubicación"}
                </Button>
            )}
        </div>
    );
}
