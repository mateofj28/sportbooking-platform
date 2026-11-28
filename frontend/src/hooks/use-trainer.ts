'use client'

// ============================================================
// hooks/use-trainer.ts
// Entrenadores — Etapa 1 (migración 065). Todo pasa por funciones de la base: el entrenador
// no escribe tablas directo, así las reglas (franjas superpuestas, deportes, tarifa grupal,
// comisión) no se pueden saltear. Las mutaciones del entrenador devuelven su ficha completa.
// ============================================================

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { callRpc, invokeFunction } from '@/lib/supabase-helpers'
import { useAuthStore } from '@/stores/auth-store'

const TRAINER_KEY = ['trainer'] as const

export type TrainerStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED'

export interface TrainerSport {
    id: string
    name: string
    maxStudents?: number
    durations?: number[]
    classesEnabled?: boolean
}

export interface TrainerSlot {
    id: string
    /** 0 = lunes … 6 = domingo */
    dayOfWeek: number
    startTime: string
    endTime: string
    location: string
    rateIndividual: number
    rateGroup: number | null
    /** Lo define el admin general; el entrenador lo ve en solo lectura. */
    commissionPercent: number
    /** Precio final por hora que paga el cliente (tarifa + comisión). */
    finalIndividual: number
    finalGroup: number | null
    isActive: boolean
    sports: TrainerSport[]
}

export interface TrainerBlock {
    id: string
    startDate: string
    endDate: string
    reason: string | null
}

export interface TrainerPanel {
    trainerId: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    dni: string | null
    avatarUrl: string | null
    isActive: boolean
    role: string
    status: TrainerStatus
    bio: string | null
    experience: string | null
    publishedAt: string | null
    suspendedAt: string | null
    suspendedReason: string | null
    createdAt: string
    sports: TrainerSport[]
    slots: TrainerSlot[]
    blocks: TrainerBlock[]
    /** Lo que falta para publicar (vacío = puede publicar). */
    publishProblems: string[]
}

async function rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
    const { data, error } = await callRpc<T>(fn, params)
    if (error) throw new Error(error)
    return data as T
}

// ---------------------------------------------------------------
// Entrenador
// ---------------------------------------------------------------

/** Ficha propia (perfil, deportes, franjas, bloqueos, qué falta para publicar). */
export function useMyTrainerPanel() {
    const userId = useAuthStore((s) => s.user?.id)
    const isTrainer = useAuthStore((s) => s.user?.role === 'TRAINER')
    return useQuery({
        queryKey: [...TRAINER_KEY, 'panel', userId],
        enabled: !!userId && isTrainer,
        queryFn: () => rpc<TrainerPanel>('trainer_my_panel'),
    })
}

/** Mutación del entrenador: guarda en la base y deja la ficha devuelta en la caché. */
function useTrainerMutation<V>(fn: string, toParams: (v: V) => Record<string, unknown>) {
    const queryClient = useQueryClient()
    const userId = useAuthStore((s) => s.user?.id)
    return useMutation({
        mutationFn: (v: V) => rpc<TrainerPanel>(fn, toParams(v)),
        onSuccess: (panel) => {
            queryClient.setQueryData([...TRAINER_KEY, 'panel', userId], panel)
            queryClient.invalidateQueries({ queryKey: [...TRAINER_KEY, 'admin'] })
        },
    })
}

export function useSaveTrainerProfile() {
    return useTrainerMutation<{ bio: string; experience: string; sportIds: string[] }>(
        'trainer_upsert_profile',
        (v) => ({ p_bio: v.bio, p_experience: v.experience, p_sport_ids: v.sportIds }),
    )
}

export interface SlotInput {
    id: string | null
    dayOfWeek: number
    startTime: string
    endTime: string
    location: string
    rateIndividual: number
    rateGroup: number | null
    sportIds: string[]
}

export function useSaveTrainerSlot() {
    return useTrainerMutation<SlotInput>('trainer_save_slot', (v) => ({
        p_id: v.id, p_day: v.dayOfWeek, p_start: v.startTime, p_end: v.endTime, p_location: v.location,
        p_rate_individual: v.rateIndividual, p_rate_group: v.rateGroup, p_sport_ids: v.sportIds,
    }))
}

export function useDeleteTrainerSlot() {
    return useTrainerMutation<string>('trainer_delete_slot', (id) => ({ p_id: id }))
}

export function useAddTrainerBlock() {
    return useTrainerMutation<{ startDate: string; endDate: string; reason: string }>(
        'trainer_add_block',
        (v) => ({ p_start: v.startDate, p_end: v.endDate, p_reason: v.reason }),
    )
}

export function useDeleteTrainerBlock() {
    return useTrainerMutation<string>('trainer_delete_block', (id) => ({ p_id: id }))
}

export function useSetTrainerPublished() {
    return useTrainerMutation<boolean>('trainer_set_published', (publish) => ({ p_publish: publish }))
}

// ---------------------------------------------------------------
// Admin general
// ---------------------------------------------------------------

export interface AdminTrainerRow {
    trainerId: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    dni: string | null
    status: TrainerStatus
    isTrainerRole: boolean
    isActive: boolean
    createdAt: string
    sports: string[]
    slotsCount: number
    minRate: number | null
    /** Clases no canceladas (Etapa 2). */
    classesCount: number
    /** Lugares cancelados por el entrenador / por los alumnos (E20). */
    cancelledByTrainer: number
    cancelledByClients: number
}

export interface AdminTrainersPage {
    total: number
    counts: Record<'ALL' | TrainerStatus, number>
    items: AdminTrainerRow[]
}

export function useAdminTrainers(search: string, status: 'ALL' | TrainerStatus, page: number, size = 20, enabled = true) {
    return useQuery({
        enabled,
        queryKey: [...TRAINER_KEY, 'admin', 'list', search, status, page, size],
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        queryFn: () => rpc<AdminTrainersPage>('admin_trainers', { p_search: search || null, p_status: status, p_page: page, p_size: size }),
    })
}

export function useAdminTrainerDetail(trainerId: string | null) {
    return useQuery({
        queryKey: [...TRAINER_KEY, 'admin', 'detail', trainerId],
        enabled: !!trainerId,
        queryFn: () => rpc<TrainerPanel>('admin_trainer_detail', { p_trainer: trainerId }),
    })
}

function useAdminTrainerMutation<V>(fn: string, toParams: (v: V) => Record<string, unknown>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (v: V) => rpc<TrainerPanel>(fn, toParams(v)),
        onSuccess: (panel) => {
            queryClient.setQueryData([...TRAINER_KEY, 'admin', 'detail', panel.trainerId], panel)
            queryClient.invalidateQueries({ queryKey: [...TRAINER_KEY, 'admin', 'list'] })
        },
    })
}

/** Suspender (con motivo) o reactivar (vuelve a borrador). */
export function useSetTrainerStatus() {
    return useAdminTrainerMutation<{ trainerId: string; suspend: boolean; reason: string | null }>(
        'admin_set_trainer_status',
        (v) => ({ p_trainer: v.trainerId, p_suspend: v.suspend, p_reason: v.reason }),
    )
}

/** % de comisión de una franja (solo admin general). */
export function useSetSlotCommission() {
    return useAdminTrainerMutation<{ slotId: string; percent: number }>(
        'admin_set_slot_commission',
        (v) => ({ p_slot: v.slotId, p_percent: v.percent }),
    )
}

export interface NewTrainerInput {
    email: string
    password: string
    firstName: string
    lastName: string
    phone: string
    dni: string
}

/** Alta de un entrenador por el admin general (cuenta nueva con rol TRAINER, ficha en borrador). */
export function useCreateTrainer() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (v: NewTrainerInput) => {
            const { data, error } = await invokeFunction<{ id: string }>('admin-create-user', {
                email: v.email, password: v.password, first_name: v.firstName, last_name: v.lastName,
                phone: v.phone, dni: v.dni, role: 'TRAINER',
            })
            if (error) throw new Error(error)
            return data!
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [...TRAINER_KEY, 'admin'] })
            queryClient.invalidateQueries({ queryKey: ['admin-users'] })
        },
    })
}
