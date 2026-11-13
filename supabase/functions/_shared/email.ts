// ============================================================
// _shared/email.ts
// Wrapper Resend para emails transaccionales.
// Best-effort: NUNCA lanza. Si falla, loguea y sigue.
// ============================================================

import { arDateLabel, arTime } from './ar-time.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'

interface BookingEmailData {
  email: string
  firstName: string
  venueName: string
  facilityName: string
  dateLabel: string
  timeLabel: string
  priceLabel?: string
  paymentPending?: boolean
  reason?: string
}

/** Arma los datos del email a partir de un booking con sus relaciones */
export function bookingToEmailData(booking: {
  user: { email: string; first_name: string }
  facility: { name: string; venue: { name: string } }
  start_datetime: string
  end_datetime: string
  total_price?: number
  currency?: string
  payment_status?: string
}): BookingEmailData | null {
  if (!booking.user?.email) return null
  return {
    email: booking.user.email,
    firstName: booking.user.first_name || '',
    venueName: booking.facility?.venue?.name || '',
    facilityName: booking.facility?.name || '',
    dateLabel: arDateLabel(booking.start_datetime),
    timeLabel: `${arTime(booking.start_datetime)} - ${arTime(booking.end_datetime)}`,
    // Billetera de puntos (043): 1 punto = 1 ARS
    priceLabel: booking.total_price != null
      ? `${Math.round(booking.total_price).toLocaleString('en-US')} puntos`
      : undefined,
    paymentPending: booking.payment_status === 'PENDING',
  }
}

async function send(
  to: string,
  subject: string,
  heading: string,
  bodyHtml: string,
  accent = '#3B82F6',
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'SportBooking <onboarding@resend.dev>'

  if (!apiKey) {
    console.warn(`⚠️  RESEND_API_KEY no configurada. Email "${subject}" no enviado a ${to}`)
    return
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:linear-gradient(135deg,${accent},#8B5CF6);padding:28px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🏆 SportBooking</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:19px;color:#1a1d23;">${heading}</h2>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f9fafb;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} SportBooking</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to, subject, html }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`Error Resend (${res.status}): ${text}`)
    }
  } catch (e) {
    console.error(`Error enviando email "${subject}" a ${to}:`, e)
  }
}

function summaryRows(data: BookingEmailData): string {
  const rows = [
    ['Complejo', data.venueName],
    ['Cancha', data.facilityName],
    ['Fecha', data.dateLabel],
    ['Horario', data.timeLabel],
  ]
  if (data.priceLabel) rows.push(['Total', data.priceLabel])
  return rows.map(([k, v]) => `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#9ca3af;">${k}</td>
      <td style="padding:6px 0;font-size:13px;color:#1a1d23;text-align:right;font-weight:600;">${v}</td>
    </tr>`).join('')
}

export async function sendBookingConfirmation(data: BookingEmailData): Promise<void> {
  const body = `
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">
      Hola ${data.firstName}, tu reserva quedó confirmada:
    </p>
    <table width="100%" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:20px;">
      ${summaryRows(data)}
    </table>
    ${data.paymentPending
    ? `<p style="margin:0;font-size:13px;color:#b45309;background:#fef3c7;padding:12px;border-radius:8px;">⚠️ Pendiente de pago. Pagala con tus puntos desde "Mis reservas" (botón Pagar) hasta 24 h antes del turno; si no, se cancela sola.</p>`
    : `<p style="margin:0;font-size:13px;color:#047857;background:#d1fae5;padding:12px;border-radius:8px;">✅ Pagada con tus puntos.</p>`
    }`
  await send(data.email, 'Reserva confirmada - SportBooking', '¡Reserva confirmada!', body, '#10B981')
}

export async function sendBookingCancellation(
  data: BookingEmailData & { reason?: string; refundedPoints?: number },
): Promise<void> {
  const refund = data.refundedPoints && data.refundedPoints > 0
    ? `<p style="margin:0 0 12px;font-size:13px;color:#047857;background:#d1fae5;padding:12px;border-radius:8px;">✅ Te devolvimos ${Math.round(data.refundedPoints).toLocaleString('en-US')} puntos a tu billetera.</p>`
    : ''
  const body = `
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">
      Hola ${data.firstName}, tu reserva fue cancelada:
    </p>
    <table width="100%" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:20px;">
      ${summaryRows(data)}
    </table>
    ${refund}
    ${data.reason ? `<p style="margin:0;font-size:13px;color:#6b7280;">Motivo: ${data.reason}</p>` : ''}`
  await send(data.email, 'Reserva cancelada - SportBooking', 'Reserva cancelada', body, '#EF4444')
}

export async function sendBookingReminder(data: BookingEmailData): Promise<void> {
  const body = `
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">
      Hola ${data.firstName}, te recordamos que tenés un turno próximo:
    </p>
    <table width="100%" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
      ${summaryRows(data)}
    </table>`
  await send(data.email, 'Recordatorio de tu turno - SportBooking', '⏰ Tu turno es pronto', body, '#3B82F6')
}

// ------------------------------------------------------------
// Cambio de precio de fechas pendientes de un turno fijo (migración 029)
// ------------------------------------------------------------

export interface PriceChangeLine {
  venueName: string
  facilityName: string
  dateLabel: string
  timeLabel: string
  oldPrice: string
  newPrice: string
  /** ISO, solo para ordenar. */
  startsAt: string
}

/** Escapa texto que viene de la base antes de meterlo en el HTML del email. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export async function sendPriceChangeNotice(data: { email: string; firstName: string; lines: PriceChangeLine[] }): Promise<void> {
  if (data.lines.length === 0) return
  const rows = data.lines.map((l) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#1a1d23;border-bottom:1px solid #f3f4f6;">
        <strong>${esc(l.dateLabel)}</strong><br>
        <span style="color:#9ca3af;">${esc(l.timeLabel)} · ${esc(l.facilityName)} · ${esc(l.venueName)}</span>
      </td>
      <td style="padding:8px 0;font-size:13px;text-align:right;white-space:nowrap;border-bottom:1px solid #f3f4f6;">
        <span style="color:#9ca3af;text-decoration:line-through;">${esc(l.oldPrice)}</span><br>
        <strong style="color:#1a1d23;">${esc(l.newPrice)}</strong>
      </td>
    </tr>`).join('')

  const plural = data.lines.length > 1
  const body = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b7280;">
      Hola ${esc(data.firstName)}, el complejo actualizó su tarifa y cambió el precio de
      ${plural ? 'estas fechas' : 'esta fecha'} de tu turno fijo, que todavía no pagaste:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${rows}
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280;background:#f3f4f6;padding:12px;border-radius:8px;">
      Las fechas que ya pagaste no cambian. Podés pagar con el nuevo precio o, si preferís,
      cancelar la fecha (hasta 24 horas antes del turno) desde <strong>Mis Reservas</strong>.
    </p>`
  await send(
    data.email,
    'Cambió el precio de tu turno fijo - SportBooking',
    'Cambió el precio de tu turno fijo',
    body,
    '#F59E0B',
  )
}
