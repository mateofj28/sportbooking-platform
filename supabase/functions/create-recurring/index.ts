// create-recurring/index.ts
// Crea un turno fijo (8 ocurrencias semanales).
//
// pay_mode (solo para un turno fijo PROPIO; el de un admin para otra persona siempre queda
// pendiente y lo paga el titular):
//   'NONE' (por defecto) -> se crean pendientes; cada fecha se paga después.
//   'NEXT'               -> se paga la próxima fecha (la primera creada).
//   'ALL'                -> se pagan todas las fechas creadas.
// El pago es TODO O NADA con el turno: si el saldo no alcanza, no se crea nada (402).

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendBookingConfirmation } from '../_shared/email.ts'
import { notifyRecurringCreated } from '../_shared/notifications.ts'
import { arMidnightUtc } from '../_shared/ar-time.ts'
import { actorFromUser, canManage } from '../_shared/permissions.ts'
import { bookingInsertProblem } from '../_shared/booking-errors.ts'
import { walletProblem } from '../_shared/wallet-errors.ts'

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
    const { facility_id, day_of_week, start_time, end_time, start_date, user_id, notes, pay_mode } = body
    if (!facility_id || day_of_week === undefined || !start_time || !end_time || !start_date) {
      return err('Faltan campos requeridos')
    }
    if (pay_mode !== undefined && !['NONE', 'NEXT', 'ALL'].includes(pay_mode)) {
      return err('Forma de pago inválida')
    }
    // Horas de reloj "HH:MM"; "24:00" o más se normaliza ("24:00" -> "00:00")
    const CLOCK = /^\d{1,2}:\d{2}$/
    if (!CLOCK.test(String(start_time)) || !CLOCK.test(String(end_time)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(start_date))) {
      return err('Formato de fecha u hora inválido')
    }
    const clock = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    const startClock = clock(start_time)
    const endClock = clock(end_time)

    const supabase = createAdminClient()
    const actor = actorFromUser(user)
    // Un admin puede crear el turno a nombre de otra persona (user_id); si no, es a nombre propio.
    const targetUserId = (actor.role !== 'CLIENT' && user_id) ? user_id : user.id
    // Solo el titular paga: el turno de un admin para otra persona queda siempre pendiente
    const payMode: 'NONE' | 'NEXT' | 'ALL' = targetUserId === user.id ? (pay_mode ?? 'NONE') : 'NONE'

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
    const [startH, startM] = startClock.split(':').map(Number)
    const [endH, endM] = endClock.split(':').map(Number)
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
        start_time: startClock,
        end_time: endClock,
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
        // Superposición concurrente, fuera de horario o bloqueo (migración 025): se saltea la fecha
        skipped.push({ date: dateLabel, reason: bookingInsertProblem(bErr).message })
      } else {
        created.push({ date: dateLabel, bookingId: booking.id })
      }
    }

    // Deshace el turno fijo recién creado (fechas pendientes, sin movimientos de créditos)
    const rollback = async () => {
      if (created.length > 0) {
        await supabase.from('bookings').delete().in('id', created.map((c) => c.bookingId)).eq('payment_status', 'PENDING')
      }
      await supabase.from('recurring_bookings').delete().eq('id', recurring.id)
    }

    // Si ninguna fecha fue creada, rollback de la recurrencia
    if (created.length === 0) {
      await rollback()
      return err(`No se pudo crear ninguna fecha: ${skipped[0]?.reason}`)
    }

    // Pago con créditos, todo o nada: si no alcanza, no queda el turno fijo creado
    let paidCount = 0
    let paidTotal = 0
    if (payMode !== 'NONE') {
      const toPay = payMode === 'ALL' ? created.map((c) => c.bookingId) : [created[0].bookingId]
      const { data: paid, error: payErr } = await (supabase.rpc as any)('pay_bookings_batch', {
        p_bookings: toPay,
        p_user: targetUserId,
      })
      if (payErr) {
        await rollback()
        const problem = walletProblem(payErr, 'No se pudo pagar el turno fijo')
        return err(problem.message, problem.status, { code: problem.code, ...problem.extra })
      }
      paidCount = Number(paid?.paidCount ?? 0)
      paidTotal = Number(paid?.total ?? 0)
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
      timeLabel: `${startClock} - ${endClock}`,
      paymentPending: paidCount < created.length,
    })

    void notifyRecurringCreated({
      venueId: (facility as any).venue_id,
      facilityName: (facility as any).name,
      clientName: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
      dayOfWeek: day_of_week,
      startTime: startClock,
      endTime: endClock,
      createdCount: created.length,
    })

    return ok({
      recurringBookingId: recurring.id,
      totalDates: created.length + skipped.length,
      createdCount: created.length,
      skippedCount: skipped.length,
      paidCount,
      paidTotal,
      created,
      skipped,
    }, 201)

  } catch (e) {
    console.error('create-recurring error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
