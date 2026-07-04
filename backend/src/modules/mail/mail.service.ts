import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;

  constructor(private configService: ConfigService) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'SportBooking <onboarding@resend.dev>';
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  async sendPasswordReset(email: string, token: string, firstName: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

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
}
