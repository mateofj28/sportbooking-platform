// ============================================================
// lib/supabase-helpers.ts
// Helpers tipados para interactuar con Supabase desde el frontend.
//
// PROPÓSITO: abstraer supabase.from/rpc/functions.invoke detrás
// de funciones con tipado fuerte, transformación de snake_case a
// camelCase, y manejo de errores consistente.
//
// BAJO ACOPLAMIENTO: si en el futuro se cambia de Supabase a otro
// backend, solo hay que tocar este archivo y los hooks se mantienen.
// ============================================================

import { supabase } from './supabase'
import type { Tables } from './supabase'

// ---- Tipos de resultado genérico ----

export interface QueryResult<T> {
  data: T | null
  error: string | null
}

export interface QueryListResult<T> {
  data: T[]
  error: string | null
}

// ---- Transformación snake_case → camelCase ----
// Supabase devuelve columnas en snake_case.
// Los tipos de la app usan camelCase (legado del NestJS anterior).
// Esta capa transforma para no romper todos los componentes existentes.

type SnakeToCamel<S extends string> =
  S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
  : S

type CamelizeKeys<T> = {
  [K in keyof T as SnakeToCamel<string & K>]: T[K] extends object
  ? CamelizeKeys<T[K]>
  : T[K]
}

/** Convierte un objeto con snake_case a camelCase de forma recursiva. */
export function camelize<T extends Record<string, unknown>>(obj: T): CamelizeKeys<T> {
  if (Array.isArray(obj)) {
    return obj.map(camelize) as unknown as CamelizeKeys<T>
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, val]) => [
        key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        val !== null && typeof val === 'object' ? camelize(val as Record<string, unknown>) : val,
      ])
    ) as CamelizeKeys<T>
  }
  return obj as unknown as CamelizeKeys<T>
}

/** Convierte un objeto con camelCase a snake_case (para enviar a Supabase). */
export function snakeize(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(snakeize)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, val]) => [
        key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
        val !== null && typeof val === 'object' ? snakeize(val) : val,
      ])
    )
  }
  return obj
}

// ---- Helpers de Supabase con manejo de errores ----

/**
 * Llama a una Edge Function de Supabase con tipado fuerte.
 * Devuelve { data, error } consistente — nunca lanza.
 */
export async function invokeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
): Promise<QueryResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, {
      body,
    })
    if (error) return { data: null, error: error.message }
    return { data, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}

/**
 * Llama a una Postgres RPC con tipado fuerte.
 * Devuelve { data, error } consistente — nunca lanza.
 */
export async function callRpc<T>(
  fn: string,
  params?: Record<string, unknown>,
): Promise<QueryResult<T>> {
  try {
    const { data, error } = await (supabase.rpc as any)(fn, params)
    if (error) return { data: null, error: error.message }
    return { data, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}

// ---- Helpers por dominio ----

/** Tipos raw de Supabase (snake_case) para bookings con relaciones */
export type BookingRow = Tables<'bookings'> & {
  facility?: (Tables<'facilities'> & {
    venue?: Pick<Tables<'venues'>, 'id' | 'name' | 'city' | 'address'>
    sport?: Pick<Tables<'sports'>, 'id' | 'name'>
    pricing?: Tables<'pricing'>[]
    schedules?: Tables<'schedules'>[]
  })
  user?: Pick<Tables<'profiles'>, 'id' | 'first_name' | 'last_name'>
}

/** Tipo raw de Supabase para notificaciones con estado de lectura */
export type NotificationRow = Tables<'notifications'> & {
  read?: boolean  // derivado de notification_reads
}

/** Tipo raw para recurring_bookings con relaciones */
export type RecurringBookingRow = Tables<'recurring_bookings'> & {
  facility?: Tables<'facilities'> & {
    sport?: Pick<Tables<'sports'>, 'id' | 'name'>
    venue?: Pick<Tables<'venues'>, 'id' | 'name' | 'city'>
  }
  bookings?: Pick<Tables<'bookings'>, 'id' | 'start_datetime' | 'end_datetime' | 'status' | 'payment_status' | 'total_price'>[]
}

/** Select string estándar para bookings con relaciones */
export const BOOKING_SELECT = `
  *,
  facility:facilities!facility_id(
    id, name, image_url, is_indoor, min_booking_duration, max_booking_duration,
    venue:venues!venue_id(id, name, city, address),
    sport:sports!sport_id(id, name),
    pricing(*),
    schedules(*)
  ),
  user:profiles!user_id(id, first_name, last_name)
` as const

/** Select string para recurring_bookings con relaciones */
export const RECURRING_BOOKING_SELECT = `
  *,
  facility:facilities!facility_id(
    id, name,
    sport:sports!sport_id(id, name),
    venue:venues!venue_id(id, name, city)
  ),
  bookings(id, start_datetime, end_datetime, status, payment_status, total_price)
` as const
