// cancel-recurring/index.ts
// Cancela todas las reservas futuras de un turno fijo y lo desactiva.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { actorFromUser, canManage } from '../_shared/permissions.ts'
import { normalizeCancelReason } from '../_shared/cancel-reason.ts'

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

    const { recurring_booking_id, reason: rawReason } = await req.json()
    if (!recurring_booking_id) return err('recurring_booking_id es requerido')

    // Mismo límite que Zod y que la base (migración 026); vacío -> motivo por defecto
    const parsedReason = normalizeCancelReason(rawReason)
    if (!parsedReason.ok) return err(parsedReason.error)
    const reason = parsedReason.reason

    const supabase = createAdminClient()
    const actor = actorFromUser(user)

    const { data: recurring } = await supabase
      .from('recurring_bookings')
      .select('id, user_id, facility:facilities!facility_id(venue_id)')
      .eq('id', recurring_booking_id)
      .single()

    if (!recurring) return err('Turno fijo no encontrado', 404)

    // Lo propio siempre (aun siendo admin y en cualquier complejo); lo ajeno según el rol
    if (!canManage(actor, recurring.user_id, (recurring.facility as any)?.venue_id ?? null)) {
      return err('No autorizado', 403)
    }

    const now = new Date().toISOString()

    // Cancelar reservas futuras CONFIRMED de la serie
    const { data: cancelled, error: cancelErr } = await supabase
      .from('bookings')
      .update({
        status: 'CANCELLED',
        cancelled_at: now,
        cancelled_by: user.id,
        cancellation_reason: reason ?? 'Turno fijo cancelado',
        updated_at: now,
      })
      .eq('recurring_booking_id', recurring_booking_id)
      .eq('status', 'CONFIRMED')
      .gt('start_datetime', now)
      .select('id')

    if (cancelErr) return err(`Error al cancelar: ${cancelErr.message}`)

    // Desactivar la recurrencia
    await supabase
      .from('recurring_bookings')
      .update({ is_active: false, updated_at: now })
      .eq('id', recurring_booking_id)

    return ok({ recurringBookingId: recurring_booking_id, cancelledCount: (cancelled ?? []).length })
  } catch (e) {
    console.error('cancel-recurring error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
