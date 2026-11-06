'use client'

// ============================================================
// providers/auth-hydration.tsx
// Sincroniza el AuthStore con la sesión de Supabase Auth.
//
// Fix MaxListenersExceededWarning:
// Se usa un ref para garantizar que la verificación de rol
// contra profiles ocurra una sola vez por montaje, evitando
// que múltiples ciclos de onAuthStateChange acumulen listeners
// en el EventEmitter interno de @supabase/supabase-js.
// ============================================================

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export function AuthHydration({ children }: { children: React.ReactNode }) {
    const setSession = useAuthStore((s) => s._setSession)
    const setHydrated = useAuthStore((s) => s._setHydrated)
    // Evitar múltiples verificaciones de rol simultáneas (causa MaxListeners warning)
    const roleCheckDone = useRef(false)

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setSession(session)

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
                                // Roles desincronizados — refrescar JWT una sola vez
                                await supabase.auth.refreshSession()
                                // setHydrated se llama en TOKEN_REFRESHED
                                return
                            }
                        } catch {
                        // Si falla la consulta, continuar con el rol del JWT
                        }
                    }
                    setHydrated()
                }

                if (event === 'TOKEN_REFRESHED') {
                    setHydrated()
                }
            }
        )

        return () => {
            subscription.unsubscribe()
            roleCheckDone.current = false
        }
    }, [setSession, setHydrated])

    return <>{children}</>
}
