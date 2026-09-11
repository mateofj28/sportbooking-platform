"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Booking, CreateBookingData } from "@/types";

export function useBookings(status?: string) {
    return useQuery({
        queryKey: ["bookings", status],
        queryFn: () =>
            apiClient.get<{ data: Booking[]; meta: { total: number; page: number; limit: number; totalPages: number } }>("/bookings", status ? { status } : undefined),
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

export interface CreateRecurringBookingData {
    facilityId: string;
    dayOfWeek: number; // 0=Lunes..6=Domingo
    startTime: string; // "20:00"
    endTime: string;   // "22:00"
    startDate: string; // "2026-09-15"
    endDate: string;   // "2026-12-15"
    userId?: string;
    notes?: string;
}

export interface RecurringBookingResult {
    recurringBookingId: string;
    totalDates: number;
    createdCount: number;
    skippedCount: number;
    created: { date: string; bookingId: string }[];
    skipped: { date: string; reason: string }[];
}

export function useCreateRecurringBooking() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateRecurringBookingData) =>
            apiClient.post<RecurringBookingResult>("/bookings/recurring", data),
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
