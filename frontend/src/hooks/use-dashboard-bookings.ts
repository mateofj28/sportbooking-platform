'use client'

// ============================================================
// hooks/use-dashboard-bookings.ts
// Reservas del dashboard del admin. Cada widget pide solo lo que muestra:
//
//   useDashboardDayBookings(day)  reservas de UN día AR (listas de hoy, resumen del día,
//                                 "Ganancia por complejo" con su selector de fecha)
//   useAdminBookingStateCounts()  cuántas realizadas / completadas en total (Resumen general)
//   useAdminBookingsByState(...)  una página de realizadas o completadas, con búsqueda,
//                                 resuelta en la base (RPC admin_list_bookings, migración 021)
//
// Antes había una sola consulta con las últimas 1000 reservas y todo se filtraba en el
// navegador: con más volumen, días viejos y el histórico salían incompletos.
// El alcance lo pone la base: RLS en la consulta directa y la propia RPC (admin de sede ->
// su complejo). Todas las keys cuelgan de ['bookings'], así que pagar, cancelar, crear o
// el realtime de reservas las invalidan juntas.
// ============================================================

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { camelize } from '@/lib/supabase-helpers'
import { toAppError } from '@/lib/error-messages'
import type { Booking } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000

/** 00:00 AR del día "YYYY-MM-DD" como instante UTC (AR = UTC-3, sin horario de verano). */
function arDayStartMs(day: string): number {
    const [y, m, d] = day.split('-').map(Number)
    return Date.UTC(y, m - 1, d, 3, 0, 0)
}

/** Solo las columnas que usan las tarjetas (sin precios ni horarios de cada cancha). */
const DAY_SELECT = `
  id, user_id, facility_id, start_datetime, end_datetime, status, payment_status,
  total_price, base_price, commission_amount, recurring_booking_id,
  facility:facilities!facility_id(id, name, venue:venues!venue_id(id, name)),
  user:profile_directory!user_id(id, first_name, last_name)
` as const

/**
 * Reservas no canceladas que EMPIEZAN o TERMINAN el día AR `day`.
 * - Empiezan ese día: actividad (pendientes de uso, clientes, turnos ocupados).
 * - Terminan ese día: dinero y completadas (un turno 23:00 -> 00:30 cuenta al día siguiente).
 * Ventana: inicio en [día − 24 h, día + 1) y fin > día. El límite de 24 h hacia atrás lo
 * garantiza la base (ningún turno dura más de 24 h, CHECK de la migración 059) y deja que
 * la consulta use el índice de start_datetime en vez de recorrer todo el historial.
 */
export function useDashboardDayBookings(day: string) {
    return useQuery({
        queryKey: ['bookings', 'dashboard-day', day],
        queryFn: async (): Promise<Booking[]> => {
            const start = arDayStartMs(day)
            const { data, error } = await supabase
                .from('bookings')
                .select(DAY_SELECT)
                .neq('status', 'CANCELLED')
                .gte('start_datetime', new Date(start - DAY_MS).toISOString())
                .lt('start_datetime', new Date(start + DAY_MS).toISOString())
                .gt('end_datetime', new Date(start).toISOString())
                .order('start_datetime', { ascending: true })
            if (error) throw toAppError(error)
            return (data ?? []).map((row) => camelize(row as unknown as Record<string, unknown>) as unknown as Booking)
        },
        staleTime: 2 * 60 * 1000,
        placeholderData: keepPreviousData, // al cambiar de día no parpadea
        refetchOnWindowFocus: false,       // las mutaciones y el realtime invalidan ['bookings']
    })
}

export type BookingBizState = 'REALIZADA' | 'COMPLETADA'

interface AdminListResult {
    items: Booking[]
    total: number
    counts: Record<string, number>
}

async function adminListBookings(params: { state: string; search: string; page: number; perPage: number }): Promise<AdminListResult> {
    const { data, error } = await (supabase.rpc as any)('admin_list_bookings', {
        p_from: null,
        p_to: null,
        p_state: params.state,
        p_search: params.search || null,
        p_page: params.page,
        p_per_page: params.perPage,
    })
    if (error) throw toAppError(error)
    const res = camelize((data ?? {}) as Record<string, unknown>) as unknown as Partial<AdminListResult>
    return { items: res.items ?? [], total: Number(res.total ?? 0), counts: res.counts ?? {} }
}

/** Totales históricos por estado de negocio (una fila pedida: solo interesan los contadores). */
export function useAdminBookingStateCounts(enabled = true) {
    return useQuery({
        queryKey: ['bookings', 'state-counts'],
        enabled,
        staleTime: 2 * 60 * 1000,
        queryFn: async () => {
            const r = await adminListBookings({ state: 'ALL', search: '', page: 1, perPage: 1 })
            return {
                REALIZADA: Number(r.counts.REALIZADA ?? 0),
                COMPLETADA: Number(r.counts.COMPLETADA ?? 0),
            }
        },
    })
}

/** Una página de reservas realizadas o completadas (histórico), con búsqueda. */
export function useAdminBookingsByState(state: BookingBizState, search: string, page: number, perPage: number, enabled = true) {
    return useQuery({
        queryKey: ['bookings', 'by-state', state, search, page, perPage],
        enabled,
        staleTime: 60 * 1000,
        placeholderData: keepPreviousData,
        queryFn: async () => {
            const r = await adminListBookings({ state, search, page, perPage })
            return { items: r.items, total: r.total }
        },
    })
}
