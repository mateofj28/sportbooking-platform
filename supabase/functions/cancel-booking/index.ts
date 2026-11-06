// cancel-booking/index.ts
// Cancela una reserva. CLIENT: valida regla 24h. Admins: sin límite.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bookingToEmailData, sendBookingCancellation } from '../_shared/email.ts'
import { notifyBookingCancelled } from '../_shared/notifications.ts'

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

    const { booking_id, reason } = await req.json()
    if (!booking_id) return err('booking_id es requerido')

    const supabase = createAdminClient()

    // Obtener la reserva con relaciones
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select(`
        *, facility:facilities!facility_id(id, name, venue_id,
          venue:venues!venue_id(id, name)),
        user:profiles!user_id(id, first_name, last_name)
      `)
      .eq('id', booking_id)
      .single()

    if (fetchErr || !booking) return err('Reserva no encontrada', 404)
    if (booking.status === 'CANCELLED') return err('La reserva ya está cancelada')
    if (booking.status === 'COMPLETED') return err('No se puede cancelar una reserva completada')

    const role = user.app_metadata?.role ?? 'CLIENT'

    // Validar regla 24h para CLIENT
    if (role === 'CLIENT') {
      if (booking.user_id !== user.id) return err('No autorizado', 403)
      const LIMIT_MS = 24 * 60 * 60 * 1000
      if (new Date(booking.start_datetime).getTime() - Date.now() < LIMIT_MS) {
        return err('Solo puedes cancelar hasta 24 horas antes del inicio del turno')
      }
    } else if (role === 'VENUE_ADMIN') {
      const myVenueId = user.app_metadata?.venue_id
      if ((booking.facility as any).venue_id !== myVenueId) return err('No autorizado', 403)
    }

    // Cancelar
    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: 'CANCELLED',
        cancelled_at: now,
        cancelled_by: user.id,
        cancellation_reason: reason ?? null,
        updated_at: now,
      })
      .eq('id', booking_id)

    if (updateErr) return err(`Error al cancelar: ${updateErr.message}`)

    // Efectos secundarios (best-effort)
    const emailData = bookingToEmailData(booking as any)
    if (emailData) void sendBookingCancellation({ ...emailData, reason })
    void notifyBookingCancelled(booking as any, reason, false)

    return ok({ id: booking_id, cancelled: true })
  } catch (e) {
    console.error('cancel-booking error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
