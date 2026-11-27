// ============================================================
// cron-cancel-unpaid/index.ts
// Scheduled Edge Function — corre cada hora.
//
// Cancela las reservas CONFIRMED + PENDING (sin pagar) cuyo inicio está dentro de
// las próximas 24 h, y las que ya empezaron sin pagar. Aplica a:
//   - fechas de turno fijo, y
//   - reservas manuales que un admin creó a nombre de un cliente (quedan pendientes
//     de pago y las paga el cliente). Las reservas propias se pagan al crearlas.
//
// Solo se cancela si el cliente tuvo tiempo de pagar: la reserva tiene que existir
// desde ANTES del límite de 24 h (created_at <= inicio - 24 h). Una reserva creada a
// menos de 24 h del turno no se cancela por esa regla: tiene hasta el inicio para pagar,
// y si el turno empieza sin pago se cancela en la corrida siguiente (REASON_STARTED).
//
// Idempotente y sin carreras: el UPDATE vuelve a exigir CONFIRMED + PENDING, así que
// si el cliente pagó entre la búsqueda y la cancelación, no se toca. Solo se avisa
// (email + notificación) de las que realmente se cancelaron.
// ============================================================

import { createAdminClient } from '../_shared/db.ts'
import { requireCron } from '../_shared/cron-auth.ts'
import { bookingToEmailData, sendBookingCancellation, sendClassCancellation } from '../_shared/email.ts'
import { classEmail, loadClass, ROLE_LABEL } from '../_shared/classes.ts'
import { notifyBookingCancelled } from '../_shared/notifications.ts'

const REASON = 'Cancelada automáticamente por falta de pago (menos de 24h de antelación)'
const REASON_STARTED = 'Cancelada automáticamente: no se pagó antes del inicio del turno'
const DAY_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  // Solo pg_cron (Authorization: Bearer CRON_SECRET, migración 060)
  const denied = requireCron(req)
  if (denied) return denied

  try {
    const supabase = createAdminClient()
    const classes = await cancelUnpaidClasses(supabase)
    const now = new Date()
    const in24h = new Date(now.getTime() + DAY_MS)

    // 1. Candidatas: sin pagar y empiezan en menos de 24 h, o ya empezaron.
    //    Las que ya empezaron no se pueden pagar (pay_booking lo rechaza): si se quedaran
    //    CONFIRMED + PENDING, el cliente las vería "pendientes de pago" para siempre. Pasa con
    //    las creadas a menos de 24 h del turno, que la regla de abajo no cancela antes.
    const { data: candidates, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, created_at, start_datetime, end_datetime, total_price, currency, payment_status,
        user:profiles!user_id(email, first_name, last_name),
        facility:facilities!facility_id(
          name,
          venue:venues!venue_id(id, name)
        )
      `)
      .eq('status', 'CONFIRMED')
      .eq('payment_status', 'PENDING')
      .lte('start_datetime', in24h.toISOString())

    if (fetchError) throw fetchError

    const nowMs = now.getTime()
    const started = (b: { start_datetime: string }) => new Date(b.start_datetime).getTime() <= nowMs
    // Ya empezó: se cancela siempre. Empieza en menos de 24 h: solo si existía antes del
    // límite de 24 h (el cliente tuvo tiempo de pagar).
    const reasonFor = new Map<string, string>()
    for (const b of candidates ?? []) {
      if (started(b)) reasonFor.set(b.id, REASON_STARTED)
      else if (new Date(b.created_at).getTime() <= new Date(b.start_datetime).getTime() - DAY_MS) reasonFor.set(b.id, REASON)
    }
    const toCancel = (candidates ?? []).filter((b) => reasonFor.has(b.id))
    if (toCancel.length === 0) {
      return new Response(JSON.stringify({ cancelled: 0, classes }), { status: 200 })
    }

    // 2. Cancelar solo si SIGUEN sin pagar (compare-and-set). Un UPDATE por motivo.
    const cancelledIds = new Set<string>()
    for (const reason of [REASON, REASON_STARTED]) {
      const ids = toCancel.filter((b) => reasonFor.get(b.id) === reason).map((b) => b.id)
      if (ids.length === 0) continue
      const { data: cancelled, error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'CANCELLED',
          cancelled_at: now.toISOString(),
          cancellation_reason: reason,
          updated_at: now.toISOString(),
        })
        .in('id', ids)
        .eq('status', 'CONFIRMED')
        .eq('payment_status', 'PENDING')
        .select('id')
      if (updateError) throw updateError
      for (const c of cancelled ?? []) cancelledIds.add(c.id)
    }

    // 3. Avisar solo de las que realmente se cancelaron (best-effort)
    await Promise.allSettled(
      toCancel
        .filter((b) => cancelledIds.has(b.id))
        .map(async (booking) => {
          const reason = reasonFor.get(booking.id)!
          const emailData = bookingToEmailData(booking as any)
          if (emailData) {
            await sendBookingCancellation({ ...emailData, reason })
          }
          await notifyBookingCancelled(booking as any, reason, true)
        }),
    )

    console.log(`cron-cancel-unpaid: ${cancelledIds.size} reservas canceladas`)
    return new Response(JSON.stringify({ cancelled: cancelledIds.size, classes }), { status: 200 })

  } catch (e) {
    console.error('cron-cancel-unpaid error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})

// Clases con entrenadores (067): mismas dos reglas, en la base (cancel_unpaid_class_bookings).
// Devuelve cuántas se cancelaron; avisa al alumno por email (best-effort).
// deno-lint-ignore no-explicit-any
async function cancelUnpaidClasses(supabase: any): Promise<number> {
  const { data, error } = await supabase.rpc('cancel_unpaid_class_bookings')
  if (error) {
    console.error('cancel_unpaid_class_bookings:', error)
    return 0
  }
  const items: { id: string; classId: string; reason: string }[] = data ?? []
  await Promise.allSettled(items.map(async (it) => {
    const c = await loadClass(supabase, it.classId)
    const student = c?.bookings.find((b) => b.id === it.id)?.user
    const mail = c && student ? classEmail(c, student) : null
    if (mail) await sendClassCancellation({ ...mail, reason: it.reason, byLabel: ROLE_LABEL.SYSTEM })
  }))
  return items.length
}