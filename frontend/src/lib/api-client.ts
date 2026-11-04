// ============================================================
// lib/api-client.ts — WRAPPER DE COMPATIBILIDAD
//
// Durante la migración a Supabase, algunas páginas aún usan
// apiClient.get/post/patch directamente. Este wrapper las
// redirige al backend de Supabase (Edge Functions o queries)
// sin tener que tocar cada página individualmente.
//
// TODO: migrar cada uso a supabase.from() / supabase.rpc()
// directamente y eliminar este archivo.
// ============================================================

import { supabase } from './supabase'
import type { ApiError } from '@/types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

class ApiClient {
    private async getToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token ?? null
    }

    private async handleResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
        if (response.status === 401 && typeof window !== 'undefined') {
            const currentPath = window.location.pathname
            if (currentPath !== '/login' && currentPath !== '/register') {
                await supabase.auth.signOut()
                window.location.href = '/login'
            }
        }
        const error: ApiError = await response.json().catch(() => ({
            statusCode: response.status,
            message: response.statusText,
      }))
        throw error
    }
      return response.json()
  }

    private async headers(): Promise<Record<string, string>> {
        const token = await this.getToken()
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }
    }

    /** Llama a una Edge Function de Supabase o a una RPC.
     *  Mapea los paths de NestJS a sus equivalentes en Supabase. */
    async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
      const token = await this.getToken()
      // Construir URL hacia las Edge Functions de Supabase
      const url = new URL(`${SUPABASE_URL}/functions/v1${endpoint}`)
      if (params) {
        Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v) })
    }
      const response = await fetch(url.toString(), {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    })
      return this.handleResponse<T>(response)
  }

    async post<T>(endpoint: string, body?: unknown): Promise<T> {
      const token = await this.getToken()
      const response = await fetch(`${SUPABASE_URL}/functions/v1${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    })
      return this.handleResponse<T>(response)
  }

    async patch<T>(endpoint: string, body?: unknown): Promise<T> {
      const token = await this.getToken()
      const response = await fetch(`${SUPABASE_URL}/functions/v1${endpoint}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    })
      return this.handleResponse<T>(response)
  }

    async delete<T>(endpoint: string): Promise<T> {
      const token = await this.getToken()
      const response = await fetch(`${SUPABASE_URL}/functions/v1${endpoint}`, {
          method: 'DELETE',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      return this.handleResponse<T>(response)
  }

    async upload<T>(endpoint: string, file: File, field = 'file'): Promise<T> {
        const token = await this.getToken()
        const formData = new FormData()
        formData.append(field, file)
        const response = await fetch(`${SUPABASE_URL}/functions/v1${endpoint}`, {
            method: 'POST',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: formData,
    })
      return this.handleResponse<T>(response)
  }
}

export const apiClient = new ApiClient()
