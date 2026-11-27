// ============================================================
// _shared/classes.ts
// Utilidades de las Edge Functions de clases con entrenadores (migración 066).
// Las reglas (horarios, cupo, 24 h, precio, devolución) están en la base; acá se
// autentica, se llama a la función SQL y se mandan los emails (best-effort).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ClassEmailData } from './email.ts'

/** Usuario del token, o null si no hay sesión válida. */
export async function authUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  return error || !user ? null : user
}

interface Person { id: string; first_name: string; last_name: string; email: string | null }

export interface ClassContext {
  id: string
  start_datetime: string
  end_datetime: string
  is_group: boolean
  capacity: number
  location: string
  sport: { name: string }
  trainer: Person
  bookings: { id: string; status: string; total_price: number; user: Person }[]
}

/** Clase con deporte, entrenador y alumnos (para la respuesta y los emails). */
export async function loadClass(supabase: SupabaseClient, classId: string): Promise<ClassContext | null> {
  const { data } = await supabase
    .from('trainer_classes')
    .select(`id, start_datetime, end_datetime, is_group, capacity, location,
      sport:sports!sport_id(name),
      trainer:trainers!trainer_id(profile:profiles!user_id(id, first_name, last_name, email)),
      bookings:class_bookings(id, status, total_price, user:profiles!user_id(id, first_name, last_name, email))`)
    .eq('id', classId)
    .maybeSingle()
  if (!data) return null
  // trainer_classes -> trainers -> profiles: se aplana para usarlo como persona
  const row = data as unknown as Omit<ClassContext, 'trainer'> & { trainer: { profile: Person } }
  return { ...row, trainer: row.trainer?.profile } as ClassContext
}

export const fullName = (p?: Person | null) => `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()

/** Datos del email para una persona (alumno o entrenador). */
export function classEmail(c: ClassContext, to: Person, total?: number): ClassEmailData | null {
  if (!to?.email) return null
  return {
    email: to.email,
    firstName: to.first_name ?? '',
    sportName: c.sport?.name ?? 'Clase',
    trainerName: fullName(c.trainer),
    location: c.location,
    start: c.start_datetime,
    end: c.end_datetime,
    isGroup: c.is_group,
    total,
  }
}

export const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'la canceló el alumno',
  TRAINER: 'la canceló el entrenador',
  ADMIN: 'la canceló la administración',
  SYSTEM: 'cancelada automáticamente',
}
