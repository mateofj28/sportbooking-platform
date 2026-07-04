"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Facility } from "@/types";

interface FacilityFilters {
    sportId?: string;
    venueId?: string;
    isIndoor?: string;
    search?: string;
}

export function useFacilities(filters: FacilityFilters = {}) {
    return useQuery({
        queryKey: ["facilities", filters],
        queryFn: () =>
            apiClient.get<Facility[]>("/facilities", filters as Record<string, string>),
    });
}

export function useFacility(id: string) {
    return useQuery({
        queryKey: ["facility", id],
        queryFn: () => apiClient.get<Facility>(`/facilities/${id}`),
        enabled: !!id,
    });
}
