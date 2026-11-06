'use client'

// ============================================================
// providers/auth-hydration.tsx
// Sincroniza el AuthStore con la sesión de Supabase Auth.
//
// Problema conocido: cuando un admin asigna el rol VENUE_ADMIN
// o ADMIN a un usuario via admin-set-role, el JWT del usuario
// todavía tiene el rol viejo hasta que su sesión se refresca.
// mapSupabaseUser lee el rol desde app_metadata del JWT, así
// que si el JWT dice CLIENT pero profiles dice VENUE_ADMIN,
// el usuario ve la vista de cliente en vez del dashboard.
//
// Solución: al recibir INITIAL_SESSION, comparar el rol del JWT
// con el de profiles. Si difieren → refrescar la sesión con
// supabase.auth.refreshSession(), lo que emite TOKEN_REFRESHED
// con el JWT actualizado que incluye el rol correcto.
// ============================================================

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

export function AuthHydration({ children }: { children: React.ReactNode }) {
    const setSession = useAuthStore((s) => s._setSession)
    const setHydrated = useAuthStore((s) => s._setHydrated)

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setSession(session)

                if (event === 'INITIAL_SESSION') {
                    // Si hay sesión activa, verificar que el rol del JWT
                    // coincida con el de profiles (puede diferir si el admin
                    // cambió el rol sin que el usuario cerrara sesión).
                    if (session?.user) {
                        const jwtRole = session.user.app_metadata?.role ?? 'CLIENT'

                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('role')
                            .eq('id', session.user.id)
                            .single()

                        const profileRole = profile?.role ?? 'CLIENT'

                        if (profileRole !== jwtRole) {
                            // Roles desincronizados → refrescar para obtener JWT actualizado.
                            // refreshSession() dispara TOKEN_REFRESHED con el nuevo token.
                            await supabase.auth.refreshSession()
                            // setHydrated se llama abajo después del refresh (en TOKEN_REFRESHED)
                            return
                        }
                    }
                    setHydrated()
                }

                if (event === 'TOKEN_REFRESHED') {
                // El refresh completó — el nuevo JWT ya tiene el rol correcto.
                    setHydrated()
                }
            }
        )

        return () => subscription.unsubscribe()
    }, [setSession, setHydrated])

    return <>{children}</>
}
