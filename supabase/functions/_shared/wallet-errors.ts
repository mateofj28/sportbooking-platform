// ============================================================
// _shared/wallet-errors.ts
// Traduce los errores de las funciones de la billetera (migración 043) a HTTP.
// Los mensajes ya vienen escritos en español desde la base; acá solo se elige el
// código HTTP y se agregan los datos útiles para la pantalla (ej. cuánto falta).
//
//   WL001 saldo insuficiente  -> 402 (+ needed / available / missing)
//   WL002 el precio cambió    -> 409 (+ total)
//   WL003 no autorizado       -> 403
//   WL004 estado inválido     -> 409
//   WL005 no encontrado       -> 404
//   WL006 dato inválido       -> 400
// Errores de la reserva (horario ocupado, fuera de horario) y "sin tarifa" también se
// traducen acá para que cada Edge Function tenga un solo punto de traducción.
// ============================================================

import { bookingInsertProblem } from './booking-errors.ts'

export interface WalletProblem {
  message: string
  status: number
  code?: string
  extra?: Record<string, unknown>
}

interface DbError {
  code?: string
  message?: string
  details?: string | null
}

const STATUS: Record<string, number> = {
  WL001: 402,
  WL002: 409,
  WL003: 403,
  WL004: 409,
  WL005: 404,
  WL006: 400,
}

const CODE_NAME: Record<string, string> = {
  WL001: 'SALDO_INSUFICIENTE',
  WL002: 'PRECIO_CAMBIO',
}

function parseDetails(details?: string | null): Record<string, unknown> | undefined {
  if (!details) return undefined
  try {
    const v = JSON.parse(details)
    return v && typeof v === 'object' ? v as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

export function walletProblem(e: DbError, fallback = 'No se pudo completar la operación'): WalletProblem {
  const code = e.code ?? ''
  if (STATUS[code]) {
    return {
      message: e.message || fallback,
      status: STATUS[code],
      code: CODE_NAME[code],
      extra: parseDetails(e.details),
    }
  }
  // Integridad de la reserva (025): horario ocupado, fuera de horario, bloqueado
  if (code === '23P01' || code === '23514') {
    const p = bookingInsertProblem(e)
    return { message: p.message, status: p.status }
  }
  // calculate_price: sin tarifa (P0004), cancha inexistente (P0002) o inactiva (P0003)
  if (code === 'P0004') return { message: 'Esa cancha no tiene tarifa para ese horario', status: 400 }
  if (code === 'P0002') return { message: 'Cancha no encontrada', status: 404 }
  if (code === 'P0003') return { message: 'La cancha no está disponible', status: 400 }

  console.error('wallet error sin traducir:', e)
  return { message: fallback, status: 500 }
}
