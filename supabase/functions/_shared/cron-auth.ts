// ============================================================
// _shared/cron-auth.ts
// Autorización de las Edge Functions de cron (verify_jwt = false en config.toml).
//
// Solo las llama pg_cron (migración 060), con el header
//   Authorization: Bearer <CRON_SECRET>
// El secreto vive en Supabase Vault (lo lee pg_cron en cada corrida) y en la variable de
// entorno CRON_SECRET de las Edge Functions. No es la service_role key: si se filtrara,
// solo permite disparar estos crons, no leer ni escribir la base.
// Si falta CRON_SECRET, se rechaza todo (falla cerrado).
// ============================================================

import { corsHeaders } from './db.ts'

const encoder = new TextEncoder()

/** Comparación en tiempo constante (no revela por timing cuántos caracteres coinciden). */
function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** null si la llamada viene de pg_cron; si no, la respuesta de error a devolver. */
export function requireCron(req: Request): Response | null {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  if (secret.length < 32) {
    console.error('[cron-auth] CRON_SECRET no está configurado')
    return new Response(JSON.stringify({ data: null, error: 'Cron no configurado' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token || !timingSafeEqual(token, secret)) {
    return new Response(JSON.stringify({ data: null, error: 'No autorizado' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return null
}
