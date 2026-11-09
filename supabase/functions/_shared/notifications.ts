// ============================================================
// _shared/notifications.ts
// Emisores de notificaciones in-app.
// Best-effort: NUNCA lanza. Si falla, loguea y sigue.
// Usa service_role para insertar (bypass de RLS en notifications).
// ============================================================

import { createAdminClient } from './db.ts'
import { arDateLabel, arTime } from './ar-time.ts'

type NotificationType =
  | 'BOOKING_CREATED'
  | 'BOOKING_PAID'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_AUTO_CANCELLED'
  | 'RECURRING_CREATED'
  | 'NEW_CLIENT'
  | 'COMMISSION_EARNED'
  | 'VENUE_OR_FACILITY_CREATED'
  | 'USER_REGISTERED'

interface EmitInput {
  type: NotificationType
  title: string
  body: string
  venueId?: string | null
  adminOnly?: boolean
  bookingId?: string | null
  data?: Record<string, unknown>
}

/** Emite una notificación in-app. Best-effort: nunca lanza. */
export async function emit(input: EmitInput): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('notifications').insert({
      type:       input.type,
      title:      input.title,
      body:       input.body,
      venue_id:   input.venueId ?? null,
      admin_only: input.adminOnly ?? false,
      booking_id: input.bookingId ?? null,
      data:       input.data ?? null,
    })
    if (error) console.error('emit notification error:', error.message)
  } catch (e) {
    console.error('emit notification exception:', e)
  }
}

/** Datos comunes de una reserva para el campo data de la notificación */
export function bookingData(b: {
  id: string
  user?: { first_name?: string; last_name?: string }
  facility?: { name?: string; venue?: { id?: string; name?: string } }
  start_datetime: string
  end_datetime: string
  base_price?: number
  total_price?: number
  commission_amount?: number
}) {
  const clientName = `${b.user?.first_name ?? ''} ${b.user?.last_name ?? ''}`.trim() || 'Un cliente'
  return {
    bookingId: b.id,
    cliente:   clientName,
    cancha:    b.facility?.name ?? '',
    sede:      b.facility?.venue?.name ?? '',
    fecha:     arDateLabel(b.start_datetime),
    horario:   `${arTime(b.start_datetime)} - ${arTime(b.end_datetime)}`,
    base:      Number(b.base_price) || 0,
    total:     Number(b.total_price) || 0,
    comision:  Number(b.commission_amount) || 0,
  }
}

export async function notifyBookingCancelled(
  booking: Parameters<typeof bookingData>[0],
  reason?: string,
  auto = false,
): Promise<void> {
  const venueId = booking.facility?.venue?.id ?? null
  const clientName = `${booking.user?.first_name ?? ''} ${booking.user?.last_name ?? ''}`.trim() || 'Un cliente'
  await emit({
    type:      auto ? 'BOOKING_AUTO_CANCELLED' : 'BOOKING_CANCELLED',
    title:     auto ? 'Reserva cancelada por falta de pago' : 'Reserva cancelada',
    body:      auto
      ? `Se canceló automáticamente la reserva de ${clientName} en ${booking.facility?.name ?? 'una cancha'} (${arDateLabel(booking.start_datetime)}) por falta de pago.`
      : `${clientName} canceló su reserva de ${booking.facility?.name ?? 'una cancha'} (${arDateLabel(booking.start_datetime)}).${reason ? ` Motivo: ${reason}` : ''}`,
    venueId,
    bookingId: booking.id,
    data:      { ...bookingData(booking), motivo: reason ?? null, auto },
  })
}

export async function notifyCommissionEarned(venueName: string, amount: number): Promise<void> {
  await emit({
    type:      'COMMISSION_EARNED',
    title:     'Comisión generada',
    body:      `Se reconoció $${Math.round(amount).toLocaleString('es-AR')} de comisión en ${venueName}.`,
    adminOnly: true,
    data:      { sede: venueName, comision: amount },
  })
}

export async function notifyBookingPaid(booking: Parameters<typeof bookingData>[0]): Promise<void> {
  const venueId = booking.facility?.venue?.id ?? null
  const clientName = `${booking.user?.first_name ?? ''} ${booking.user?.last_name ?? ''}`.trim() || 'Un cliente'
  const data = bookingData(booking)
  await emit({
    type: 'BOOKING_PAID',
    title: 'Reserva pagada',
    body: `${clientName} pagó la reserva de ${booking.facility?.name ?? 'una cancha'} ($${Math.round(data.base).toLocaleString('es-AR')}).`,
    venueId,
    bookingId: booking.id,
    data,
  })
}

export async function notifyBookingCreated(booking: Parameters<typeof bookingData>[0]): Promise<void> {
  const venueId = booking.facility?.venue?.id ?? null
  const clientName = `${booking.user?.first_name ?? ''} ${booking.user?.last_name ?? ''}`.trim() || 'Un cliente'
  await emit({
    type: 'BOOKING_CREATED',
    title: 'Nueva reserva',
    body: `${clientName} reservó ${booking.facility?.name ?? 'una cancha'} para el ${arDateLabel(booking.start_datetime)} a las ${arTime(booking.start_datetime)}.`,
    venueId,
    bookingId: booking.id,
    data: bookingData(booking),
  })
}

const DAY_NAMES_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Turno fijo creado. dayOfWeek: 0 = lunes … 6 = domingo (igual que la tabla recurring_bookings). */
export async function notifyRecurringCreated(input: {
  venueId: string | null
  facilityName?: string
  clientName?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  createdCount: number
}): Promise<void> {
  const clientName = input.clientName?.trim() || 'Un cliente'
  const facility = input.facilityName || 'una cancha'
  const day = DAY_NAMES_ES[input.dayOfWeek] ?? ''
  await emit({
    type: 'RECURRING_CREATED',
    title: 'Nuevo turno fijo',
    body: `${clientName} creó un turno fijo en ${facility}: los ${day} de ${input.startTime} a ${input.endTime} (${input.createdCount} fechas).`,
    venueId: input.venueId,
    data: {
      cliente: clientName,
      cancha: input.facilityName ?? '',
      dia: day,
      horario: `${input.startTime} - ${input.endTime}`,
      fechas: input.createdCount,
    },
  })
}
