'use client'

// ============================================================
// hooks/use-advertisements.ts
//
// Cliente:  useActiveAdvertisements() -> RPC get_active_advertisements.
//           El servidor decide qué le corresponde según la provincia
//           guardada en su perfil. El cliente no filtra nada.
// Admin:    useAdminAdvertisements() + mutaciones (RLS: solo ADMIN).
// ============================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type { Tables } from '@/lib/supabase'
import type { ActiveAdvertisement, AdScope, AdTheme, Advertisement } from '@/lib/ads'
import { arLocalToIso } from '@/lib/ads'
import type { AdvertisementFormData } from '@/lib/validations/advertisement.schema'

type AdRow = Tables<'advertisements'>

/**
 * Valor para simular a un cliente sin provincia: no coincide con ninguna,
 * así la RPC devuelve solo los anuncios nacionales.
 */
export const PREVIEW_NO_PROVINCE = 'NONE'

const ADS_KEY = ['advertisements'] as const

function mapAdminRow(r: AdRow): Advertisement {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    theme: r.theme as AdTheme,
    linkUrl: r.link_url,
    ctaLabel: r.cta_label,
    scope: r.scope as AdScope,
    provinces: r.provinces ?? [],
    priority: r.priority,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ---------------------------------------------------------------
// CLIENTE
// ---------------------------------------------------------------

/**
 * Publicidad vigente que le corresponde al usuario.
 * @param province  Solo para simulación (panel admin). Si se omite, el servidor
 *                  usa la provincia del perfil del usuario autenticado.
 */
export function useActiveAdvertisements(province?: string) {
  const userId = useAuthStore((s) => s.user?.id)

  return useQuery({
    // userId en la key: al cambiar de cuenta no se reutiliza la caché de otra persona
    queryKey: [...ADS_KEY, 'active', userId ?? 'anon', province ?? 'me'],
    queryFn: async (): Promise<ActiveAdvertisement[]> => {
      const { data, error } = await supabase.rpc('get_active_advertisements', {
        p_province: province,
      })
      if (error) throw new Error(error.message)
      return (data ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        subtitle: a.subtitle,
        description: a.description,
        theme: a.theme as AdTheme,
        linkUrl: a.link_url,
        ctaLabel: a.cta_label,
        scope: a.scope as AdScope,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------

/** Todos los anuncios (cualquier estado). RLS: solo ADMIN. */
export function useAdminAdvertisements(enabled = true) {
  return useQuery({
    queryKey: [...ADS_KEY, 'admin'],
    queryFn: async (): Promise<Advertisement[]> => {
      const { data, error } = await supabase
        .from('advertisements')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []).map(mapAdminRow)
    },
    enabled,
  })
}

/** Formulario -> fila de la base. NACIONAL nunca guarda provincias. */
function toRow(f: AdvertisementFormData) {
  return {
    title: f.title.trim(),
    subtitle: f.subtitle.trim() || null,
    description: f.description.trim() || null,
    theme: f.theme,
    link_url: f.linkUrl.trim() || null,
    cta_label: f.ctaLabel.trim() || null,
    scope: f.scope,
    provinces: f.scope === 'NATIONAL' ? [] : f.provinces,
    priority: f.priority,
    starts_at: arLocalToIso(f.startsAt),
    ends_at: arLocalToIso(f.endsAt),
    is_active: f.isActive,
  }
}

function useInvalidateAds() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ADS_KEY })
}

/** Crea (sin id) o actualiza (con id) un anuncio. */
export function useSaveAdvertisement() {
  const invalidate = useInvalidateAds()
  const userId = useAuthStore((s) => s.user?.id)

  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: AdvertisementFormData }) => {
      const row = toRow(data)
      const { error } = id
        ? await supabase.from('advertisements').update(row).eq('id', id)
        : await supabase.from('advertisements').insert({ ...row, created_by: userId ?? null })
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

/** Pausa o reanuda un anuncio. */
export function useToggleAdvertisement() {
  const invalidate = useInvalidateAds()
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('advertisements').update({ is_active: isActive }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}

export function useDeleteAdvertisement() {
  const invalidate = useInvalidateAds()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('advertisements').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}
