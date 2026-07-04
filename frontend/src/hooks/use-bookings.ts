"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Booking, CreateBookingData } from "@/types";

export function useBookings(status?: string) {
    return useQuery({
        queryKey: ["bookings", status],
        queryFn: () =>
            apiClient.get<Booking[]>("/bookings", status ? { status } : undefined),
    });
}

export function useCreateBooking() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateBookingData) =>
            apiClient.post<Booking>("/bookings", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
        },
    });
}

export function useCancelBooking() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            apiClient.patch<Booking>(`/bookings/${id}/cancel`, { reason }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
        },
    });
}

export function useConfirmBooking() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) =>
            apiClient.patch<Booking>(`/bookings/${id}/confirm`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
        },
    });
}
