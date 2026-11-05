'use client'

// ============================================================
// hooks/use-auth.ts
// Hook de autenticación basado en Supabase Auth.
//
// Expone login, register, logout y el estado del usuario.
// Las mutaciones usan useMutation de TanStack Query para
// mantener el patrón existente (isPending, error, onSuccess).
// La navegación post-login se hace en el componente, no aquí,
// para mantener el hook sin acoplamiento al router.
// ============================================================

import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type { LoginCredentials, RegisterData } from '@/types'

export function useAuth() {
    const { user, isAuthenticated, logout: storeLogout } = useAuthStore()

    // ---- LOGIN ----
    const login = useMutation({
        mutationFn: async (credentials: LoginCredentials) => {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: credentials.email,
                password: credentials.password,
            })
            if (error) throw new Error(error.message)
            if (!data.session) throw new Error('No se pudo iniciar sesión')
            return data
        },
      // El store se actualiza automáticamente via onAuthStateChange en AuthHydration.
      // No necesitamos hacer nada aquí — el componente maneja la navegación.
  })

    // ---- REGISTER ----
    const register = useMutation({
        mutationFn: async (data: RegisterData) => {
            const { data: result, error } = await supabase.auth.signUp({
                email: data.email,
                password: data.password,
                options: {
                    // Después de confirmar el email, Supabase redirige aquí
                    emailRedirectTo: `${window.location.origin}/login`,
                    data: {
                        first_name: data.firstName,
                        last_name: data.lastName,
                        phone: data.phone,
                        dni: data.dni || null,
                    },
                },
            })
            if (error) throw new Error(error.message)
            if (!result.user) throw new Error('No se pudo crear el usuario')
            return result
        },
    })

    // ---- LOGOUT ----
    const logout = async () => {
        // 1. Cerrar sesión en Supabase (invalida el token)
        await supabase.auth.signOut()
        // 2. Limpiar el store local (onAuthStateChange también lo hace,
        //    pero esto garantiza inmediatez en la UI)
        storeLogout()
    }

    return {
        user,
        isAuthenticated,
      login,
      register,
      logout,
  }
}
