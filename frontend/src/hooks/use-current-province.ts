'use client'

// ============================================================
// hooks/use-current-province.ts
//
// Provincia en la que está el usuario AHORA, para elegir la publicidad.
// No usa el perfil: alguien de Buenos Aires que hoy está en Córdoba ve la de Córdoba.
//
// Orden de precisión:
//   1. GPS del navegador (pide permiso). Exacto. Las coordenadas se convierten a
//      provincia en el dispositivo (lib/geo/province-locator.ts) y no se envían.
//   2. IP (GET /api/geo, headers de Vercel). Aproximado, sin permiso. Se usa
//      mientras el GPS responde, o si el usuario no da permiso.
//   3. Ninguna -> solo publicidad nacional.
//
// El resultado se recuerda unos minutos en sessionStorage para no repetir el
// cálculo (ni el cartel de permiso) en cada navegación dentro de la sesión.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { isProvinceCode } from '@/lib/ar-provinces'
import { provinceAt } from '@/lib/geo/province-locator'

export type LocationSource = 'gps' | 'ip' | 'none'
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown'

export interface CurrentProvince {
    /** Código ISO 3166-2:AR (ej. "AR-X") o null si no se pudo determinar / fuera del país. */
    province: string | null
    source: LocationSource
    /** true cuando ya hay una primera respuesta (IP o GPS) para mostrar publicidad. */
    ready: boolean
    /** true mientras se espera el GPS (incluye el cartel de permiso). */
    locating: boolean
    permission: GeoPermission
    /** Vuelve a intentar con GPS (ej. botón "Usar mi ubicación"). */
    retry: () => void
}

const CACHE_KEY = 'sb:current-province'
const CACHE_TTL_MS = 15 * 60 * 1000
const GPS_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,      // la provincia no necesita precisión de metros; ahorra batería
    timeout: 10_000,
    maximumAge: 10 * 60 * 1000,     // una posición de hace <10 min sirve
}

interface Cached { province: string | null; source: LocationSource; at: number }

function readCache(): Cached | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const c = JSON.parse(raw) as Cached
        if (Date.now() - c.at > CACHE_TTL_MS) return null
        if (c.province !== null && !isProvinceCode(c.province)) return null
        return c
    } catch {
        return null
    }
}

function writeCache(province: string | null, source: LocationSource) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ province, source, at: Date.now() }))
    } catch {
        // modo privado / storage lleno: no es crítico
    }
}

async function fetchIpProvince(): Promise<string | null> {
    try {
        const res = await fetch('/api/geo', { cache: 'no-store' })
        if (!res.ok) return null
        const body = (await res.json()) as { province?: unknown }
        return isProvinceCode(body.province) ? body.province : null
    } catch {
        return null
    }
}

function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, GPS_OPTIONS))
}

export function useCurrentProvince(enabled = true): CurrentProvince {
    const [province, setProvince] = useState<string | null>(null)
    const [source, setSource] = useState<LocationSource>('none')
    const [ready, setReady] = useState(false)
    const [locating, setLocating] = useState(false)
    const [permission, setPermission] = useState<GeoPermission>('unknown')
    const [attempt, setAttempt] = useState(0)
    const gpsResolved = useRef(false)

    const retry = useCallback(() => setAttempt((n) => n + 1), [])

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return
        let cancelled = false
        const isRetry = attempt > 0

        const apply = (p: string | null, s: LocationSource) => {
            if (cancelled) return
            setProvince(p)
            setSource(s)
            setReady(true)
            writeCache(p, s)
        }

        // Un resultado de GPS reciente ya es lo más preciso: no repetir (salvo reintento manual)
        const cached = readCache()
        if (cached?.source === 'gps' && !isRetry) {
            gpsResolved.current = true
            setProvince(cached.province)
            setSource('gps')
            setReady(true)
            return
        }
        gpsResolved.current = false

        // 1. IP: rápida, sin permiso. Solo se aplica si el GPS todavía no respondió.
        const ipPromise = cached?.source === 'ip' ? Promise.resolve(cached.province) : fetchIpProvince()
        ipPromise.then((p) => {
            if (!gpsResolved.current) apply(p, p ? 'ip' : 'none')
        })

        // 2. GPS: exacto. Si el navegador no lo soporta, queda la IP.
        if (!('geolocation' in navigator)) {
            setPermission('unsupported')
            return () => { cancelled = true }
        }

        let permStatus: PermissionStatus | null = null
        const onPermChange = () => {
            if (!permStatus) return
            setPermission(permStatus.state as GeoPermission)
            // Si lo habilita desde la configuración del navegador, volver a intentar
            if (permStatus.state === 'granted' && !gpsResolved.current) retry()
        }

        const runGps = async () => {
            // Si ya lo rechazó, el navegador no vuelve a preguntar: no insistir
            try {
                permStatus = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
                if (permStatus && !cancelled) {
                    setPermission(permStatus.state as GeoPermission)
                    permStatus.addEventListener('change', onPermChange)
                    if (permStatus.state === 'denied') return
                }
            } catch {
                // Safari viejo sin Permissions API: igual se intenta
            }

            setLocating(true)
            try {
                const pos = await getPosition()
                if (cancelled) return
                setPermission('granted')
                const p = await provinceAt(pos.coords.latitude, pos.coords.longitude)
                if (cancelled) return
                if (p) {
                    gpsResolved.current = true
                    apply(p, 'gps')
                } else {
                    // El punto no cae en ninguna provincia: o está fuera del país (y la IP
                    // tampoco será argentina -> solo nacional), o justo sobre un borde/costa
                    // simplificado dentro del país (la IP da la provincia aproximada).
                    const ip = await ipPromise
                    gpsResolved.current = true
                    apply(ip, ip ? 'ip' : 'none')
                }
            } catch (e) {
                const err = e as GeolocationPositionError
                if (err?.code === 1 /* PERMISSION_DENIED */ && !cancelled) setPermission('denied')
                // Timeout / no disponible / error cargando límites: queda la IP
            } finally {
                if (!cancelled) setLocating(false)
            }
        }
        void runGps()

        return () => {
            cancelled = true
            permStatus?.removeEventListener('change', onPermChange)
        }
    }, [enabled, attempt, retry])

    return { province, source, ready, locating, permission, retry }
}
