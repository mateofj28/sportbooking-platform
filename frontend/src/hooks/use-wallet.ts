'use client'

// ============================================================
// hooks/use-wallet.ts
// Billetera de créditos (migración 043). Lecturas por RPC (paginadas en el servidor) y
// las dos acciones del admin general (ajustar créditos, liquidar un mes). Pagar, reservar y
// cancelar siguen en use-bookings (Edge Functions) e invalidan la key ['wallet'].
// ============================================================

import { useEffect, useId } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { callRpc } from '@/lib/supabase-helpers'
import { toAppError } from '@/lib/error-messages'
import { useAuthStore } from '@/stores/auth-store'
import type { VenueLedgerKind, WalletTxKind } from '@/lib/points'

const WALLET_KEY = ['wallet'] as const

export interface Page<T> { total: number; items: T[] }

export interface HistoryFilters {
  /** "YYYY-MM-DD" (día AR) o "" */
  from: string
  to: string
  kind: string
  page: number
  size: number
}

export interface WalletTx {
  id: string
  kind: WalletTxKind
  amount: number
  balanceAfter: number
  detail: string
  reason: string | null
  bookingId: string | null
  createdAt: string
}

export interface VenueLedgerItem {
  id: string
  kind: VenueLedgerKind
  amount: number
  period: string
  detail: string
  createdAt: string
  /** Solo para el admin general. */
  commission: number | null
  transferRef: string | null
  receiptPath: string | null
}

export interface PointsUser {
  id: string
  firstName: string
  lastName: string
  email: string | null
  dni: string | null
  role: string
  balance: number
  spent: number
}

export interface GlobalHistoryItem {
  id: string
  kind: 'TOPUP' | 'ADJUSTMENT' | 'SETTLEMENT'
  amount: number
  detail: string
  reason: string | null
  userId: string | null
  venueId: string | null
  transferRef: string | null
  receiptPath: string | null
  createdAt: string
}

export type PayoutStatus = 'PENDING' | 'PAID' | 'REJECTED'

/** Solicitud de pago de un complejo (migración 045). */
export interface PayoutRequest {
  id: string
  amount: number
  status: PayoutStatus
  requestedAt: string
  resolvedAt: string | null
  rejectReason: string | null
}

/** Saldo de un complejo (Balances). */
export interface VenueBalance {
  venueId: string
  venueName: string
  /** Turnos jugados − pagos recibidos. */
  balance: number
  /** Monto de la solicitud pendiente. */
  reserved: number
  /** balance − reserved: lo que se puede pagar sin solicitud. */
  available: number
  earned: number
  commission: number
  lastPaidAt: string | null
}

export interface PendingPayoutRequest {
  id: string
  venueId: string
  venueName: string
  amount: number
  requestedAt: string
  requestedBy: string
}

export interface VenuePayment {
  id: string
  venueId: string
  venueName: string
  amount: number
  paidAt: string
  transferRef: string | null
  receiptPath: string | null
  /** true si se pagó a partir de una solicitud del complejo. */
  requested: boolean
}

export interface Balances {
  collected: number
  inWallets: number
  spentPlayed: number
  spentNotPlayed: number
  commission: number
  paidToVenues: number
  pendingToVenues: number
  requestedByVenues: number
  balanced: boolean
  venues: VenueBalance[]
  requests: PendingPayoutRequest[]
  payments: VenuePayment[]
}

export interface VenueWallet extends Page<VenueLedgerItem> {
  venueId: string
  /** Saldo sin cobrar (turnos jugados − pagos). */
  pending: number
  reserved: number
  available: number
  thisMonth: number
  pendingRequest: { id: string; amount: number; requestedAt: string } | null
  requests: PayoutRequest[]
}

function filterParams(f: HistoryFilters) {
  return {
    p_from: f.from || null,
    p_to: f.to || null,
    p_kind: f.kind || 'ALL',
    p_page: f.page,
    p_size: f.size,
  }
}

async function rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await callRpc<T>(fn, params)
  if (error) throw new Error(error)
  return data as T
}

// ---------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------

/** Saldo propio. Se actualiza solo (Realtime sobre `wallets`). */
export function useMyBalance() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  // Un canal por componente: si dos componentes de la misma pantalla (navbar y reserva)
  // usaran el mismo nombre, supabase-js devuelve el canal ya suscripto y agregarle
  // listeners rompe la pantalla ("cannot add postgres_changes callbacks after subscribe").
  const instanceId = useId()

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`wallet-${userId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId, queryClient, instanceId])

  return useQuery({
    queryKey: [...WALLET_KEY, 'balance', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any)
        .from('wallets').select('balance').eq('user_id', userId).maybeSingle()
      if (error) throw toAppError(error)
      return Number(data?.balance ?? 0)
    },
  })
}

export function useMyWalletHistory(filters: HistoryFilters) {
  const userId = useAuthStore((s) => s.user?.id)
  return useQuery({
    queryKey: [...WALLET_KEY, 'history', userId, filters],
    enabled: !!userId,
    placeholderData: keepPreviousData,
    queryFn: () => rpc<Page<WalletTx> & { balance: number }>('my_wallet_history', filterParams(filters)),
  })
}

// ---------------------------------------------------------------
// Admin de sede (y admin general mirando una sede)
// ---------------------------------------------------------------

export function useVenueWallet(venueId: string | null, filters: HistoryFilters, enabled = true) {
  return useQuery({
    queryKey: [...WALLET_KEY, 'venue', venueId, filters],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: () => rpc<VenueWallet>('venue_wallet', { p_venue: venueId, ...filterParams(filters) }),
  })
}

// ---------------------------------------------------------------
// Admin general
// ---------------------------------------------------------------

export function useAdminPointsUsers(search: string, page: number, size = 20) {
  return useQuery({
    queryKey: [...WALLET_KEY, 'admin-users', search, page, size],
    placeholderData: keepPreviousData,
    queryFn: () => rpc<Page<PointsUser>>('admin_points_users', { p_search: search || null, p_page: page, p_size: size }),
  })
}

export function useAdminWalletHistory(filters: HistoryFilters & { userId?: string | null; venueId?: string | null }) {
  return useQuery({
    queryKey: [...WALLET_KEY, 'admin-history', filters],
    placeholderData: keepPreviousData,
    queryFn: () => rpc<Page<GlobalHistoryItem> & { sumIn: number; sumOut: number; sumNet: number }>('admin_wallet_history', {
      ...filterParams(filters), p_user: filters.userId ?? null, p_venue: filters.venueId ?? null,
    }),
  })
}

export function useAdminBalances() {
  return useQuery({
    queryKey: [...WALLET_KEY, 'balances'],
    queryFn: () => rpc<Balances>('admin_balances'),
  })
}

/** Sumar (recarga) o restar (ajuste) créditos a un usuario, con motivo obligatorio. */
export function useAdjustPoints() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, amount, reason }: { userId: string; amount: number; reason: string }) =>
      rpc<{ balance: number }>('wallet_admin_adjust', { p_user: userId, p_amount: amount, p_reason: reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
  })
}

const RECEIPTS_BUCKET = 'settlement-receipts'

/** Admin de sede: solicitar el pago. amount null = todo lo disponible. */
export function useRequestPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (amount: number | null) => rpc<{ id: string; amount: number }>('request_venue_payout', { p_amount: amount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
  })
}

/** Admin general: rechazar una solicitud con motivo (el monto vuelve al disponible). */
export function useRejectPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      rpc<{ id: string }>('reject_venue_payout', { p_request: requestId, p_reason: reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
  })
}

/**
 * Admin general: pagar a un complejo. Con requestId paga esa solicitud (monto fijo);
 * sin requestId paga por su cuenta (amount null = todo lo disponible). Sube el comprobante si hay.
 */
export function usePayVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ venueId, amount, requestId, transferRef, file }: {
      venueId: string; amount: number | null; requestId: string | null; transferRef: string; file: File | null
    }) => {
      let path: string | null = null
      if (file) {
        const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
        path = `${venueId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from(RECEIPTS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type })
        if (upErr) throw toAppError(upErr, 'No se pudo subir el comprobante')
      }
      return rpc<{ settlement_id: string; amount: number }>('pay_venue', {
        p_venue: venueId, p_amount: requestId ? null : amount, p_request: requestId,
        p_transfer_ref: transferRef.trim() || null, p_receipt_path: path,
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
  })
}
/** URL temporal (5 min) para ver un comprobante privado. */
export async function getReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 300)
  if (error || !data) throw toAppError(error, 'No se pudo abrir el comprobante')
  return data.signedUrl
}
