"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface AvailabilityResponse {
    available: boolean;
    slots: { time: string; available: boolean }[];
    message?: string;
}

/** Fecha "YYYY-MM-DD" con los componentes LOCALES (no UTC). */
export function localDateStr(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * Disponibilidad de una instalación para una fecha dada.
 * Devuelve también `hasFreeSlots`: true si hay al menos un slot libre ese día.
 */
export function useFacilityAvailability(facilityId: string, date: string, enabled = true) {
    const query = useQuery({
        queryKey: ["availability", facilityId, date],
        queryFn: () =>
            apiClient.get<AvailabilityResponse>(`/facilities/${facilityId}/availability`, { date }),
        enabled: enabled && !!facilityId,
        staleTime: 60_000,
    });

    const hasFreeSlots = !!query.data?.slots?.some((s) => s.available);

    return { ...query, hasFreeSlots };
}
