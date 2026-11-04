// ============================================================
// lib/supabase.ts
// Cliente Supabase tipado para el frontend (browser).
// Usa la publishable (anon) key — NUNCA la service_role key.
// El acceso a datos está controlado por RLS en la base de datos.
// ============================================================

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )
}

// Cliente singleton tipado con el schema generado de Supabase
export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)

// Re-exportar tipos útiles de Supabase para uso en la app
export type { SupabaseClient } from '@supabase/supabase-js'
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
