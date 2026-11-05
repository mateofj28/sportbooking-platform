'use client'

// ============================================================
// hooks/use-dashboard-bookings.ts
// Hook compartido para el dashboard del admin.
//
// Problema anterior: TodayBookings, TodaySummary y RevenueByVenue
// hacían tres queries independientes con queryKeys distintas
// ("today-list", "today-summary", "revenue-by-venue") apuntando
// a apiClient.get("/bookings?limit=...") — una Edge Function que
// no existe. Eso generaba tres fetches redundantes al mismo dato.
//
// Solución: un único hook con queryKey ["bookings", "dashboard"]
// que consulta directo a la tabla bookings via supabase.from() con
// RLS automático. El scope (VENUE_ADMIN ve solo su sede, ADMIN ve
// todo) lo gestiona el RLS sin lógica extra en el cliente.
// ============================================================

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { camelize, BOOKING_SELECT } from '@/lib/supabase-helpers'
import type { Booking } from '@/types'

/** Carga las últimas 1000 reservas para el dashboard de administración.
 *  El RLS garantiza el scope: VENUE_ADMIN solo ve las de su sede. */
export function useDashboardBookings() {
    return useQuery({
        queryKey: ['bookings', 'dashboard'],
        queryFn: async (): Promise<Booking[]> => {
            const { data, error } = await supabase
                .from('bookings')
                .select(BOOKING_SELECT)
                .order('start_datetime', { ascending: false })
                .limit(1000)

            if (error) throw new Error(error.message)
            return (data ?? []).map((r) => camelize(r) as unknown as Booking)
        },
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        staleTime: 0,
    })
}
