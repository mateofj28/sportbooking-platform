// ============================================================
// lib/supabase.ts
// Cliente Supabase para el frontend (browser).
// Usa la publishable (anon) key — NUNCA la service_role key.
// El acceso a datos está controlado por RLS en la base de datos.
// ============================================================

import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )
}

// Cliente singleton para uso en componentes cliente ('use client')
export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Tipos de la base de datos (se irán completando a medida que se migran los hooks)
export type { SupabaseClient } from '@supabase/supabase-js'
