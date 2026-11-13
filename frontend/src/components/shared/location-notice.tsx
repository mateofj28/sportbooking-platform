"use client";

import { Button, Spinner } from "@heroui/react";
import { Globe, LocateFixed, MapPin } from "lucide-react";
import { useState } from "react";
import { provinceName } from "@/lib/ar-provinces";
import type { CurrentLocality } from "@/hooks/use-current-locality";
import { LocationChooserModal } from "@/components/shared/location-chooser-modal";

/**
 * Explica para qué municipio son las promociones y deja elegir el municipio a mano
 * ("¿Dónde querés jugar?"), o activar la ubicación. Se apoya en useCurrentLocality.
 */
export function LocationNotice({ location }: { location: CurrentLocality }) {
    const { locality, province, located, abroad, manual, locating, permission, gpsError, retry, choose, chooseNone, locateMe } = location;
    // Eligió a mano "Sin municipio" (solo nacionales)
    const noneChosen = manual && !locality;
    const [chooserOpen, setChooserOpen] = useState(false);

    // "Buscar cerca de mí" solo si el navegador tiene GPS y no está bloqueado
    const canLocate = permission !== "unsupported" && permission !== "denied";

    const chooser = (
        <LocationChooserModal
            isOpen={chooserOpen}
            onClose={() => setChooserOpen(false)}
            onChoose={choose}
            onLocateMe={canLocate ? () => { setChooserOpen(false); locateMe(); } : undefined}
            onChooseNone={chooseNone}
            noneSelected={noneChosen}
            currentCode={locality?.code ?? null}
        />
    );

    // Con resultado (elegido a mano o por GPS): contar para qué zona son
    if (located && !locating) {
        return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-default-500">
                <p className="flex items-center gap-1.5">
                    {abroad || noneChosen ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
                    {locality
                        ? `Promociones para ${locality.name} (${provinceName(locality.province)})`
                        : noneChosen
                            ? "Te mostramos las promociones nacionales"
                        : abroad
                            ? "Estás fuera de Argentina: te mostramos las promociones nacionales"
                            : `No estás dentro de un municipio${province ? ` de ${provinceName(province)}` : ""}: te mostramos las promociones nacionales`}
                </p>
                <Button
                    size="sm"
                    variant="light"
                    color="primary"
                    className="h-6 min-w-0 px-2 text-xs"
                    onPress={() => setChooserOpen(true)}
                >
                    {locality || noneChosen ? "Cambiar" : "Elegir municipio"}
                </Button>
                {chooser}
            </div>
        );
    }

    let message: string;
    if (permission === "unsupported") {
        message = "Elegí tu municipio para ver sus promociones. Mientras tanto te mostramos las nacionales.";
    } else if (locating) {
        message = "Buscando tu ubicación… Si el navegador te lo pide, permití el acceso.";
    } else if (permission === "denied") {
        message = "La ubicación está bloqueada para este sitio. Elegí tu municipio, o activá la ubicación desde el candado de la barra de direcciones. Mientras tanto te mostramos las nacionales.";
    } else if (gpsError === "timeout") {
        message = "Tu dispositivo tardó demasiado en darnos la ubicación. Probá de nuevo o elegí tu municipio. Mientras tanto te mostramos las promociones nacionales.";
    } else if (gpsError === "unavailable") {
        message = "Tu dispositivo no pudo determinar la ubicación. Revisá que el GPS esté activado o elegí tu municipio. Mientras tanto te mostramos las promociones nacionales.";
    } else if (gpsError === "limits") {
        message = "No pudimos procesar tu ubicación. Probá de nuevo o elegí tu municipio. Mientras tanto te mostramos las promociones nacionales.";
    } else {
        message = "Compartí tu ubicación o elegí tu municipio para ver sus promociones. Mientras tanto te mostramos las nacionales.";
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
            <div className="flex flex-shrink-0 gap-2">
                <Button size="sm" variant="bordered" startContent={<MapPin className="h-4 w-4" />} onPress={() => setChooserOpen(true)}>
                    Elegir municipio
                </Button>
                {canLocate && (
                    <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        startContent={locating ? undefined : <LocateFixed className="h-4 w-4" />}
                        onPress={manual ? locateMe : retry}
                        isLoading={locating}
                    >
                        {locating ? "Buscando…" : "Usar mi ubicación"}
                    </Button>
                )}
            </div>
            {chooser}
        </div>
    );
}
