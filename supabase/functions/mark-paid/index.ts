// mark-paid/index.ts
// Paga una reserva PENDIENTE con los puntos del titular (billetera, migración 043).
// Idempotente: si ya está pagada responde OK sin volver a cobrar.
//
// POST body: { booking_id, expected_total? }
//        o:  { booking_ids: [...], expected_total? }  -> paga varias fechas de una vez
//            (todo o nada, pay_bookings_batch, migración 054). Solo las propias, pendientes y futuras.
//   expected_total = el monto que el cliente VIO al tocar "Pagar". Si el precio de la
//   reserva cambió mientras tanto (cambio de tarifa, migración 029), NO se cobra: 409
//   con el precio nuevo. Sin saldo suficiente: 402 con cuánto falta.
//
// Todo pasa en pay_booking (una transacción): bloquea la reserva y la billetera,
// verifica titular, estado y precio, descuenta y marca como pagada.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { notifyBookingPaid } from '../_shared/notifications.ts'
import { walletProblem } from '../_shared/wallet-errors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autorizado', 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return err('No autorizado', 401)

    const { booking_id, booking_ids, expected_total } = await req.json()
    const hasExpected = expected_total !== undefined && expected_total !== null
    if (hasExpected && !Number.isFinite(Number(expected_total))) return err('expected_total inválido')

    const supabase = createAdminClient()

    // ---- Pagar varias fechas de una vez ("Pagar todo" del turno fijo) ----
    if (Array.isArray(booking_ids)) {
      const UUID = /^[0-9a-f-]{36}$/i
      const ids = [...new Set(booking_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)))] as string[]
      if (ids.length === 0 || ids.length > 20) return err('Elegí entre 1 y 20 fechas para pagar')

      // Solo lo propio, pendiente y que todavía no empezó (lo demás se ignora)
      const { data: rows, error: listErr } = await supabase
        .from('bookings')
        .select('id, total_price')
        .in('id', ids)
        .eq('user_id', user.id)
        .eq('status', 'CONFIRMED')
        .eq('payment_status', 'PENDING')
        .gt('start_datetime', new Date().toISOString())
      if (listErr) return err('No se pudieron leer las fechas', 500)
      if (!rows || rows.length === 0) return err('No hay fechas pendientes para pagar', 409)

      // Si el precio cambió mientras el cliente miraba, no se cobra (mismo criterio que una fecha)
      const total = rows.reduce((s, r) => s + Math.round(Number(r.total_price)), 0)
      if (hasExpected && Math.round(Number(expected_total)) !== total) {
        return err(`El total cambió a ${total.toLocaleString('en-US')} créditos. Revisalo antes de pagar.`, 409, { total })
      }

      const { data: paid, error: payErr } = await (supabase.rpc as any)('pay_bookings_batch', {
        p_bookings: rows.map((r) => r.id),
        p_user: user.id,
      })
      if (payErr) {
        const problem = walletProblem(payErr, 'No se pudieron pagar las fechas')
        return err(problem.message, problem.status, { code: problem.code, ...problem.extra })
      }

      // Avisos al complejo (best-effort)
      const { data: paidRows } = await supabase
        .from('bookings')
        .select('id, user_id, total_price, currency, start_datetime, end_datetime, facility:facilities!facility_id(venue_id, name, venue:venues!venue_id(id, name)), user:profiles!user_id(first_name, last_name)')
        .in('id', rows.map((r) => r.id))
      for (const b of paidRows ?? []) void notifyBookingPaid(b as any)

      return ok({ paid: true, paidCount: Number(paid?.paidCount ?? 0), total: Number(paid?.total ?? 0) })
    }

    if (!booking_id) return err('booking_id es requerido')

    // Solo el titular paga (pay_booking lo exige con p_user = quien llama)
    const { data: result, error: payErr } = await (supabase.rpc as any)('pay_booking', {
      p_booking: booking_id,
      p_user: user.id,
      p_expected: hasExpected ? Number(expected_total) : null,
    })
    if (payErr) {
      const problem = walletProblem(payErr, 'No se pudo pagar la reserva')
      return err(problem.message, problem.status, { code: problem.code, ...problem.extra })
    }

    if (!result?.already) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, user_id, total_price, currency, start_datetime, end_datetime, facility:facilities!facility_id(venue_id, name, venue:venues!venue_id(id, name)), user:profiles!user_id(first_name, last_name)')
        .eq('id', booking_id)
        .single()
      if (booking) void notifyBookingPaid(booking as any)
    }

    return ok({ id: booking_id, paid: true, total: result?.total ?? null })
  } catch (e) {
    console.error('mark-paid error:', e)
    return err('Error interno del servidor', 500)
  }
})
