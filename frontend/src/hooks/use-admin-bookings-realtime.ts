'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Agrupa ráfagas (ej. cancelar una serie de turno fijo = varias filas) en un solo refetch. */
const DEBOUNCE_MS = 500

/**
 * Refresca las pantallas de reservas del panel cuando cambia una reserva.
 *
 * - Sin polling: espera los cambios que publica Postgres (migración 022).
 * - El alcance lo pone el RLS: Realtime solo le entrega a cada admin las filas que
 *   puede leer (ADMIN todo, VENUE_ADMIN su complejo).
 * - Solo escucha con la pestaña visible. Al volver, se resuscribe y refresca una vez
 *   por si hubo cambios mientras no escuchaba.
 * - Solo invalida: React Query vuelve a pedir únicamente lo que está en pantalla
 *   (la página actual del listado, o el detalle abierto).
 *
 * @param bookingId si se pasa, escucha solo esa reserva (vista de detalle).
 */
export function useAdminBookingsRealtime(enabled: boolean, bookingId?: string) {
    const queryClient = useQueryClient()

    useEffect(() => {
        if (!enabled) return

        let channel: RealtimeChannel | null = null
        let timer: ReturnType<typeof setTimeout> | null = null
        let hasSubscribedOnce = false

        const refresh = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['bookings'] })
                queryClient.invalidateQueries({ queryKey: ['booking'] })
            }, DEBOUNCE_MS)
        }

        const subscribe = () => {
            if (channel) return
            channel = supabase
                .channel(bookingId ? `admin-booking:${bookingId}` : 'admin-bookings')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'bookings',
                        ...(bookingId ? { filter: `id=eq.${bookingId}` } : {}),
                    },
                    refresh,
                )
                .subscribe((status) => {
                    // En una reconexión pudimos perder cambios: refrescar una vez
                    if (status === 'SUBSCRIBED') {
                        if (hasSubscribedOnce) refresh()
                        hasSubscribedOnce = true
                    }
                })
        }

        const unsubscribe = () => {
            if (!channel) return
            void supabase.removeChannel(channel)
            channel = null
        }

        const onVisibility = () => {
            if (document.visibilityState === 'visible') subscribe()
            else unsubscribe()
        }

        if (document.visibilityState === 'visible') subscribe()
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            if (timer) clearTimeout(timer)
            unsubscribe()
        }
    }, [enabled, bookingId, queryClient])
}
