'use client'

// ============================================================
// hooks/use-my-province.ts
// Provincia del usuario autenticado (profiles.province).
// Es su "ubicación" para decidir qué publicidad ve.
// ============================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { isProvinceCode } from '@/lib/ar-provinces'

/** Provincia guardada en el perfil (null = todavía no la eligió). */
export function useMyProvince() {
  const userId = useAuthStore((s) => s.user?.id)

  return useQuery({
    queryKey: ['my-province', userId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('province')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data?.province ?? null
    },
    enabled: !!userId,
    staleTime: 30 * 60 * 1000,
  })
}

/** Guarda la provincia y refresca la publicidad, que depende de ella. */
export function useSetMyProvince() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async (province: string) => {
      if (!userId) throw new Error('No autenticado')
      if (!isProvinceCode(province)) throw new Error('Provincia inválida')
      const { error } = await supabase.from('profiles').update({ province }).eq('id', userId)
      if (error) throw new Error(error.message)
      return province
    },
    onSuccess: (province) => {
      queryClient.setQueryData(['my-province', userId], province)
      queryClient.invalidateQueries({ queryKey: ['advertisements'] })
    },
  })
}
