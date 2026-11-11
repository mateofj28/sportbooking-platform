// ============================================================
// cron-cancel-unpaid/index.ts
// Scheduled Edge Function — corre cada hora.
//
// Cancela las reservas CONFIRMED + PENDING (sin pagar) cuyo inicio está dentro de
// las próximas 24 h. Aplica a:
//   - fechas de turno fijo, y
//   - reservas manuales que un admin creó a nombre de un cliente (quedan pendientes
//     de pago y las paga el cliente). Las reservas propias se pagan al crearlas.
//
// Solo se cancela si el cliente tuvo tiempo de pagar: la reserva tiene que existir
// desde ANTES del límite de 24 h (created_at <= inicio - 24 h). Una reserva creada a
// menos de 24 h del turno no se cancela sola.
//
// Idempotente y sin carreras: el UPDATE vuelve a exigir CONFIRMED + PENDING, así que
// si el cliente pagó entre la búsqueda y la cancelación, no se toca. Solo se avisa
// (email + notificación) de las que realmente se cancelaron.
// ============================================================

import { createAdminClient } from '../_shared/db.ts'
import { bookingToEmailData, sendBookingCancellation } from '../_shared/email.ts'
import { notifyBookingCancelled } from '../_shared/notifications.ts'

const REASON = 'Cancelada automáticamente por falta de pago (menos de 24h de antelación)'
const DAY_MS = 24 * 60 * 60 * 1000

Deno.serve(async (_req) => {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const in24h = new Date(now.getTime() + DAY_MS)

    // 1. Candidatas: sin pagar y empiezan en menos de 24 h
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
      .gt('start_datetime', now.toISOString())
      .lte('start_datetime', in24h.toISOString())

    if (fetchError) throw fetchError

    // Solo las que existían antes del límite de 24 h (el cliente tuvo tiempo de pagar)
    const toCancel = (candidates ?? []).filter((b) =>
      new Date(b.created_at).getTime() <= new Date(b.start_datetime).getTime() - DAY_MS,
    )
    if (toCancel.length === 0) {
      return new Response(JSON.stringify({ cancelled: 0 }), { status: 200 })
    }

    // 2. Cancelar solo si SIGUEN sin pagar (compare-and-set)
    const { data: cancelled, error: updateError } = await supabase
      .from('bookings')
      .update({
        status:              'CANCELLED',
        cancelled_at:        now.toISOString(),
        cancellation_reason: REASON,
        updated_at:          now.toISOString(),
      })
      .in('id', toCancel.map((b) => b.id))
      .eq('status', 'CONFIRMED')
      .eq('payment_status', 'PENDING')
      .select('id')

    if (updateError) throw updateError
    const cancelledIds = new Set((cancelled ?? []).map((c) => c.id))

    // 3. Avisar solo de las que realmente se cancelaron (best-effort)
    await Promise.allSettled(
      toCancel
        .filter((b) => cancelledIds.has(b.id))
        .map(async (booking) => {
          const emailData = bookingToEmailData(booking as any)
          if (emailData) {
            await sendBookingCancellation({ ...emailData, reason: REASON })
          }
          await notifyBookingCancelled(booking as any, REASON, true)
        }),
    )

    console.log(`cron-cancel-unpaid: ${cancelledIds.size} reservas canceladas`)
    return new Response(JSON.stringify({ cancelled: cancelledIds.size }), { status: 200 })

  } catch (e) {
    console.error('cron-cancel-unpaid error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
