// mark-paid/index.ts
// Paga una reserva PENDIENTE con los puntos del titular (billetera, migración 043).
// Idempotente: si ya está pagada responde OK sin volver a cobrar.
//
// POST body: { booking_id, expected_total? }
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

    const { booking_id, expected_total } = await req.json()
    if (!booking_id) return err('booking_id es requerido')
    const hasExpected = expected_total !== undefined && expected_total !== null
    if (hasExpected && !Number.isFinite(Number(expected_total))) return err('expected_total inválido')

    const supabase = createAdminClient()

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
