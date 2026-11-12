'use client'
import { toAppError } from '@/lib/error-messages'

// ============================================================
// hooks/use-notifications.ts
// Notificaciones in-app con Supabase Realtime.
// Buenas prácticas aplicadas:
// - useUnreadCount: dos queries separadas (no sub-query SQL interpolado)
// - Realtime: canal con nombre único por usuario + filtro por venue_id
// - useMarkAllNotificationsRead: usa IDs de notification_reads, no sub-query
// - Import limpio: un solo useQueryClient sin alias
// ============================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type { NotificationRow } from '@/lib/supabase-helpers'
import type { AppNotification } from '@/types'

interface NotificationsPage {
    data: AppNotification[]
    meta: { total: number; page: number; limit: number; totalPages: number }
}

const NOTIF_SELECT = `
  id, type, title, body, venue_id, admin_only, booking_id, data, created_at,
  reads:notification_reads!notification_id(id)
`

function rowToNotification(row: NotificationRow): AppNotification {
    return {
        id: row.id,
        type: row.type as AppNotification['type'],
        title: row.title,
        body: row.body,
        venueId: row.venue_id ?? null,
        adminOnly: row.admin_only ?? false,
        bookingId: row.booking_id ?? null,
        data: (row.data as Record<string, unknown> | null) ?? null,
        // "leída" = existe al menos una fila en notification_reads para este usuario
        // (el select NOTIF_SELECT filtra los reads del usuario autenticado via RLS)
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

            if (error) throw toAppError(error)

            const total = count ?? 0
            return {
                data: (data ?? []).map((row) => rowToNotification(row as unknown as NotificationRow)),
                meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
            }
        },
        enabled: !!userId,
        refetchOnMount: 'always',
        placeholderData: (prev) => prev,
    })
}

/**
 * Contador de no leídas.
 * Buenas prácticas:
 * 1. Dos queries separadas en vez de sub-query SQL como string literal
 *    (PostgREST no ejecuta SQL arbitrario — el string se trataría como valor literal).
 * 2. Canal Realtime con nombre único por usuario para evitar colisiones.
 * 3. Filtro Realtime por venue_id para que VENUE_ADMIN no reciba
 *    invalidaciones de notificaciones de otras sedes.
 */
export function useUnreadCount() {
    const queryClient = useQueryClient()
    const user = useAuthStore((s) => s.user)
    const userId = user?.id
    const isVenueAdmin = user?.role === 'VENUE_ADMIN'
    const venueId = user?.venueId

    const query = useQuery({
        queryKey: ['notifications', 'unread'],
        queryFn: async (): Promise<{ count: number }> => {
            if (!userId) return { count: 0 }

            // Paso 1: obtener las notificaciones ya leídas por este usuario
            const { data: reads, error: readsError } = await supabase
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', userId)

            if (readsError) return { count: 0 }

            // Paso 2: contar notificaciones no leídas
            // Si no hay lecturas, no aplicar filtro (todas son no leídas)
            const readIds = (reads ?? []).map((r) => r.notification_id)

            let query = supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })

            // Excluir las ya leídas solo si hay alguna
            if (readIds.length > 0) {
                query = query.not('id', 'in', `(${readIds.join(',')})`)
            }

            const { count, error } = await query
            if (error) return { count: 0 }
            return { count: count ?? 0 }
        },
        enabled: !!userId,
        refetchOnWindowFocus: true,
    })

    // Realtime: invalidar el contador cuando llega una nueva notificación.
    // Canal con nombre único por usuario para evitar colisiones entre sesiones.
    // Filtro por venue_id para VENUE_ADMIN: solo recibe eventos de su sede.
    useEffect(() => {
        if (!userId) return

        const filter = isVenueAdmin && venueId
            ? `venue_id=eq.${venueId}`
            : undefined   // ADMIN escucha todas

        const channel = supabase
            .channel(`notifications:${userId}`)     // nombre único por usuario
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    ...(filter ? { filter } : {}),
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
                    queryClient.invalidateQueries({ queryKey: ['notifications'] })
                }
            )
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [userId, isVenueAdmin, venueId, queryClient])

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
            if (error) throw toAppError(error)
            return { ok: true }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}

/**
 * Marca todas las notificaciones del scope como leídas.
 * Buenas prácticas:
 * - Usa notification_reads ya cargadas en vez de sub-query SQL interpolado.
 * - El NOTIF_SELECT ya incluye los reads del usuario via RLS, así que
 *   se pueden reutilizar los datos del cache si están disponibles.
 */
export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient()
    const userId = useAuthStore((s) => s.user?.id)

    return useMutation({
        mutationFn: async () => {
            if (!userId) throw new Error('No autenticado')

            // Paso 1: obtener IDs de notificaciones ya leídas
            const { data: reads } = await supabase
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', userId)

            const readIds = (reads ?? []).map((r) => r.notification_id)

            // Paso 2: obtener todas las notificaciones no leídas del scope del usuario
            let unreadQuery = supabase
                .from('notifications')
                .select('id')

            if (readIds.length > 0) {
                unreadQuery = unreadQuery.not('id', 'in', `(${readIds.join(',')})`)
            }

            const { data: unread, error: fetchError } = await unreadQuery
            if (fetchError) throw toAppError(fetchError)
            if (!unread?.length) return { count: 0 }

            // Paso 3: insertar lecturas para todas las no leídas
            const { error: insertError } = await supabase
                .from('notification_reads')
                .upsert(
                    unread.map((n) => ({ notification_id: n.id, user_id: userId })),
                    { onConflict: 'notification_id,user_id' }
                )

            if (insertError) throw toAppError(insertError)
            return { count: unread.length }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}
