// ============================================================
// create-booking/index.ts
// Crea una reserva única con todas las validaciones de negocio.
// POST body: { facility_id, start_datetime, end_datetime, notes?, user_id? }
//   user_id: solo para admins ("Reserva Manual" a nombre de un cliente). La reserva queda
//   PENDIENTE de pago y la paga el cliente desde su cuenta (solo el titular paga).
//   Sin user_id es una reserva propia y se registra pagada, como siempre.
// ============================================================

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bookingToEmailData, sendBookingConfirmation } from '../_shared/email.ts'
import { notifyBookingCreated } from '../_shared/notifications.ts'
import { bookingInsertProblem } from '../_shared/booking-errors.ts'
import { actorFromUser, canManage } from '../_shared/permissions.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    // 1. Autenticar al usuario que llama
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autorizado', 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return err('No autorizado', 401)

    // 2. Parsear body
    const body = await req.json()
    const { facility_id, start_datetime, end_datetime, notes, user_id } = body
    if (!facility_id || !start_datetime || !end_datetime) {
      return err('Faltan campos requeridos: facility_id, start_datetime, end_datetime')
    }

    const start = new Date(start_datetime)
    const end = new Date(end_datetime)
    const now = new Date()

    const supabase = createAdminClient()

    // 3. Validación 1: no en el pasado
    if (start <= now) return err('No se puede reservar en el pasado')

    // 4. Validación 2: end > start
    if (end <= start) return err('La hora de fin debe ser posterior a la de inicio')

    // 5. Validación 3: cancha existe y está activa
    const { data: facility, error: fErr } = await supabase
      .from('facilities')
      .select('id, is_active, min_booking_duration, max_booking_duration, venue_id, name')
      .eq('id', facility_id)
      .single()
    if (fErr || !facility) return err('Cancha no encontrada', 404)
    if (!facility.is_active) return err('La cancha no está disponible')

    // 5b. ¿A nombre de quién? Un admin puede reservar para un cliente ("Reserva Manual"):
    //     ADMIN en cualquier complejo, VENUE_ADMIN solo en el suyo. Sin user_id (o el propio)
    //     es una reserva propia, en cualquier complejo.
    const actor = actorFromUser(user)
    const forOther = typeof user_id === 'string' && user_id !== '' && user_id !== user.id
    let targetUserId = user.id
    if (forOther) {
      if (actor.role === 'CLIENT' || !canManage(actor, user_id, facility.venue_id)) {
        return err('No autorizado para reservar a nombre de otra persona', 403)
      }
      const { data: target } = await supabase
        .from('profiles').select('id, is_active').eq('id', user_id).maybeSingle()
      if (!target?.is_active) return err('Cliente no encontrado', 404)
      targetUserId = user_id
    }

    // 6. Validación 4: duración dentro de los límites
    const durationMin = Math.round((end.getTime() - start.getTime()) / 60000)
    if (durationMin < facility.min_booking_duration) {
      return err(`La duración mínima es ${facility.min_booking_duration} minutos`)
    }
    if (durationMin > facility.max_booking_duration) {
      return err(`La duración máxima es ${facility.max_booking_duration} minutos`)
    }

    // 7. Validación 5: conflicto con otra reserva CONFIRMED
    const { count: conflictCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('facility_id', facility_id)
      .eq('status', 'CONFIRMED')
      .lt('start_datetime', end_datetime)
      .gt('end_datetime', start_datetime)

    if ((conflictCount ?? 0) > 0) return err('El horario ya está reservado', 409)

    // 8. Validación 6: conflicto con blocked_slot
    const { count: blockedCount } = await supabase
      .from('blocked_slots')
      .select('id', { count: 'exact', head: true })
      .eq('facility_id', facility_id)
      .lt('start_datetime', end_datetime)
      .gt('end_datetime', start_datetime)

    if ((blockedCount ?? 0) > 0) return err('El horario está bloqueado', 409)

    // 9. Calcular precio via RPC
    const { data: priceData, error: priceErr } = await (supabase.rpc as any)(
      'calculate_price',
      { p_facility_id: facility_id, p_start_datetime: start_datetime }
    )
    if (priceErr) return err(`Sin tarifa: ${priceErr.message}`)

    // 10. Insertar la reserva
    const { data: booking, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        facility_id,
        user_id: targetUserId,
        start_datetime,
        end_datetime,
        status: 'CONFIRMED',
        // Reserva propia: se paga al crearla. Reserva manual de un admin para un cliente:
        // queda PENDIENTE y la paga el titular desde su cuenta (solo el titular paga).
        payment_status: forOther ? 'PENDING' : 'PAID',
        paid_at: forOther ? null : now.toISOString(),
        total_price: priceData.total_price,
        base_price: priceData.base_price,
        commission_amount: priceData.commission_amount,
        currency: priceData.currency ?? 'ARS',
        notes: notes ?? null,
        created_by: user.id,
      })
      .select(`
        *,
        facility:facilities!facility_id(id, name, venue:venues!venue_id(id, name)),
        user:profiles!user_id(id, first_name, last_name, email)
      `)
      .single()

    // La base es la garantía final (migración 025): superposición concurrente,
    // fuera de horario o bloqueo llegan acá como error de integridad.
    if (insertErr) {
      const problem = bookingInsertProblem(insertErr)
      return err(problem.message, problem.status)
    }

    // 11. Efectos secundarios: email + notificación (best-effort)
    const emailData = bookingToEmailData(booking as any)
    if (emailData) void sendBookingConfirmation(emailData)
    void notifyBookingCreated(booking as any)

    return ok(booking, 201)

  } catch (e) {
    console.error('create-booking error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
