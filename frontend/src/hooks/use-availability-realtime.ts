'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Agrupa avisos seguidos (ej. cancelar una serie de turno fijo) en un solo refetch. */
const DEBOUNCE_MS = 400

/**
 * Mantiene al día la disponibilidad de UNA cancha mientras su pantalla está abierta.
 *
 * Cómo ahorra recursos:
 * - Sin polling: no consulta nada hasta que la base avisa que algo cambió
 *   (trigger `notify_availability_changed`, migración 020).
 * - Un solo canal, filtrado por cancha (`availability:<id>`): no recibe avisos de otras.
 * - Solo escucha con la pestaña visible. Al ocultarse se desuscribe; al volver,
 *   se resuscribe y refresca una vez por si hubo cambios mientras no escuchaba.
 * - Al recibir un aviso solo invalida: React Query vuelve a pedir únicamente la
 *   consulta que está en pantalla (el día elegido); las demás quedan marcadas
 *   como viejas y se piden recién si se abren.
 */
export function useAvailabilityRealtime(facilityId: string | undefined) {
    const queryClient = useQueryClient()

    useEffect(() => {
        if (!facilityId) return

        let channel: RealtimeChannel | null = null
        let timer: ReturnType<typeof setTimeout> | null = null
        let hasSubscribedOnce = false

        const refresh = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['availability', facilityId] })
                // Horarios y tarifas embebidos en la cancha (cambian qué slots y precios se muestran)
                queryClient.invalidateQueries({ queryKey: ['facility', facilityId] })
            }, DEBOUNCE_MS)
        }

        const subscribe = () => {
            if (channel) return
            channel = supabase
                .channel(`availability:${facilityId}`)
                .on('broadcast', { event: 'changed' }, refresh)
                .subscribe((status) => {
                    // En una reconexión pudimos perder avisos: refrescar una vez
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
    }, [facilityId, queryClient])
}
