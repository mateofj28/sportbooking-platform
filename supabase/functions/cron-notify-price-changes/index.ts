// ============================================================
// cron-notify-price-changes/index.ts
// Scheduled Edge Function — corre cada 5 minutos (pg_cron, migración 029).
//
// Avisa por email a los clientes cuyas fechas de turno fijo cambiaron de precio
// porque se modificó la tarifa (reprice_pending_recurring).
//
// - Solo avisa cambios que llevan al menos 5 minutos sin tocarse: si el admin
//   corrige un error enseguida, el cliente recibe UN aviso con el resultado final.
// - Un email por cliente con todas sus fechas afectadas.
// - Idempotente: marca notified_at ANTES de enviar (como cron-send-reminders).
// - Si la fecha ya no está pendiente (se pagó, se canceló o ya pasó), se marca como
//   avisada sin enviar nada.
// ============================================================

import { createAdminClient } from '../_shared/db.ts'
import { sendPriceChangeNotice, type PriceChangeLine } from '../_shared/email.ts'
import { arDateLabel, arTime } from '../_shared/ar-time.ts'

const QUIET_MINUTES = 5

const money = (n: number, currency: string) => `$${Math.round(n).toLocaleString('es-AR')} ${currency}`

Deno.serve(async (_req) => {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const quietSince = new Date(now.getTime() - QUIET_MINUTES * 60 * 1000)

    // 1. Cambios sin avisar y "quietos" hace al menos 5 minutos
    const { data: changes, error: fetchError } = await supabase
      .from('booking_price_changes')
      .select(`
        booking_id, user_id, old_total, new_total, currency, changed_at,
        booking:bookings!booking_id(
          id, start_datetime, end_datetime, status, payment_status,
          facility:facilities!facility_id(name, venue:venues!venue_id(name))
        ),
        user:profiles!user_id(email, first_name)
      `)
      .is('notified_at', null)
      .lte('changed_at', quietSince.toISOString())

    if (fetchError) throw fetchError
    if (!changes || changes.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), { status: 200 })
    }

    // 2. Marcar como avisados ANTES de enviar (idempotencia). Solo los que siguen
    //    "quietos": si alguno cambió en el medio, queda para la próxima vuelta.
    const ids = changes.map((c) => c.booking_id)
    const { data: marked, error: markError } = await supabase
      .from('booking_price_changes')
      .update({ notified_at: now.toISOString() })
      .in('booking_id', ids)
      .is('notified_at', null)
      .lte('changed_at', quietSince.toISOString())
      .select('booking_id')
    if (markError) throw markError
    const markedIds = new Set((marked ?? []).map((m) => m.booking_id))

    // 3. Agrupar por cliente, solo fechas que siguen pendientes de pago y futuras
    const byUser = new Map<string, { email: string; firstName: string; lines: PriceChangeLine[] }>()
    for (const c of changes as any[]) {
      if (!markedIds.has(c.booking_id)) continue
      const b = c.booking
      const stillPending = b && b.status === 'CONFIRMED' && b.payment_status === 'PENDING'
        && new Date(b.start_datetime).getTime() > now.getTime()
      if (!stillPending || !c.user?.email) continue

      const entry = byUser.get(c.user_id) ?? { email: c.user.email, firstName: c.user.first_name ?? '', lines: [] }
      entry.lines.push({
        venueName: b.facility?.venue?.name ?? '',
        facilityName: b.facility?.name ?? '',
        dateLabel: arDateLabel(b.start_datetime),
        timeLabel: `${arTime(b.start_datetime)} - ${arTime(b.end_datetime)}`,
        oldPrice: money(Number(c.old_total), c.currency ?? 'ARS'),
        newPrice: money(Number(c.new_total), c.currency ?? 'ARS'),
        startsAt: b.start_datetime,
      })
      byUser.set(c.user_id, entry)
    }

    // 4. Enviar (best-effort: un fallo no frena al resto)
    await Promise.allSettled(
      [...byUser.values()].map((u) => {
        u.lines.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        return sendPriceChangeNotice({ email: u.email, firstName: u.firstName, lines: u.lines })
      }),
    )

    console.log(`cron-notify-price-changes: ${markedIds.size} cambios, ${byUser.size} emails`)
    return new Response(JSON.stringify({ notified: markedIds.size, emails: byUser.size }), { status: 200 })
  } catch (e) {
    console.error('cron-notify-price-changes error:', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
