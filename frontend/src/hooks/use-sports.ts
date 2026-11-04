'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { camelize } from '@/lib/supabase-helpers'
import type { Sport } from '@/types'

/** Lista todos los deportes activos (acceso público via RLS). */
export function useSports(activeOnly = true) {
  return useQuery({
    queryKey: ['sports', activeOnly],
    queryFn: async (): Promise<Sport[]> => {
      let query = supabase
        .from('sports')
        .select('id, name, description, max_players, billing_type, is_active')
        .order('name')

      if (activeOnly) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return (data ?? []).map((s) => camelize(s) as unknown as Sport)
    },
  })
}
