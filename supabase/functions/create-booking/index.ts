// ============================================================
// create-booking/index.ts
// Crea una reserva única con todas las validaciones de negocio.
// POST body: { facility_id, start_datetime, end_datetime, notes? }
// ============================================================

import { createAdminClient, ok, err } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { bookingToEmailData, sendBookingConfirmation } from '../_shared/email.ts'
import { notifyBookingCreated } from '../_shared/notifications.ts'

Deno.serve(async (req) => {
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
    const { facility_id, start_datetime, end_datetime, notes } = body
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
        user_id: user.id,
        start_datetime,
        end_datetime,
        status: 'CONFIRMED',
        payment_status: 'PAID',
        paid_at: now.toISOString(),
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
        user:profiles!user_id(id, first_name, last_name, email:id)
      `)
      .single()

    if (insertErr) return err(`Error al crear la reserva: ${insertErr.message}`)

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
