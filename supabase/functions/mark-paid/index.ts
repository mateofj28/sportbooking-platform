// mark-paid/index.ts
// Marca una reserva como pagada. Idempotente si ya está PAID.
//
// POST body: { booking_id, expected_total? }
//   expected_total = el monto que el cliente VIO al tocar "Pagar". Si el precio de la
//   reserva cambió mientras tanto (cambio de tarifa, migración 029), NO se cobra:
//   se responde 409 con el precio nuevo para que lo revise. El cobro se registra con
//   un UPDATE condicionado al precio (compare-and-set), así no hay carrera posible
//   con un recálculo simultáneo.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { notifyBookingPaid } from '../_shared/notifications.ts'
import { actorFromUser, canPay } from '../_shared/permissions.ts'

const money = (n: number, currency: string) => `$${Math.round(n).toLocaleString('es-AR')} ${currency}`

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
    if (expected_total !== undefined && expected_total !== null && !Number.isFinite(Number(expected_total))) {
      return err('expected_total inválido')
    }

    const supabase = createAdminClient()
    const actor = actorFromUser(user)

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, user_id, status, payment_status, total_price, currency, facility:facilities!facility_id(venue_id, name, venue:venues!venue_id(id, name))')
      .eq('id', booking_id)
      .single()

    if (fetchErr || !booking) return err('Reserva no encontrada', 404)
    if (booking.status === 'CANCELLED') return err('No se puede pagar una reserva cancelada')

    // Solo el titular paga su reserva (desde la vista de cliente). Ningún admin
    // puede marcar como pagada la reserva de otra persona, ni en su complejo.
    if (!canPay(actor, booking.user_id)) {
      return err('Solo el titular de la reserva puede pagarla', 403)
    }

    // Idempotente: si ya está PAID, devolver éxito sin re-procesar
    if (booking.payment_status === 'PAID') return ok({ id: booking_id, paid: true })

    const currency = booking.currency ?? 'ARS'
    const priceChangedMsg = (current: number) =>
      `El precio de esta fecha cambió a ${money(current, currency)}. Revisalo antes de pagar.`

    // Comparación en centavos para no depender de cómo llega el decimal
    const cents = (n: unknown) => Math.round(Number(n) * 100)
    const hasExpected = expected_total !== undefined && expected_total !== null
    if (hasExpected && cents(expected_total) !== cents(booking.total_price)) {
      return err(priceChangedMsg(Number(booking.total_price)), 409)
    }

    // Compare-and-set: solo cobra si el precio y el estado siguen siendo los que se leyeron
    const now = new Date().toISOString()
    const { data: updated, error: updateErr } = await supabase
      .from('bookings')
      .update({ payment_status: 'PAID', paid_at: now, updated_at: now })
      .eq('id', booking_id)
      .eq('payment_status', 'PENDING')
      .eq('total_price', booking.total_price)
      .select('id')

    if (updateErr) return err(`Error al marcar como pagada: ${updateErr.message}`)

    if (!updated || updated.length === 0) {
      // Algo cambió entre la lectura y el cobro: ¿se pagó en otra pestaña o cambió el precio?
      const { data: fresh } = await supabase
        .from('bookings').select('payment_status, total_price').eq('id', booking_id).single()
      if (fresh?.payment_status === 'PAID') return ok({ id: booking_id, paid: true })
      return err(priceChangedMsg(Number(fresh?.total_price ?? booking.total_price)), 409)
    }

    void notifyBookingPaid(booking as any)

    return ok({ id: booking_id, paid: true })
  } catch (e) {
    console.error('mark-paid error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
