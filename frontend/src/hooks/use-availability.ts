'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type SlotReason = 'past' | 'booked' | 'blocked'

export interface AvailabilitySlot {
    time: string
    available: boolean
    reason?: SlotReason
}

export interface AvailabilityResponse {
    available: boolean
    slots: AvailabilitySlot[]
    message?: string
}

export interface AvailabilitySummaryItem {
    facilityId: string
    available: boolean
    hasFreeSlots: boolean
    freeCount: number
    freeSlots: string[]
    message?: string
}

/** Fecha "YYYY-MM-DD" con los componentes LOCALES (no UTC). */
export function localDateStr(d: Date = new Date()): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

/**
 * Disponibilidad de una instalación para una fecha dada.
 * Usa la RPC get_availability (Postgres function) para calcular slots.
 */
export function useFacilityAvailability(facilityId: string, date: string, enabled = true) {
    const query = useQuery({
      queryKey: ['availability', facilityId, date],
      queryFn: async (): Promise<AvailabilityResponse> => {
          const { data, error } = await (supabase.rpc as any)('get_availability', {
              p_facility_id: facilityId,
              p_date: date,
          })
          if (error) throw new Error(error.message)
          return data as AvailabilityResponse
      },
      enabled: enabled && !!facilityId && !!date,
      staleTime: 60_000,
  })

    const hasFreeSlots = !!query.data?.slots?.some((s) => s.available)
    return { ...query, hasFreeSlots }
}

/**
 * Resumen de disponibilidad de muchas canchas en una sola llamada.
 * Usa la RPC get_availability_summary para evitar N+1 queries.
 */
export function useAvailabilitySummary(
    date: string,
    filters: { venueId?: string; sportId?: string } = {},
    enabled = true,
) {
    const query = useQuery({
      queryKey: ['availability-summary', date, filters.venueId ?? '', filters.sportId ?? ''],
      queryFn: async (): Promise<AvailabilitySummaryItem[]> => {
          const { data, error } = await (supabase.rpc as any)('get_availability_summary', {
              p_venue_id: filters.venueId ?? null,
              p_sport_id: filters.sportId ?? null,
              p_date: date,
          })
          if (error) throw new Error(error.message)

          // Normalizar facilityId (snake_case → camelCase)
          return ((data as any[]) ?? []).map((item) => ({
              facilityId: item.facility_id,
              available: item.available,
              hasFreeSlots: item.has_free_slots,
              freeCount: item.free_count,
              freeSlots: item.free_slots ?? [],
              message: item.message,
          }))
      },
      enabled: enabled && !!date,
      staleTime: 60_000,
  })

    const byFacility = new Map<string, AvailabilitySummaryItem>()
    for (const item of query.data ?? []) byFacility.set(item.facilityId, item)

    return { ...query, byFacility }
}
