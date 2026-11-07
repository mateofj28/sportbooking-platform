// ============================================================
// stores/auth-store.ts
// Estado global de autenticación basado en Supabase Auth.
//
// Cambios respecto al sistema anterior (NestJS + JWT manual):
// - Ya no se guarda el token en localStorage (Supabase lo gestiona en cookies).
// - isHydrated se resuelve cuando Supabase termina de verificar la sesión.
// - El store se sincroniza automáticamente via onAuthStateChange.
// - role y venueId se leen desde app_metadata del JWT de Supabase.
// ============================================================

import { create } from 'zustand'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'

export type AppRole = 'CLIENT' | 'ADMIN' | 'VENUE_ADMIN'

// Tipo del usuario de la app (derivado del JWT de Supabase)
export interface AppUser {
    id: string
    email: string
    firstName: string
    lastName: string
    role: AppRole
    venueId: string | null
    avatarUrl: string | null
    phone?: string | null
}

interface AuthState {
    user: AppUser | null
    session: Session | null
    isAuthenticated: boolean
    isHydrated: boolean        // true cuando Supabase terminó de resolver la sesión inicial

    // Acciones — solo las usa AuthHydration, no los componentes directamente
    _setSession: (session: Session | null) => void
    _setHydrated: () => void
    // Acción atómica: setSession + setHydrated en un solo set() → un solo re-render
    _setSessionAndHydrate: (session: Session | null) => void
    _updateUser: (partial: Partial<AppUser>) => void
    logout: () => void
}

/** Extrae los datos del usuario de la app desde el user de Supabase */
export function mapSupabaseUser(supabaseUser: SupabaseUser | null): AppUser | null {
    if (!supabaseUser) return null

    const meta = supabaseUser.app_metadata ?? {}
    const userMeta = supabaseUser.user_metadata ?? {}

    return {
        id: supabaseUser.id,
        email: supabaseUser.email ?? '',
        // Puede venir de app_metadata (si se seteó con set_user_role)
        // o de user_metadata (si es recién registrado)
        firstName: userMeta.first_name ?? userMeta.firstName ?? '',
        lastName: userMeta.last_name ?? userMeta.lastName ?? '',
        role: (meta.role ?? 'CLIENT') as AppRole,
        venueId: meta.venue_id ?? null,
        avatarUrl: userMeta.avatar_url ?? null,
    }
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    session: null,
    isAuthenticated: false,
    isHydrated: false,

    _setSession: (session) => {
        set({
            session,
            user: mapSupabaseUser(session?.user ?? null),
            isAuthenticated: !!session,
        })
    },

    _setHydrated: () => set({ isHydrated: true }),

    // Acción atómica — un solo set() en vez de _setSession + _setHydrated separados.
    // Reduce de 2 renders a 1 en el flujo feliz de AuthHydration.
    _setSessionAndHydrate: (session) => {
        set({
            session,
            user: mapSupabaseUser(session?.user ?? null),
            isAuthenticated: !!session,
            isHydrated: true,
        })
    },

    _updateUser: (partial) => {
        const current = get().user
        if (current) set({ user: { ...current, ...partial } })
    },

    // logout solo actualiza el store — el signOut real se hace en use-auth.ts
    logout: () => set({
        user: null,
        session: null,
        isAuthenticated: false,
    }),
}))
