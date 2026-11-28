// ============================================================
// cron-send-reminders/index.ts
// Scheduled Edge Function — corre cada 10 minutos.
// Envía recordatorio a turnos CONFIRMED+PAID
// con inicio dentro de las próximas 2h y reminder_sent_at IS NULL.
// Idempotente: marca reminder_sent_at ANTES de enviar el email.
// ============================================================

import { createAdminClient } from '../_shared/db.ts'
import { requireCron } from '../_shared/cron-auth.ts'
import { bookingToEmailData, sendBookingReminder, sendClassReminder } from '../_shared/email.ts'
import { classEmail, loadClass } from '../_shared/classes.ts'

Deno.serve(async (req) => {
  // Solo pg_cron (Authorization: Bearer CRON_SECRET, migración 060)
  const denied = requireCron(req)
  if (denied) return denied

  try {
    const supabase = createAdminClient()
    const now = new Date()
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const classes = await sendClassReminders(supabase)

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
      return new Response(JSON.stringify({ sent: 0, classes }), { status: 200 })
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
    return new Response(JSON.stringify({ sent: upcoming.length, classes }), { status: 200 })

  } catch (e) {
    console.error('cron-send-reminders error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})

// Clases con entrenadores (069): claim_class_reminders marca y devuelve lo pendiente de una vez
// (idempotente) y deja el aviso in-app del entrenador. Acá van los emails (best-effort).
// deno-lint-ignore no-explicit-any
async function sendClassReminders(supabase: any): Promise<number> {
  const { data, error } = await supabase.rpc('claim_class_reminders')
  if (error) {
    console.error('claim_class_reminders:', error)
    return 0
  }
  const students: { id: string; classId: string }[] = data?.students ?? []
  const classIds: string[] = data?.classes ?? []
  const ids = [...new Set([...students.map((s) => s.classId), ...classIds])]
  const loaded = new Map((await Promise.all(ids.map((id) => loadClass(supabase, id)))).filter(Boolean).map((c) => [c!.id, c!]))
  await Promise.allSettled([
    ...students.map(async (s) => {
      const c = loaded.get(s.classId)
      const student = c?.bookings.find((b) => b.id === s.id)?.user
      const mail = c && student ? classEmail(c, student) : null
      if (mail) await sendClassReminder(mail, false)
    }),
    ...classIds.map(async (id) => {
      const c = loaded.get(id)
      const mail = c ? classEmail(c, c.trainer) : null
      if (mail) await sendClassReminder(mail, true)
    }),
  ])
  return students.length + classIds.length
}