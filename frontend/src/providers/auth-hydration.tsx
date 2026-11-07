'use client'

// ============================================================
// providers/auth-hydration.tsx
// Sincroniza el AuthStore con la sesión de Supabase Auth.
//
// Fix parpadeo del Navbar:
// - Flujo normal: _setSessionAndHydrate() en un solo set() atómico
//   → 1 re-render en vez de 2 (_setSession + _setHydrated separados)
// - Flujo con refresh: _setSession() + _setHydrated() separados (necesario
//   porque el refresh es asíncrono y ocurre entre los dos eventos)
// - roleCheckDone ref: evita múltiples verificaciones de rol
// ============================================================

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export function AuthHydration({ children }: { children: React.ReactNode }) {
    const setSession = useAuthStore((s) => s._setSession)
    const setHydrated = useAuthStore((s) => s._setHydrated)
    const setSessionAndHydrate = useAuthStore((s) => s._setSessionAndHydrate)
    const roleCheckDone = useRef(false)

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'INITIAL_SESSION') {
                    if (session?.user && !roleCheckDone.current) {
                        roleCheckDone.current = true
                        const jwtRole = session.user.app_metadata?.role ?? 'CLIENT'

                        try {
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('role')
                                .eq('id', session.user.id)
                                .single()

                            const profileRole = profile?.role ?? 'CLIENT'

                            if (profileRole !== jwtRole) {
                                // Roles desincronizados: primero actualizamos la sesión,
                                // luego refresheamos (TOKEN_REFRESHED llamará setSessionAndHydrate)
                                setSession(session)
                                await supabase.auth.refreshSession()
                                return
                            }
                        } catch {
                            // Si falla la consulta, continuar con el rol del JWT
                        }
                    }
                    // Flujo normal: una sola escritura atómica al store → 1 re-render
                    setSessionAndHydrate(session)
                    return
                }

                if (event === 'TOKEN_REFRESHED') {
                    // El refresh completó — JWT actualizado con rol correcto
                    setSessionAndHydrate(session)
                    return
                }

                // SIGNED_IN, SIGNED_OUT, etc.
                setSession(session)
                if (event === 'SIGNED_OUT') {
                    setHydrated()
                }
            }
        )

        return () => {
            subscription.unsubscribe()
            roleCheckDone.current = false
        }
    }, [setSession, setHydrated, setSessionAndHydrate])

    return <>{children}</>
}
