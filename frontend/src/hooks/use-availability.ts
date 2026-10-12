"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export type SlotReason = "past" | "booked" | "blocked";

export interface AvailabilitySlot {
    time: string;
    available: boolean;
    reason?: SlotReason;
}

export interface AvailabilityResponse {
    available: boolean;
    slots: AvailabilitySlot[];
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

export interface AvailabilitySummaryItem {
    facilityId: string;
    available: boolean;
    hasFreeSlots: boolean;
    freeCount: number;
    freeSlots: string[];
    message?: string;
}

/**
 * Resumen de disponibilidad de MUCHAS canchas en una sola llamada (escalable).
 * Devuelve un Map facilityId -> resumen para consultarlo por cancha.
 */
export function useAvailabilitySummary(
    date: string,
    filters: { venueId?: string; sportId?: string } = {},
    enabled = true,
) {
    const query = useQuery({
        queryKey: ["availability-summary", date, filters.venueId ?? "", filters.sportId ?? ""],
        queryFn: () => {
            const params: Record<string, string> = { date };
            if (filters.venueId) params.venueId = filters.venueId;
            if (filters.sportId) params.sportId = filters.sportId;
            return apiClient.get<AvailabilitySummaryItem[]>("/facilities/availability-summary", params);
        },
        enabled: enabled && !!date,
        staleTime: 60_000,
    });

    const byFacility = new Map<string, AvailabilitySummaryItem>();
    for (const item of query.data || []) byFacility.set(item.facilityId, item);

    return { ...query, byFacility };
}
