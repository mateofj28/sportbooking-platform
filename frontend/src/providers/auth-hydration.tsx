'use client'

// ============================================================
// providers/auth-hydration.tsx
// Sincroniza el AuthStore con la sesión de Supabase Auth.
//
// onAuthStateChange maneja todos los casos:
// - Carga inicial (INITIAL_SESSION)
// - Login / Logout
// - Refresco de token automático (TOKEN_REFRESHED)
// - Logout en otra pestaña (SIGNED_OUT)
// ============================================================

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export function AuthHydration({ children }: { children: React.ReactNode }) {
    const setSession = useAuthStore((s) => s._setSession)
    const setHydrated = useAuthStore((s) => s._setHydrated)

    useEffect(() => {
      // 1. Obtener la sesión existente al montar (primera carga)
      supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session)
          setHydrated()
      })

      // 2. Escuchar cambios de sesión en tiempo real
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (_event, session) => {
              setSession(session)
              // isHydrated ya está en true después del getSession inicial
          }
      )

      // Limpiar suscripción al desmontar
      return () => subscription.unsubscribe()
  }, [setSession, setHydrated])

    return <>{children}</>
}
