// create-recurring/index.ts
// Crea un turno fijo (8 ocurrencias semanales). PENDING hasta que el cliente pague.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendBookingConfirmation } from '../_shared/email.ts'
import { notifyRecurringCreated } from '../_shared/notifications.ts'
import { arMidnightUtc } from '../_shared/ar-time.ts'
import { actorFromUser, canManage } from '../_shared/permissions.ts'

const AR_OFFSET_MIN = 3 * 60
const OCCURRENCES = 8

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

    const body = await req.json()
    const { facility_id, day_of_week, start_time, end_time, start_date, user_id, notes } = body
    if (!facility_id || day_of_week === undefined || !start_time || !end_time || !start_date) {
      return err('Faltan campos requeridos')
    }

    const supabase = createAdminClient()
    const actor = actorFromUser(user)
    // Un admin puede crear el turno a nombre de otra persona (user_id); si no, es a nombre propio.
    const targetUserId = (actor.role !== 'CLIENT' && user_id) ? user_id : user.id

    // Verificar cancha
    const { data: facility } = await supabase
      .from('facilities')
      .select('id, name, is_active, venue_id, venue:venues!venue_id(id, name)')
      .eq('id', facility_id)
      .single()
    if (!facility?.is_active) return err('Cancha no disponible', 404)
    // El alcance por complejo solo importa al reservar PARA OTRA persona. Si el turno es a nombre
    // propio (un admin reservando como cliente), puede ser en cualquier complejo.
    if (targetUserId !== user.id && !canManage(actor, targetUserId, (facility as any).venue_id ?? null)) {
      return err('No autorizado', 403)
    }

    // Calcular horarios en UTC desde hora AR
    const [startH, startM] = start_time.split(':').map(Number)
    const [endH, endM] = end_time.split(':').map(Number)
    let startMin = startH * 60 + startM
    let endMin = endH * 60 + endM
    if (endMin <= startMin) endMin += 24 * 60

    // Encontrar la primera fecha con el día de semana correcto
    const [sy, sm, sd] = start_date.split('-').map(Number)
    const base = new Date(Date.UTC(sy, sm - 1, sd))
    const arDow = (dt: Date) => ((dt.getUTCDay() + 6) % 7)
    const firstDate = new Date(base)
    for (let i = 0; i < 7 && arDow(firstDate) !== day_of_week; i++) {
      firstDate.setUTCDate(firstDate.getUTCDate() + 1)
    }

    // Generar 8 fechas
    const dates: Date[] = []
    for (let i = 0; i < OCCURRENCES; i++) {
      dates.push(new Date(firstDate.getTime() + i * 7 * 24 * 60 * 60 * 1000))
    }
    const lastDate = dates[dates.length - 1]

    // Crear entidad de recurrencia
    const { data: recurring, error: rErr } = await supabase
      .from('recurring_bookings')
      .insert({
        facility_id,
        user_id: targetUserId,
        day_of_week,
        start_time,
        end_time,
        start_date: firstDate.toISOString(),
        end_date: lastDate.toISOString(),
        created_by: user.id,
      })
      .select()
      .single()
    if (rErr) return err(`Error al crear recurrencia: ${rErr.message}`)

    // Crear reservas individuales (saltar conflictos)
    const created: { date: string; bookingId: string }[] = []
    const skipped: { date: string; reason: string }[] = []

    for (const cursor of dates) {
      const y = cursor.getUTCFullYear()
      const mo = cursor.getUTCMonth()
      const d = cursor.getUTCDate()
      const dateLabel = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

      const startDt = new Date(Date.UTC(y, mo, d, 0, startMin + AR_OFFSET_MIN))
      const endDt = new Date(Date.UTC(y, mo, d, 0, endMin + AR_OFFSET_MIN))

      // Verificar conflicto
      const { count: conflicts } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('facility_id', facility_id)
        .eq('status', 'CONFIRMED')
        .lt('start_datetime', endDt.toISOString())
        .gt('end_datetime', startDt.toISOString())

      if ((conflicts ?? 0) > 0) {
        skipped.push({ date: dateLabel, reason: 'Horario no disponible' })
        continue
      }

      // Calcular precio
      const { data: price } = await (supabase.rpc as any)('calculate_price', {
        p_facility_id: facility_id,
        p_start_datetime: startDt.toISOString(),
      })

      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .insert({
          facility_id,
          user_id: targetUserId,
          start_datetime: startDt.toISOString(),
          end_datetime: endDt.toISOString(),
          status: 'CONFIRMED',
          payment_status: 'PENDING',
          total_price: price?.total_price ?? 0,
          base_price: price?.base_price ?? 0,
          commission_amount: price?.commission_amount ?? 0,
          currency: 'ARS',
          notes: notes ?? null,
          created_by: user.id,
          recurring_booking_id: recurring.id,
        })
        .select('id')
        .single()

      if (bErr) {
        skipped.push({ date: dateLabel, reason: bErr.message })
      } else {
        created.push({ date: dateLabel, bookingId: booking.id })
      }
    }

    // Si ninguna fecha fue creada, rollback de la recurrencia
    if (created.length === 0) {
      await supabase.from('recurring_bookings').delete().eq('id', recurring.id)
      return err(`No se pudo crear ninguna fecha: ${skipped[0]?.reason}`)
    }

    // Efectos secundarios (best-effort)
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', targetUserId)
      .single()

    void sendBookingConfirmation({
      email: user.email!,
      firstName: profile?.first_name ?? '',
      venueName: (facility as any).venue?.name ?? '',
      facilityName: (facility as any).name ?? '',
      dateLabel: `Todos los días (${created.length} fechas)`,
      timeLabel: `${start_time} - ${end_time}`,
      paymentPending: true,
    })

    void notifyRecurringCreated({
      venueId: (facility as any).venue_id,
      facilityName: (facility as any).name,
      clientName: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
      dayOfWeek: day_of_week,
      startTime: start_time,
      endTime: end_time,
      createdCount: created.length,
    })

    return ok({
      recurringBookingId: recurring.id,
      totalDates: created.length + skipped.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    }, 201)

  } catch (e) {
    console.error('create-recurring error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
