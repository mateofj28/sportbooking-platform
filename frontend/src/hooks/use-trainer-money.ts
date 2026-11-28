'use client'

// ============================================================
// hooks/use-trainer-money.ts
// Entrenadores — Etapa 4 (migración 069): billetera del entrenador, pagos del admin general
// y estadísticas. Mismo esquema que los complejos (use-wallet.ts): todo cuelga de ['wallet'],
// así pagar, rechazar o solicitar invalida todo junto.
// ============================================================

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { callRpc } from '@/lib/supabase-helpers'
import { toAppError } from '@/lib/error-messages'
import { useAuthStore } from '@/stores/auth-store'
import type { PayoutRequest } from '@/hooks/use-wallet'

const WALLET_KEY = ['wallet'] as const
const STALE = 60_000

async function rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const { data, error } = await callRpc<T>(fn, params)
    if (error) throw new Error(error)
    return data as T
}

export type TrainerLedgerKind = 'CLASS_CREDIT' | 'SETTLEMENT'

export interface TrainerLedgerItem {
    id: string
    kind: TrainerLedgerKind
    amount: number
    detail: string
    createdAt: string
    /** Solo para el admin general. */
    commission: number | null
    transferRef: string | null
    receiptPath: string | null
}

export interface TrainerWallet {
    trainerId: string
    /** Clases dadas − pagos recibidos. */
    pending: number
    reserved: number
    available: number
    thisMonth: number
    pendingRequest: { id: string; amount: number; requestedAt: string } | null
    requests: PayoutRequest[]
    total: number
    sumIn: number
    sumOut: number
    sumNet: number
    items: TrainerLedgerItem[]
}

export interface TrainerWalletFilters {
    from: string
    to: string
    kind: string
    page: number
    size: number
}

/** Billetera propia (entrenador) o de un entrenador (admin general, con comisión). */
export function useTrainerWallet(trainerId: string | null, f: TrainerWalletFilters, enabled = true) {
    const userId = useAuthStore((s) => s.user?.id)
    return useQuery({
        queryKey: [...WALLET_KEY, 'trainer', trainerId ?? userId, f],
        enabled,
        placeholderData: keepPreviousData,
        queryFn: () => rpc<TrainerWallet>('trainer_wallet', {
            p_trainer: trainerId, p_from: f.from || null, p_to: f.to || null, p_kind: f.kind || 'ALL',
            p_page: f.page, p_size: f.size,
        }),
    })
}

export function useRequestTrainerPayout() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (amount: number | null) => rpc<{ id: string; amount: number }>('request_trainer_payout', { p_amount: amount }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
    })
}

// ---------------------------------------------------------------
// Admin general
// ---------------------------------------------------------------

export interface TrainerBalance {
    trainerId: string
    trainerName: string
    balance: number
    reserved: number
    available: number
    earned: number
    commission: number
    lastPaidAt: string | null
}

export interface PendingTrainerPayout {
    id: string
    trainerId: string
    trainerName: string
    amount: number
    requestedAt: string
}

export interface TrainerPayment {
    id: string
    trainerId: string
    trainerName: string
    amount: number
    paidAt: string
    transferRef: string | null
    receiptPath: string | null
    requested: boolean
}

export function useAdminTrainerBalances(trainerId: string | null, page: number, size = 20) {
    return useQuery({
        queryKey: [...WALLET_KEY, 'trainer-balances', trainerId, page, size],
        staleTime: STALE,
        placeholderData: keepPreviousData,
        queryFn: () => rpc<{ total: number; items: TrainerBalance[]; totals: { balance: number; reserved: number; available: number; commission: number } }>(
            'admin_trainer_balances', { p_trainer: trainerId, p_page: page, p_size: size }),
    })
}

export function useAdminTrainerPayoutRequests(trainerId: string | null) {
    return useQuery({
        queryKey: [...WALLET_KEY, 'trainer-payout-requests', trainerId],
        staleTime: STALE,
        placeholderData: keepPreviousData,
        queryFn: () => rpc<PendingTrainerPayout[]>('admin_trainer_payout_requests', { p_trainer: trainerId }),
    })
}

export function useAdminTrainerPayments(f: { trainerId: string | null; from: string; to: string; search: string; page: number; size: number }) {
    return useQuery({
        queryKey: [...WALLET_KEY, 'trainer-payments', f],
        staleTime: STALE,
        placeholderData: keepPreviousData,
        queryFn: () => rpc<{ total: number; sumAmount: number; items: TrainerPayment[] }>('admin_trainer_payments', {
            p_trainer: f.trainerId, p_from: f.from || null, p_to: f.to || null, p_search: f.search || null,
            p_page: f.page, p_size: f.size,
        }),
    })
}

export function useRejectTrainerPayout() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
            rpc<{ id: string }>('reject_trainer_payout', { p_request: requestId, p_reason: reason }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
    })
}

/** Pagar a un entrenador (una solicitud o por cuenta propia). Comprobante en trainers/<id>/. */
export function usePayTrainer() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ trainerId, amount, requestId, transferRef, file }: {
            trainerId: string; amount: number | null; requestId: string | null; transferRef: string; file: File | null
        }) => {
            let path: string | null = null
            if (file) {
                const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
                path = `trainers/${trainerId}/${Date.now()}.${ext}`
                const { error: upErr } = await supabase.storage.from('settlement-receipts')
                    .upload(path, file, { upsert: false, contentType: file.type })
                if (upErr) throw toAppError(upErr, 'No se pudo subir el comprobante')
            }
            return rpc<{ settlement_id: string; amount: number }>('pay_trainer', {
                p_trainer: trainerId, p_amount: requestId ? null : amount, p_request: requestId,
                p_transfer_ref: transferRef.trim() || null, p_receipt_path: path,
            })
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
    })
}

// ---------------------------------------------------------------
// Estadísticas (admin general: todo; entrenador: lo suyo, sin comisión)
// ---------------------------------------------------------------

export type StatsRange = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all'

export interface TrainerStats {
    totals: {
        realizadas: number
        completadas: number
        canceladas: number
        total: number
        cancelledByTrainer: number
        cancelledByClients: number
        uniqueStudents: number
        earned: number
        commission: number | null
        revenue: number | null
    }
    bySport: { sportId: string; name: string; count: number; earned: number }[]
    byTrainer: { trainerId: string; name: string; count: number; earned: number; commission: number; cancelledByTrainer: number }[] | null
    byDay: { date: string; earned: number }[]
}

export function useTrainerStats(f: { range: StatsRange; from: string; to: string; trainerId: string | null; sportId: string | null }, enabled = true) {
    return useQuery({
        queryKey: ['trainer-stats', f],
        enabled: enabled && (f.range !== 'custom' || (!!f.from && !!f.to)),
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        queryFn: () => rpc<TrainerStats>('get_trainer_stats', {
            p_range: f.range, p_from: f.range === 'custom' ? f.from : null, p_to: f.range === 'custom' ? f.to : null,
            p_trainer: f.trainerId, p_sport: f.sportId,
        }),
    })
}
