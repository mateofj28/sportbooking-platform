'use client'

// ============================================================
// hooks/use-classes.ts
// Entrenadores — Etapa 2 (migración 066): buscar entrenadores, ver horarios, reservar y
// cancelar clases. Las lecturas son funciones de la base; reservar y cancelar pasan por
// Edge Functions (mueven créditos y mandan emails). La base garantiza las reglas.
// ============================================================

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { callRpc, invokeFunction } from '@/lib/supabase-helpers'
import { useAuthStore } from '@/stores/auth-store'

const CLASSES_KEY = ['classes'] as const

async function rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const { data, error } = await callRpc<T>(fn, params)
    if (error) throw new Error(error)
    return data as T
}

// ---------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------

export interface TrainerCard {
    trainerId: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    bio: string | null
    /** Precio final por hora más bajo (con comisión). */
    minPrice: number
    sports: string[]
    /** 0 = lunes … 6 = domingo */
    days: number[]
}

export interface PublicSlot {
    id: string
    dayOfWeek: number
    startTime: string
    endTime: string
    location: string
    finalIndividual: number
    finalGroup: number | null
    sports: { id: string; name: string }[]
}

export interface PublicTrainer {
    trainerId: string
    firstName: string
    lastName: string
    avatarUrl: string | null
    bio: string | null
    experience: string | null
    isMe: boolean
    sports: { id: string; name: string; durations: number[]; maxStudents: number }[]
    slots: PublicSlot[]
}

export interface ClassOption {
    start: string
    end: string
    hours: number
    location: string
    isGroup: boolean
    capacity: number
    spotsLeft: number
    joinsExisting: boolean
    already: boolean
    total: number
}

export type ClassStatus = 'OPEN' | 'CANCELLED' | 'COMPLETED'
export type CancelRole = 'CLIENT' | 'TRAINER' | 'ADMIN' | 'SYSTEM'

export interface ClassStudent {
    bookingId: string
    userId: string
    firstName: string
    lastName: string
    email?: string | null
    status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'
    paymentStatus: 'PENDING' | 'PAID'
    /** Fecha de una clase fija (puede estar sin pagar). */
    isRecurring?: boolean
    basePrice: number
    commissionAmount?: number | null
    totalPrice?: number | null
    cancelledAt: string | null
    cancelledByRole: CancelRole | null
    cancellationReason: string | null
    createdAt: string
}

export interface ClassInfo {
    classId: string
    status: ClassStatus
    start: string
    end: string
    hours: number
    isGroup: boolean
    capacity: number
    location: string
    sport: { id: string; name: string }
    trainer: { id: string; firstName: string; lastName: string; avatarUrl: string | null }
    cancelledAt: string | null
    cancellationReason: string | null
    taken: number
    /** Solo para el entrenador y el admin general. */
    students: ClassStudent[] | null
}

export interface MyClassBooking {
    id: string
    status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'
    paymentStatus: 'PENDING' | 'PAID'
    totalPrice: number
    cancelledAt: string | null
    cancelledByRole: CancelRole | null
    cancellationReason: string | null
    createdAt: string
    canCancel: boolean
    /** Sin pagar y la clase todavía no empezó (fecha de una clase fija). */
    payable: boolean
    recurringClassId: string | null
    /** Cambio del entrenador sobre esta fecha sin pagar (E23): lo que conocía y lo nuevo. */
    change: ClassChange | null
    class: ClassInfo
}

export interface ClassChange {
    oldTotal: number
    newTotal: number
    oldStart: string
    newStart: string
    oldLocation: string
    newLocation: string
}

export interface MyRecurringClass {
    id: string
    isActive: boolean
    dayOfWeek: number
    startTime: string
    hours: number
    startDate: string
    endDate: string
    sport: { id: string; name: string }
    trainer: { id: string; firstName: string; lastName: string }
    upcomingCount: number
    /** Fechas sin pagar que todavía se pueden pagar. */
    pending: { id: string; total: number }[]
}

export type ClassPayMode = 'ALL' | 'NEXT' | 'NONE'

export interface ClassSeriesResult {
    recurringClassId: string
    createdCount: number
    skippedCount: number
    paidCount: number
    paidTotal: number
    created: { id: string; classId: string; start: string; total: number }[]
    skipped: { start: string; reason: string }[]
}

export interface Paged<T> {
    total: number
    items: T[]
}

// ---------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------

export interface TrainerSearch {
    sportId: string | null
    dayOfWeek: number | null
    minPrice: number | null
    maxPrice: number | null
}

export function useSearchTrainers(f: TrainerSearch, page: number, size = 12) {
    return useQuery({
        queryKey: [...CLASSES_KEY, 'search', f, page, size],
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        queryFn: () => rpc<Paged<TrainerCard>>('search_trainers', {
            p_sport: f.sportId, p_dow: f.dayOfWeek, p_min: f.minPrice, p_max: f.maxPrice, p_page: page, p_size: size,
        }),
    })
}

export function usePublicTrainer(trainerId: string | null) {
    return useQuery({
        queryKey: [...CLASSES_KEY, 'trainer', trainerId],
        enabled: !!trainerId,
        staleTime: 30_000,
        retry: false,
        queryFn: () => rpc<PublicTrainer>('trainer_public_profile', { p_trainer: trainerId }),
    })
}

export function useTrainerAvailability(trainerId: string | null, date: string | null, sportId: string | null, hours: number | null) {
    const userId = useAuthStore((s) => s.user?.id)
    return useQuery({
        queryKey: [...CLASSES_KEY, 'availability', trainerId, date, sportId, hours, userId],
        enabled: !!trainerId && !!date && !!sportId && !!hours,
        staleTime: 15_000,
        queryFn: () => rpc<{ date: string; options: ClassOption[] }>('trainer_availability', {
            p_trainer: trainerId, p_date: date, p_sport: sportId, p_hours: hours,
        }),
    })
}

function useInvalidateClasses() {
    const queryClient = useQueryClient()
    return () => {
        queryClient.invalidateQueries({ queryKey: CLASSES_KEY })
        queryClient.invalidateQueries({ queryKey: ['wallet'] })
    }
}

export function useBookClass() {
    const invalidate = useInvalidateClasses()
    return useMutation({
        mutationFn: async (v: { trainerId: string; sportId: string; start: string; hours: number; expectedTotal: number }) => {
            const { data, error } = await invokeFunction<{ classBookingId: string; total: number }>('create-class-booking', {
                trainer_id: v.trainerId, sport_id: v.sportId, start: v.start, hours: v.hours, expected_total: v.expectedTotal,
            })
            if (error) throw new Error(error)
            return data!
        },
        // También al fallar: el horario pudo haberse ocupado
        onSettled: invalidate,
    })
}

export function useMyClassBookings(scope: 'UPCOMING' | 'HISTORY', page: number, size = 20) {
    const userId = useAuthStore((s) => s.user?.id)
    return useQuery({
        queryKey: [...CLASSES_KEY, 'mine', userId, scope, page, size],
        enabled: !!userId,
        placeholderData: keepPreviousData,
        queryFn: () => rpc<Paged<MyClassBooking>>('my_class_bookings', { p_scope: scope, p_page: page, p_size: size }),
    })
}

/** Cancelar un lugar: el alumno (24 h), el entrenador de la clase o el admin general (con motivo). */
export function useCancelClassBooking() {
    const invalidate = useInvalidateClasses()
    return useMutation({
        mutationFn: async (v: { id: string; reason?: string }) => {
            const { data, error } = await invokeFunction<{ refunded: number }>('cancel-class-booking', {
                class_booking_id: v.id, reason: v.reason?.trim() || null,
            })
            if (error) throw new Error(error)
            return data!
        },
        onSuccess: invalidate,
    })
}

// ---------------------------------------------------------------
// Entrenador y admin general
// ---------------------------------------------------------------

export function useTrainerMyClasses(scope: 'UPCOMING' | 'HISTORY', page: number, size = 20) {
    const userId = useAuthStore((s) => s.user?.id)
    const isTrainer = useAuthStore((s) => s.user?.role === 'TRAINER')
    return useQuery({
        queryKey: [...CLASSES_KEY, 'trainer-mine', userId, scope, page, size],
        enabled: !!userId && isTrainer,
        placeholderData: keepPreviousData,
        queryFn: () => rpc<Paged<ClassInfo>>('trainer_my_classes', { p_scope: scope, p_page: page, p_size: size }),
    })
}

export interface AdminClassFilters {
    trainerId: string | null
    sportId: string | null
    from: string
    to: string
    status: 'ALL' | 'UPCOMING' | 'DONE' | 'CANCELLED'
}

export function useAdminClasses(f: AdminClassFilters, page: number, size = 20) {
    return useQuery({
        queryKey: [...CLASSES_KEY, 'admin', f, page, size],
        placeholderData: keepPreviousData,
        queryFn: () => rpc<Paged<ClassInfo>>('admin_classes', {
            p_trainer: f.trainerId, p_sport: f.sportId, p_from: f.from || null, p_to: f.to || null,
            p_status: f.status, p_page: page, p_size: size,
        }),
    })
}

/** Cancelar la clase entera (entrenador de la clase o admin general), con motivo. */
export function useCancelTrainerClass() {
    const invalidate = useInvalidateClasses()
    return useMutation({
        mutationFn: async (v: { classId: string; reason: string }) => {
            const { data, error } = await invokeFunction<{ students: number }>('cancel-trainer-class', {
                class_id: v.classId, reason: v.reason.trim(),
            })
            if (error) throw new Error(error)
            return data!
        },
        onSuccess: invalidate,
    })
}

// ---------------------------------------------------------------
// Clases fijas (Etapa 3, migración 067)
// ---------------------------------------------------------------

/** Clase fija: 8 fechas semanales desde la elegida; se paga todo, la próxima o nada (todo o nada). */
export function useBookClassSeries() {
    const invalidate = useInvalidateClasses()
    return useMutation({
        mutationFn: async (v: { trainerId: string; sportId: string; start: string; hours: number; payMode: ClassPayMode; expectedTotal: number }) => {
            const { data, error } = await invokeFunction<ClassSeriesResult>('create-recurring-class', {
                trainer_id: v.trainerId, sport_id: v.sportId, start: v.start, hours: v.hours,
                pay_mode: v.payMode, expected_total: v.expectedTotal,
            })
            if (error) throw new Error(error)
            return data!
        },
        onSettled: invalidate,
    })
}

export function useMyRecurringClasses() {
    const userId = useAuthStore((s) => s.user?.id)
    return useQuery({
        queryKey: [...CLASSES_KEY, 'my-series', userId],
        enabled: !!userId,
        queryFn: () => rpc<MyRecurringClass[]>('my_recurring_classes'),
    })
}

/** Pagar una o varias fechas pendientes. expectedTotal = lo que ve el cliente (si cambió, no se cobra). */
export function usePayClassBookings() {
    const invalidate = useInvalidateClasses()
    return useMutation({
        mutationFn: async (v: { ids: string[]; expectedTotal: number }) => {
            const body = v.ids.length === 1
                ? { class_booking_id: v.ids[0], expected_total: v.expectedTotal }
                : { class_booking_ids: v.ids, expected_total: v.expectedTotal }
            const { data, error } = await invokeFunction<{ paidCount: number; total: number }>('pay-class-bookings', body)
            if (error) throw new Error(error)
            return data!
        },
        // También al fallar: el precio pudo haber cambiado
        onSettled: invalidate,
    })
}

export function useCancelRecurringClass() {
    const invalidate = useInvalidateClasses()
    return useMutation({
        mutationFn: async (v: { id: string; reason?: string }) => {
            const { data, error } = await invokeFunction<{ cancelledCount: number; refunded: number }>('cancel-recurring-class', {
                recurring_class_id: v.id, reason: v.reason?.trim() || null,
            })
            if (error) throw new Error(error)
            return data!
        },
        onSuccess: invalidate,
    })
}