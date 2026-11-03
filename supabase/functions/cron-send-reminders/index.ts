// ============================================================
// cron-send-reminders/index.ts
// Scheduled Edge Function — corre cada 10 minutos.
// Envía recordatorio a turnos CONFIRMED+PAID
// con inicio dentro de las próximas 2h y reminder_sent_at IS NULL.
// Idempotente: marca reminder_sent_at ANTES de enviar el email.
// ============================================================

import { createAdminClient } from '../_shared/db.ts'
import { bookingToEmailData, sendBookingReminder } from '../_shared/email.ts'

Deno.serve(async (_req) => {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    // 1. Buscar turnos próximos sin recordatorio enviado
    const { data: upcoming, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, start_datetime, end_datetime, total_price, currency, payment_status,
        user:profiles!user_id(email, first_name, last_name),
        facility:facilities!facility_id(
          name,
          venue:venues!venue_id(id, name)
        )
      `)
      .eq('status', 'CONFIRMED')
      .eq('payment_status', 'PAID')
      .is('reminder_sent_at', null)
      .gt('start_datetime', now.toISOString())
      .lte('start_datetime', in2h.toISOString())

    if (fetchError) throw fetchError
    if (!upcoming || upcoming.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    const ids = upcoming.map((b) => b.id)

    // 2. Marcar reminder_sent_at ANTES de enviar (idempotencia)
    //    Si el email falla, no se reintenta (no spamear)
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        reminder_sent_at: now.toISOString(),
        updated_at:       now.toISOString(),
      })
      .in('id', ids)

    if (updateError) throw updateError

    // 3. Enviar emails (best-effort: allSettled no falla si uno falla)
    await Promise.allSettled(
      upcoming.map(async (booking) => {
        const emailData = bookingToEmailData(booking as any)
        if (emailData) await sendBookingReminder(emailData)
      }),
    )

    console.log(`cron-send-reminders: ${upcoming.length} recordatorios enviados`)
    return new Response(JSON.stringify({ sent: upcoming.length }), { status: 200 })

  } catch (e) {
    console.error('cron-send-reminders error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
