'use client'
import { toAppError } from '@/lib/error-messages'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { camelize } from '@/lib/supabase-helpers'
import type { VenueRow } from '@/lib/supabase-helpers'
import type { Venue } from '@/types'

const VENUE_SELECT = `
  id, name, slug, description, address, city, state, country,
  latitude, longitude, phone, email, image_url, amenities, is_active,
  created_at, updated_at
`

/** Lista todos los complejos activos (acceso público via RLS). */
export function useVenues() {
  return useQuery({
    queryKey: ['venues'],
    queryFn: async (): Promise<Venue[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select(VENUE_SELECT)
        .eq('is_active', true)
        .order('name')
      if (error) throw toAppError(error)
      return (data ?? []).map((v) => camelize(v as VenueRow) as unknown as Venue)
    },
    staleTime: 10 * 60 * 1000,  // 10 minutos — los complejos cambian con poca frecuencia
  })
}

/** Todos los complejos (activos e inactivos) — solo para admin. */
export function useAllVenues() {
  return useQuery({
    queryKey: ['venues', 'all'],
    queryFn: async (): Promise<Venue[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select(VENUE_SELECT)
        .order('name')
      if (error) throw toAppError(error)
      return (data ?? []).map((v) => camelize(v as VenueRow) as unknown as Venue)
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** Un complejo por id. */
export function useVenue(id: string) {
  return useQuery({
    queryKey: ['venue', id],
    queryFn: async (): Promise<Venue> => {
      const { data, error } = await supabase
        .from('venues')
        .select(VENUE_SELECT)
        .eq('id', id)
        .single()
      if (error) throw toAppError(error)
      return camelize(data as VenueRow) as unknown as Venue
    },
    enabled: !!id,
  })
}

/** Crea un complejo. */
export function useCreateVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<Venue>) => {
      const { data: result, error } = await supabase
        .from('venues')
        .insert({
          name: data.name!,
          slug: data.slug ?? data.name!.toLowerCase().replace(/\s+/g, '-'),
          description: data.description,
          address: data.address!,
          city: data.city!,
          country: data.country ?? 'Argentina',
          phone: data.phone,
          email: data.email,
          image_url: data.imageUrl,
          amenities: data.amenities ?? [],
        })
        .select()
        .single()
      if (error) throw toAppError(error)
      return camelize(result as VenueRow) as unknown as Venue
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venues'] }),
  })
}

/** Actualiza un complejo. */
export function useUpdateVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Venue> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('venues')
        .update({
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.address && { address: data.address }),
          ...(data.city && { city: data.city }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.imageUrl !== undefined && { image_url: data.imageUrl }),
          ...(data.amenities && { amenities: data.amenities }),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw toAppError(error)
      return camelize(result as VenueRow) as unknown as Venue
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      queryClient.invalidateQueries({ queryKey: ['venue', vars.id] })
    },
  })
}
