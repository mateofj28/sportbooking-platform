'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { camelize, BOOKING_SELECT, RECURRING_BOOKING_SELECT, invokeFunction } from '@/lib/supabase-helpers'
import type { BookingRow, RecurringBookingRow } from '@/lib/supabase-helpers'
import type { Booking, CreateBookingData } from '@/types'

// ---- Tipos ----

export interface RecurringBooking {
    id: string
    facilityId: string
    userId: string
    dayOfWeek: number
    startTime: string
    endTime: string
    startDate: string
    endDate: string
    isActive: boolean
    upcomingCount: number
    totalCount: number
    facility: {
        id: string
        name: string
        sport: { id: string; name: string }
        venue: { id: string; name: string; city: string }
    }
    bookings: {
        id: string
        startDatetime: string
        endDatetime: string
        status: string
        paymentStatus?: string
        totalPrice?: number
    }[]
}

export interface CreateRecurringBookingData {
    facilityId: string
    dayOfWeek: number
    startTime: string
    endTime: string
    startDate: string
    userId?: string
    notes?: string
}

export interface RecurringBookingResult {
    recurringBookingId: string
    totalDates: number
    createdCount: number
    skippedCount: number
    created: { date: string; bookingId: string }[]
    skipped: { date: string; reason: string }[]
}

// ---- Helpers ----

// ---- Helpers de conversión tipados ----
// Reciben el tipo Raw (snake_case, forma exacta de Supabase) y devuelven
// el tipo de la app (camelCase). Sin `as unknown as` — TypeScript puede
// verificar que la entrada tiene la forma correcta.

function rowToBooking(row: BookingRow): Booking {
    return camelize(row) as unknown as Booking
}

function rowToRecurring(row: RecurringBookingRow): RecurringBooking {
    const c = camelize(row) as any
    return {
        ...c,
        upcomingCount: (row.bookings ?? []).filter(
            (b) => b.status === 'CONFIRMED' && new Date(b.start_datetime!) >= new Date()
        ).length,
        totalCount: (row.bookings ?? []).length,
        bookings: (row.bookings ?? []).map((b) => ({
            id: b.id,
            startDatetime: b.start_datetime!,
            endDatetime: b.end_datetime!,
            status: b.status,
            paymentStatus: b.payment_status ?? undefined,
            totalPrice: b.total_price ? Number(b.total_price) : undefined,
        })),
    }
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
    queryClient.invalidateQueries({ queryKey: ['booking'] })
    queryClient.invalidateQueries({ queryKey: ['recurring-bookings'] })
}

// ============================================================
// LECTURAS — supabase.from() directo con RLS automático
// ============================================================

/**
 * MIS reservas (las que hice yo como cliente).
 *
 * Filtra SIEMPRE por el usuario actual. No alcanza con confiar en RLS: un ADMIN o VENUE_ADMIN
 * puede leer las reservas de otros (todas / las de su complejo), y "Mis Reservas" mostraría
 * reservas ajenas. Para un cliente común el resultado es el mismo que antes.
 * El panel de administración usa useDashboardBookings(), que sí ve el alcance completo.
 */
export function useBookings(status?: string) {
    const userId = useAuthStore((s) => s.user?.id)

    return useQuery({
        queryKey: ['bookings', 'mine', userId, status],
        enabled: !!userId,
        queryFn: async (): Promise<{ data: Booking[]; meta: { total: number } }> => {
            let query = supabase
                .from('bookings')
                .select(BOOKING_SELECT, { count: 'exact' })
                .eq('user_id', userId!)
                .order('start_datetime', { ascending: false })
                .limit(200)

            if (status) query = query.eq('status', status as any)

          const { data, error, count } = await query
          if (error) throw new Error(error.message)

            return {
                data: (data ?? []).map((row) => rowToBooking(row as unknown as BookingRow)),
                meta: { total: count ?? 0 },
            }
        },
    })
}

/** Una reserva por id. */
export function useBooking(id: string) {
    return useQuery({
        queryKey: ['booking', id],
        queryFn: async (): Promise<Booking> => {
            const { data, error } = await supabase
                .from('bookings')
                .select(BOOKING_SELECT)
                .eq('id', id)
                .single()
            if (error) throw new Error(error.message)
            return rowToBooking(data as unknown as BookingRow)
        },
        enabled: !!id,
    })
}

/** MIS turnos fijos. Filtra siempre por el usuario actual (ver useBookings). */
export function useRecurringBookings() {
    const userId = useAuthStore((s) => s.user?.id)

    return useQuery({
        queryKey: ['recurring-bookings', 'mine', userId],
        enabled: !!userId,
        queryFn: async (): Promise<RecurringBooking[]> => {
            const { data, error } = await supabase
                .from('recurring_bookings')
                .select(RECURRING_BOOKING_SELECT)
                .eq('user_id', userId!)
                .order('created_at', { ascending: false })

            if (error) throw new Error(error.message)
            return (data ?? []).map((row) => rowToRecurring(row as unknown as RecurringBookingRow))
        },
    })
}

// ============================================================
// MUTACIONES — Edge Functions
// (necesitan service_role para validaciones, emails, notifs)
// ============================================================

/** Crea una reserva única. Valida slots, calcula precio, envía email. */
export function useCreateBooking() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (data: CreateBookingData): Promise<Booking> => {
            const { data: result, error } = await invokeFunction<Booking>('create-booking', {
                facility_id: data.facilityId,
                start_datetime: data.startDatetime,
                end_datetime: data.endDatetime,
                notes: data.notes,
            })
            if (error) throw new Error(error)
            return result!
        },
        onSuccess: () => invalidateAll(queryClient),
    })
}

/** Crea un turno fijo (8 ocurrencias semanales). */
export function useCreateRecurringBooking() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (data: CreateRecurringBookingData): Promise<RecurringBookingResult> => {
            const { data: result, error } = await invokeFunction<RecurringBookingResult>('create-recurring', {
                facility_id: data.facilityId,
                day_of_week: data.dayOfWeek,
                start_time: data.startTime,
                end_time: data.endTime,
                start_date: data.startDate,
                user_id: data.userId,
                notes: data.notes,
            })
            if (error) throw new Error(error)
            return result!
        },
        onSuccess: () => invalidateAll(queryClient),
    })
}

/** Cancela una reserva. Valida regla 24h para CLIENT. */
export function useCancelBooking() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
            const { data: result, error } = await invokeFunction('cancel-booking', {
                booking_id: id,
                reason,
            })
            if (error) throw new Error(error)
            return result
        },
        onSuccess: () => invalidateAll(queryClient),
    })
}

/** Cancela toda la serie de un turno fijo. */
export function useCancelRecurringBooking() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
            const { data: result, error } = await invokeFunction('cancel-recurring', {
                recurring_booking_id: id,
                reason,
            })
            if (error) throw new Error(error)
            return result
        },
        onSuccess: () => invalidateAll(queryClient),
    })
}

/** Marca una reserva como pagada. */
export function useMarkBookingPaid() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => {
            const { data: result, error } = await invokeFunction('mark-paid', {
                booking_id: id,
            })
            if (error) throw new Error(error)
            return result
        },
        onSuccess: () => invalidateAll(queryClient),
    })
}
