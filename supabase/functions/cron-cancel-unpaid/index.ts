// ============================================================
// cron-cancel-unpaid/index.ts
// Scheduled Edge Function — corre cada hora.
// Cancela reservas de turno fijo CONFIRMED+PENDING
// cuyo inicio está dentro de las próximas 24h.
// Idempotente: solo procesa las que siguen siendo CONFIRMED.
// Efectos secundarios: email + notificación in-app al admin.
// ============================================================

import { createAdminClient } from '../_shared/db.ts'
import { bookingToEmailData, sendBookingCancellation } from '../_shared/email.ts'
import { notifyBookingCancelled } from '../_shared/notifications.ts'

const REASON = 'Cancelada automáticamente por falta de pago (menos de 24h de antelación)'

Deno.serve(async (_req) => {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // 1. Buscar reservas a cancelar
    const { data: toCancel, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, start_datetime, end_datetime, total_price, currency, payment_status,
        user:profiles!user_id(email, first_name, last_name),
        facility:facilities!facility_id(
          name,
          venue:venues!venue_id(id, name)
        )
      `)
      .not('recurring_booking_id', 'is', null)
      .eq('status', 'CONFIRMED')
      .eq('payment_status', 'PENDING')
      .gt('start_datetime', now.toISOString())
      .lte('start_datetime', in24h.toISOString())

    if (fetchError) throw fetchError
    if (!toCancel || toCancel.length === 0) {
      return new Response(JSON.stringify({ cancelled: 0 }), { status: 200 })
    }

    // 2. Cancelar en la DB (atómico)
    const ids = toCancel.map((b) => b.id)
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status:              'CANCELLED',
        cancelled_at:        now.toISOString(),
        cancellation_reason: REASON,
        updated_at:          now.toISOString(),
      })
      .in('id', ids)

    if (updateError) throw updateError

    // 3. Efectos secundarios: email + notif por cada reserva (best-effort)
    await Promise.allSettled(
      toCancel.map(async (booking) => {
        const emailData = bookingToEmailData(booking as any)
        if (emailData) {
          await sendBookingCancellation({ ...emailData, reason: REASON })
        }
        await notifyBookingCancelled(booking as any, REASON, true)
      }),
    )

    console.log(`cron-cancel-unpaid: ${toCancel.length} reservas canceladas`)
    return new Response(JSON.stringify({ cancelled: toCancel.length }), { status: 200 })

  } catch (e) {
    console.error('cron-cancel-unpaid error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
