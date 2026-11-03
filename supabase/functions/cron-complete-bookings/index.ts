// ============================================================
// cron-complete-bookings/index.ts
// Scheduled Edge Function — corre cada hora (minuto 30).
// Pasa a COMPLETED las reservas CONFIRMED+PAID
// cuyo end_datetime ya pasó.
// Idempotente: solo procesa las que siguen siendo CONFIRMED.
// Emite notificación de comisión agrupada por sede (admin general).
// ============================================================

import { createAdminClient } from '../_shared/db.ts'
import { notifyCommissionEarned } from '../_shared/notifications.ts'

Deno.serve(async (_req) => {
  try {
    const supabase = createAdminClient()
    const now = new Date()

    // 1. Buscar reservas a completar (con datos de sede para agrupar comisión)
    const { data: toComplete, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, commission_amount,
        facility:facilities!facility_id(
          venue:venues!venue_id(id, name)
        )
      `)
      .eq('status', 'CONFIRMED')
      .eq('payment_status', 'PAID')
      .lt('end_datetime', now.toISOString())

    if (fetchError) throw fetchError
    if (!toComplete || toComplete.length === 0) {
      return new Response(JSON.stringify({ completed: 0 }), { status: 200 })
    }

    const ids = toComplete.map((b) => b.id)

    // 2. Marcar como COMPLETED (atómico)
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status:     'COMPLETED',
        updated_at: now.toISOString(),
      })
      .in('id', ids)

    if (updateError) throw updateError

    // 3. Agrupar comisiones por sede y emitir notificación al admin general
    const byVenue = new Map<string, { name: string; commission: number }>()
    for (const b of toComplete) {
      const venue = (b.facility as any)?.venue
      if (!venue?.id) continue
      const existing = byVenue.get(venue.id) ?? { name: venue.name, commission: 0 }
      existing.commission += Number(b.commission_amount) || 0
      byVenue.set(venue.id, existing)
    }

    await Promise.allSettled(
      Array.from(byVenue.values())
        .filter((v) => v.commission > 0)
        .map((v) => notifyCommissionEarned(v.name, v.commission)),
    )

    console.log(`cron-complete-bookings: ${toComplete.length} reservas completadas`)
    return new Response(JSON.stringify({ completed: toComplete.length }), { status: 200 })

  } catch (e) {
    console.error('cron-complete-bookings error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
