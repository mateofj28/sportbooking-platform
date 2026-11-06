// ============================================================
// _shared/db.ts
// Cliente Supabase admin (service role) para usar en Edge Functions.
// Bypassa RLS — solo usar en el servidor, nunca en el cliente.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Headers CORS para permitir llamadas desde el frontend (Vercel). */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas')
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/** Respuesta estándar de éxito para Edge Functions */
export function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, error: null }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Respuesta estándar de error para Edge Functions */
export function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ data: null, error: { message } }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
