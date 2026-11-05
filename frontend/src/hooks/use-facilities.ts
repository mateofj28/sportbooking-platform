'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { camelize } from '@/lib/supabase-helpers'
import type { FacilityRow } from '@/lib/supabase-helpers'
import type { Facility } from '@/types'

const FACILITY_SELECT = `
  *,
  sport:sports!sport_id(id, name, description, max_players, billing_type, is_active),
  venue:venues!venue_id(id, name, city, address),
  schedules(id, facility_id, day_of_week, open_time, close_time, is_active),
  pricing(id, facility_id, day_of_week, start_time, end_time, price_per_hour, profit_percent, currency, is_active)
`

interface FacilityFilters {
    venueId?: string
    sportId?: string
    isIndoor?: boolean
    includeInactive?: boolean
    bookableOnly?: boolean | string
}

/** Lista de canchas con filtros opcionales (acceso público via RLS). */
export function useFacilities(filters: FacilityFilters = {}) {
    return useQuery({
        queryKey: ['facilities', filters],
        queryFn: async (): Promise<Facility[]> => {
            let query = supabase.from('facilities').select(FACILITY_SELECT)

            if (!filters.includeInactive) query = query.eq('is_active', true)
            if (filters.venueId) query = query.eq('venue_id', filters.venueId)
            if (filters.sportId) query = query.eq('sport_id', filters.sportId)
            if (filters.isIndoor !== undefined) query = query.eq('is_indoor', filters.isIndoor)

            query = query.order('name')

            const { data, error } = await query
            if (error) throw new Error(error.message)

            return (data ?? []).map((f) => camelize(f as unknown as FacilityRow) as unknown as Facility)
        },
        staleTime: 10 * 60 * 1000,  // 10 minutos — las canchas (precios, horarios) cambian poco
    })
}

/** Una cancha por id con todas sus relaciones. */
export function useFacility(id: string) {
    return useQuery({
        queryKey: ['facility', id],
        queryFn: async (): Promise<Facility> => {
            const { data, error } = await supabase
                .from('facilities')
                .select(FACILITY_SELECT)
                .eq('id', id)
                .single()
            if (error) throw new Error(error.message)
            return camelize(data as unknown as FacilityRow) as unknown as Facility
        },
        enabled: !!id,
    })
}

/** Crea una cancha. */
export function useCreateFacility() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (data: Partial<Facility> & { venueId: string; sportId: string }) => {
            const { data: result, error } = await supabase
                .from('facilities')
                .insert({
                    venue_id: data.venueId,
                    sport_id: data.sportId,
                    name: data.name!,
                    description: data.description,
                    image_url: data.imageUrl,
                    surface_type: data.surfaceType,
                    is_indoor: data.isIndoor ?? false,
                    capacity: data.capacity,
                    min_booking_duration: data.minBookingDuration ?? 60,
                    max_booking_duration: data.maxBookingDuration ?? 120,
                })
                .select()
                .single()
            if (error) throw new Error(error.message)
            return camelize(result as unknown as FacilityRow) as unknown as Facility
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facilities'] }),
    })
}

/** Actualiza una cancha. */
export function useUpdateFacility() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<Facility> & { id: string }) => {
            const { data: result, error } = await supabase
                .from('facilities')
                .update({
                    ...(data.name && { name: data.name }),
                    ...(data.description !== undefined && { description: data.description }),
                    ...(data.imageUrl !== undefined && { image_url: data.imageUrl }),
                    ...(data.surfaceType !== undefined && { surface_type: data.surfaceType }),
                    ...(data.isIndoor !== undefined && { is_indoor: data.isIndoor }),
                    ...(data.capacity !== undefined && { capacity: data.capacity }),
                    ...(data.isActive !== undefined && { is_active: data.isActive }),
                    ...(data.minBookingDuration && { min_booking_duration: data.minBookingDuration }),
                    ...(data.maxBookingDuration && { max_booking_duration: data.maxBookingDuration }),
                })
                .eq('id', id)
                .select()
                .single()
            if (error) throw new Error(error.message)
            return camelize(result as unknown as FacilityRow) as unknown as Facility
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['facilities'] })
            queryClient.invalidateQueries({ queryKey: ['facility', vars.id] })
        },
    })
}
