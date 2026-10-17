import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null as any;
    this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'SportBooking <onboarding@resend.dev>';
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  async sendPasswordReset(email: string, token: string, firstName: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    if (!this.resend) {
      console.warn('⚠️ RESEND_API_KEY no configurada. Email no enviado. Reset URL:', resetUrl);
      return;
    }

    await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: 'Restablecer tu contraseña - SportBooking',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #3B82F6, #8B5CF6); padding: 32px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">🏆 SportBooking</h1>
                    </td>
                  </tr>
                  <!-- Body -->
                  <tr>
                    <td style="padding: 32px;">
                      <h2 style="margin: 0 0 16px; font-size: 20px; color: #1a1d23;">Hola ${firstName},</h2>
                      <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #6b7280;">
                        Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz click en el botón de abajo para crear una nueva contraseña.
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center">
                            <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #3B82F6; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                              Restablecer Contraseña
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 24px 0 0; font-size: 12px; line-height: 1.5; color: #9ca3af;">
                        Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este correo.
                      </p>
                      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; font-size: 11px; color: #9ca3af; text-align: center;">
                        Si el botón no funciona, copia este enlace en tu navegador:<br>
                        <a href="${resetUrl}" style="color: #3B82F6; word-break: break-all;">${resetUrl}</a>
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 32px; background-color: #f9fafb; text-align: center;">
                      <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                        © ${new Date().getFullYear()} SportBooking. Todos los derechos reservados.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
  }

  // ---------------------------------------------------------------------------
  // Notificaciones de reservas
  // ---------------------------------------------------------------------------

  /** Datos mínimos de una reserva para los correos. */
  private bookingSummary(data: BookingEmailData): string {
    const rows: [string, string][] = [
      ['Complejo', data.venueName],
      ['Cancha', data.facilityName],
      ['Fecha', data.dateLabel],
      ['Horario', data.timeLabel],
    ];
    if (data.priceLabel) rows.push(['Total', data.priceLabel]);
    return rows
      .map(
        ([k, v]) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#9ca3af;">${k}</td>
          <td style="padding:6px 0;font-size:13px;color:#1a1d23;text-align:right;font-weight:600;">${v}</td>
        </tr>`,
      )
      .join('');
  }

  /** Envuelve el contenido en el layout de marca. No lanza: loguea si falla. */
  private async send(to: string, subject: string, heading: string, bodyHtml: string, accent = '#3B82F6') {
    if (!this.resend) {
      console.warn(`⚠️ RESEND_API_KEY no configurada. Email "${subject}" no enviado a ${to}`);
      return;
    }
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
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
                  <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} SportBooking. Todos los derechos reservados.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>`,
      });
    } catch (err) {
      console.error(`Error enviando email "${subject}" a ${to}:`, err);
    }
  }

  /** Confirmación de reserva creada. */
  async sendBookingConfirmation(data: BookingEmailData) {
    const body = `
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">
        Hola ${data.firstName}, tu reserva quedó confirmada. Estos son los detalles:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:20px;">
        ${this.bookingSummary(data)}
      </table>
      ${data.paymentPending
        ? `<p style="margin:0;font-size:13px;color:#b45309;background:#fef3c7;padding:12px;border-radius:8px;">⚠️ Tu reserva está <strong>pendiente de pago</strong>. Recordá abonar para no perder el turno.</p>`
        : `<p style="margin:0;font-size:13px;color:#047857;background:#d1fae5;padding:12px;border-radius:8px;">✅ Pago confirmado.</p>`}
    `;
    await this.send(data.email, 'Reserva confirmada - SportBooking', '¡Reserva confirmada!', body, '#10B981');
  }

  /** Aviso de cancelación de reserva. */
  async sendBookingCancellation(data: BookingEmailData & { reason?: string }) {
    const body = `
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">
        Hola ${data.firstName}, tu reserva fue cancelada. Detalles:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:20px;">
        ${this.bookingSummary(data)}
      </table>
      ${data.reason ? `<p style="margin:0;font-size:13px;color:#6b7280;">Motivo: ${data.reason}</p>` : ''}
    `;
    await this.send(data.email, 'Reserva cancelada - SportBooking', 'Reserva cancelada', body, '#EF4444');
  }

  /** Recordatorio de turno próximo. */
  async sendBookingReminder(data: BookingEmailData) {
    const body = `
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">
        Hola ${data.firstName}, te recordamos que tenés un turno próximo:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
        ${this.bookingSummary(data)}
      </table>
    `;
    await this.send(data.email, 'Recordatorio de tu turno - SportBooking', '⏰ Tu turno es pronto', body, '#3B82F6');
  }
}

/** Datos para los correos de reservas. */
export interface BookingEmailData {
  email: string;
  firstName: string;
  venueName: string;
  facilityName: string;
  dateLabel: string;
  timeLabel: string;
  priceLabel?: string;
  paymentPending?: boolean;
}
