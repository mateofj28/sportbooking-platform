// mark-paid/index.ts
// Marca una reserva como pagada. Idempotente si ya está PAID.

import { createAdminClient, ok, err } from '../_shared/db.ts'
import { createBrowserClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { notifyBookingPaid } from '../_shared/notifications.ts'

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autorizado', 401)

    const userClient = createBrowserClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return err('No autorizado', 401)

    const { booking_id } = await req.json()
    if (!booking_id) return err('booking_id es requerido')

    const supabase = createAdminClient()
    const role = user.app_metadata?.role ?? 'CLIENT'

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, user_id, status, payment_status, facility:facilities!facility_id(venue_id, name, venue:venues!venue_id(id, name))')
      .eq('id', booking_id)
      .single()

    if (fetchErr || !booking) return err('Reserva no encontrada', 404)
    if (booking.status === 'CANCELLED') return err('No se puede pagar una reserva cancelada')

    // Validar scope
    if (role === 'CLIENT' && booking.user_id !== user.id) return err('No autorizado', 403)
    if (role === 'VENUE_ADMIN') {
      const myVenueId = user.app_metadata?.venue_id
      if ((booking.facility as any).venue_id !== myVenueId) return err('No autorizado', 403)
    }

    // Idempotente: si ya está PAID, devolver éxito sin re-procesar
    if (booking.payment_status === 'PAID') return ok({ id: booking_id, paid: true })

    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ payment_status: 'PAID', paid_at: now, updated_at: now })
      .eq('id', booking_id)

    if (updateErr) return err(`Error al marcar como pagada: ${updateErr.message}`)

    void notifyBookingPaid(booking as any)

    return ok({ id: booking_id, paid: true })
  } catch (e) {
    console.error('mark-paid error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
