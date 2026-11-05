'use client'

// ============================================================
// providers/auth-hydration.tsx
// Sincroniza el AuthStore con la sesión de Supabase Auth.
//
// Buena práctica Supabase: usar SOLO onAuthStateChange.
// El evento INITIAL_SESSION ya incluye la sesión inicial,
// por lo que NO hay que llamar getSession() por separado.
//
// El anti-patrón anterior era:
//   getSession().then(setSession)        ← round-trip extra
//   + onAuthStateChange(setSession)      ← puede correr antes que getSession
// Eso crea una condición de carrera: onAuthStateChange puede disparar
// SIGNED_IN antes de que getSession resuelva, dejando el store en
// estado inconsistente durante el SSR/hydration.
//
// Con INITIAL_SESSION, onAuthStateChange maneja todos los casos:
//   INITIAL_SESSION  → carga inicial (reemplaza getSession)
//   SIGNED_IN        → login
//   SIGNED_OUT       → logout / otra pestaña
//   TOKEN_REFRESHED  → refresco automático
// ============================================================

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export function AuthHydration({ children }: { children: React.ReactNode }) {
    const setSession = useAuthStore((s) => s._setSession)
    const setHydrated = useAuthStore((s) => s._setHydrated)

    useEffect(() => {
        // Un solo listener maneja la sesión inicial + todos los cambios futuros.
        // INITIAL_SESSION es el primer evento que dispara Supabase al montar.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setSession(session)
                // Marcar como hidratado en cuanto Supabase resuelve el estado inicial
                if (event === 'INITIAL_SESSION') {
                    setHydrated()
                }
            }
        )

        return () => subscription.unsubscribe()
    }, [setSession, setHydrated])

    return <>{children}</>
}
