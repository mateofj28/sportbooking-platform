'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useToastStore } from '@/stores/toast-store'
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

export interface PayBookingInput {
    id: string
    /** El monto que el cliente está viendo. Si el precio cambió, el pago se rechaza (409). */
    expectedTotal: number
}

/**
 * Paga una reserva propia (solo el titular, mark-paid / canPay).
 * Si el precio cambió mientras el cliente miraba (cambio de tarifa, migración 029),
 * no se cobra: se avisa con un toast y se recargan los datos para mostrar el precio nuevo.
 */
export function useMarkBookingPaid() {
    const queryClient = useQueryClient()
    const addToast = useToastStore((s) => s.addToast)
    return useMutation({
        mutationFn: async ({ id, expectedTotal }: PayBookingInput) => {
            const { data: result, error } = await invokeFunction('mark-paid', {
                booking_id: id,
                expected_total: expectedTotal,
            })
            if (error) throw new Error(error)
            return result
        },
        onSuccess: () => {
            addToast('Pago registrado')
            invalidateAll(queryClient)
        },
        onError: (e: Error) => {
            addToast(e.message || 'No se pudo registrar el pago', 'error')
            // Si fue por un cambio de precio, mostrar el precio nuevo
            invalidateAll(queryClient)
            queryClient.invalidateQueries({ queryKey: ['price-changes'] })
        },
    })
}

/** Cambio de precio pendiente de una reserva (tarifa actualizada; migración 029). */
export interface PriceChange {
    bookingId: string
    oldTotal: number
    newTotal: number
    currency: string
}

/**
 * Cambios de precio de MIS reservas, por id de reserva. El RLS ya limita a las propias.
 * Se usa para mostrar "antes $X, ahora $Y" en las fechas pendientes de pago.
 */
export function usePriceChanges() {
    const userId = useAuthStore((s) => s.user?.id)
    return useQuery({
        queryKey: ['price-changes', userId],
        queryFn: async (): Promise<Map<string, PriceChange>> => {
            const { data, error } = await supabase
                .from('booking_price_changes' as never)
                .select('booking_id, old_total, new_total, currency')
                .eq('user_id', userId!)
            if (error) throw new Error(error.message)
            const map = new Map<string, PriceChange>()
            for (const r of (data ?? []) as { booking_id: string; old_total: number; new_total: number; currency: string }[]) {
                map.set(r.booking_id, {
                    bookingId: r.booking_id,
                    oldTotal: Number(r.old_total),
                    newTotal: Number(r.new_total),
                    currency: r.currency ?? 'ARS',
                })
            }
            return map
        },
        enabled: !!userId,
        staleTime: 60_000,
    })
}
