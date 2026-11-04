'use client'

import { useQuery, useMutation, useQueryClient, useQueryClient as useQC } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type { AppNotification } from '@/types'

interface NotificationsPage {
    data: AppNotification[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

const NOTIF_SELECT = `
  id, type, title, body, venue_id, admin_only, booking_id, data, created_at,
  reads:notification_reads!notification_id(id)
`

/** Transforma una fila raw de Supabase al tipo AppNotification */
function rowToNotification(row: any): AppNotification {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        venueId: row.venue_id ?? null,
        adminOnly: row.admin_only,
        bookingId: row.booking_id ?? null,
        data: row.data ?? null,
        read: Array.isArray(row.reads) && row.reads.length > 0,
        createdAt: row.created_at,
    }
}

/** Lista paginada de notificaciones del usuario (scope resuelto por RLS). */
export function useNotifications(page = 1, limit = 20) {
    const userId = useAuthStore((s) => s.user?.id)

    return useQuery({
      queryKey: ['notifications', page, limit],
      queryFn: async (): Promise<NotificationsPage> => {
          if (!userId) return { data: [], meta: { total: 0, page, limit, totalPages: 0 } }

          const from = (page - 1) * limit
          const to = from + limit - 1

          const { data, error, count } = await supabase
              .from('notifications')
              .select(NOTIF_SELECT, { count: 'exact' })
              .order('created_at', { ascending: false })
              .range(from, to)

          if (error) throw new Error(error.message)

          const total = count ?? 0
          return {
              data: (data ?? []).map(rowToNotification),
              meta: {
                  total,
                  page,
                  limit,
                  totalPages: Math.ceil(total / limit),
              },
          }
      },
      enabled: !!userId,
      refetchOnMount: 'always',
      placeholderData: (prev) => prev,
  })
}

/** Contador de no leídas con Realtime (reemplaza el polling de 30s). */
export function useUnreadCount() {
    const queryClient = useQC()
    const userId = useAuthStore((s) => s.user?.id)

    // Consulta inicial del conteo
    const query = useQuery({
        queryKey: ['notifications', 'unread'],
        queryFn: async (): Promise<{ count: number }> => {
            if (!userId) return { count: 0 }

            const { count, error } = await supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .not('id', 'in',
                    // Sub-query: excluir las ya leídas por este usuario
                    `(SELECT notification_id FROM notification_reads WHERE user_id = '${userId}')`
                )

            if (error) return { count: 0 }
            return { count: count ?? 0 }
        },
        enabled: !!userId,
        refetchOnWindowFocus: true,
  })

    // Suscripción Realtime: cuando llega un INSERT en notifications, invalidar el conteo
    useEffect(() => {
        if (!userId) return

        const channel = supabase
            .channel('notifications-realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
                    queryClient.invalidateQueries({ queryKey: ['notifications'] })
                }
            )
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [userId, queryClient])

    return query
}

/** Marca una notificación como leída (upsert idempotente). */
export function useMarkNotificationRead() {
    const queryClient = useQueryClient()
    const userId = useAuthStore((s) => s.user?.id)

    return useMutation({
      mutationFn: async (notificationId: string) => {
          if (!userId) throw new Error('No autenticado')
          const { error } = await supabase
              .from('notification_reads')
              .upsert(
                  { notification_id: notificationId, user_id: userId },
                  { onConflict: 'notification_id,user_id' }
              )
          if (error) throw new Error(error.message)
          return { ok: true }
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
      },
  })
}

/** Marca todas las notificaciones del scope como leídas. */
export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient()
    const userId = useAuthStore((s) => s.user?.id)

    return useMutation({
      mutationFn: async () => {
          if (!userId) throw new Error('No autenticado')

          // Obtener todas las no leídas del usuario
          const { data: unread, error: fetchError } = await supabase
              .from('notifications')
              .select('id')
              .not('id', 'in',
                  `(SELECT notification_id FROM notification_reads WHERE user_id = '${userId}')`
              )

          if (fetchError) throw new Error(fetchError.message)
          if (!unread?.length) return { count: 0 }

          // Insertar lecturas para todas
          const { error: insertError } = await supabase
              .from('notification_reads')
              .upsert(
                  unread.map((n) => ({ notification_id: n.id, user_id: userId })),
                  { onConflict: 'notification_id,user_id' }
              )

          if (insertError) throw new Error(insertError.message)
          return { count: unread.length }
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
      },
  })
}
