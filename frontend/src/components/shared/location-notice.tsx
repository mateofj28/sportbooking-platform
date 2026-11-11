"use client";

import { Button, Spinner } from "@heroui/react";
import { Globe, LocateFixed, MapPin } from "lucide-react";
import { provinceName } from "@/lib/ar-provinces";
import type { CurrentLocality } from "@/hooks/use-current-locality";

/**
 * Explica para qué municipio son las promociones y, si no hay ubicación precisa,
 * cómo activarla. Se apoya en useCurrentLocality (GPS).
 */
export function LocationNotice({ location }: { location: CurrentLocality }) {
    const { locality, province, located, abroad, locating, permission, gpsError, retry } = location;

    // Ubicado por GPS: contar para qué zona son
    if (located && !locating) {
        return (
            <p className="flex items-center gap-1.5 text-xs text-default-500">
                {abroad ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
                {locality
                    ? `Promociones para ${locality.name} (${provinceName(locality.province)})`
                    : abroad
                        ? "Estás fuera de Argentina: te mostramos las promociones nacionales"
                        : `No estás dentro de un municipio${province ? ` de ${provinceName(province)}` : ""}: te mostramos las promociones nacionales`}
            </p>
        );
    }

    // El navegador no tiene GPS: no hay nada que ofrecer
    if (permission === "unsupported") return null;

    let message: string;
    if (locating) {
        message = "Buscando tu ubicación… Si el navegador te lo pide, permití el acceso.";
    } else if (permission === "denied") {
        message = "La ubicación está bloqueada para este sitio. Activala desde el candado de la barra de direcciones (o en los permisos del navegador del celular) para ver las promociones de tu municipio. Mientras tanto te mostramos las nacionales.";
    } else if (gpsError === "timeout") {
        message = "Tu dispositivo tardó demasiado en darnos la ubicación. Probá de nuevo, mejor al aire libre o con el GPS activado. Mientras tanto te mostramos las promociones nacionales.";
    } else if (gpsError === "unavailable") {
        message = "Tu dispositivo no pudo determinar la ubicación. Revisá que la ubicación (GPS) esté activada en el celular y probá de nuevo. Mientras tanto te mostramos las promociones nacionales.";
    } else if (gpsError === "limits") {
        message = "No pudimos procesar tu ubicación. Probá de nuevo en un momento. Mientras tanto te mostramos las promociones nacionales.";
    } else {
        message = "Compartí tu ubicación para ver las promociones del municipio en el que estás. Mientras tanto te mostramos las nacionales.";
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
                        Solo usamos tu municipio para elegir las promociones; tu ubicación no se guarda.
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
