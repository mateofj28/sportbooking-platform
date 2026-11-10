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
//      Si el GPS dice que está en otro país, MANDA el GPS: solo publicidad nacional
//      (aunque la IP parezca argentina, ej. un chip argentino en roaming).
//   2. IP (GET /api/geo, headers de Vercel). Aproximado, sin permiso. Se usa
//      mientras el GPS responde, si el usuario no da permiso, si el GPS falla, o
//      para desempatar un punto pegado a un borde/costa dentro del país.
//   3. Ninguna -> solo publicidad nacional.
//
// El resultado se recuerda unos minutos en sessionStorage para no repetir el
// cálculo (ni el cartel de permiso) en cada navegación dentro de la sesión.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { isProvinceCode } from '@/lib/ar-provinces'
import { locate } from '@/lib/geo/province-locator'

export type LocationSource = 'gps' | 'ip' | 'none'
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown'
/** Por qué falló el último intento de GPS (para explicarlo al usuario). */
export type GpsError = 'timeout' | 'unavailable' | 'limits' | null

export interface CurrentProvince {
    /** Código ISO 3166-2:AR (ej. "AR-X") o null si no se pudo determinar / fuera del país. */
    province: string | null
    source: LocationSource
    /** true si el GPS ubicó al usuario fuera de Argentina (solo publicidad nacional). */
    abroad: boolean
    /** true cuando ya hay una primera respuesta (IP o GPS) para mostrar publicidad. */
    ready: boolean
    /** true mientras se espera el GPS (incluye el cartel de permiso). */
    locating: boolean
    permission: GeoPermission
    gpsError: GpsError
    /** Vuelve a intentar con GPS (botón "Usar mi ubicación"): espera más y pide una posición nueva. */
    retry: () => void
}

const CACHE_KEY = 'sb:current-province'
const CACHE_TTL_MS = 15 * 60 * 1000

/** Intento automático al entrar: rápido y acepta una posición reciente. */
const GPS_AUTO: PositionOptions = {
    enableHighAccuracy: false,      // la provincia no necesita precisión de metros; ahorra batería
    timeout: 10_000,
    maximumAge: 10 * 60 * 1000,     // una posición de hace <10 min sirve
}
/** Reintento manual: el usuario lo pidió, se le da más tiempo y se pide una posición nueva. */
const GPS_MANUAL: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 0,
}

interface Cached { province: string | null; source: LocationSource; abroad: boolean; at: number }

function readCache(): Cached | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const c = JSON.parse(raw) as Cached
        if (Date.now() - c.at > CACHE_TTL_MS) return null
        if (c.province !== null && !isProvinceCode(c.province)) return null
        return { ...c, abroad: !!c.abroad }
    } catch {
        return null
    }
}

function writeCache(province: string | null, source: LocationSource, abroad: boolean) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ province, source, abroad, at: Date.now() }))
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

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options))
}

export function useCurrentProvince(enabled = true): CurrentProvince {
    const [province, setProvince] = useState<string | null>(null)
    const [source, setSource] = useState<LocationSource>('none')
    const [abroad, setAbroad] = useState(false)
    const [ready, setReady] = useState(false)
    const [locating, setLocating] = useState(false)
    const [permission, setPermission] = useState<GeoPermission>('unknown')
    const [gpsError, setGpsError] = useState<GpsError>(null)
    const [attempt, setAttempt] = useState(0)
    const gpsResolved = useRef(false)

    const retry = useCallback(() => setAttempt((n) => n + 1), [])

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return
        let cancelled = false
        const isManual = attempt > 0

        const apply = (p: string | null, s: LocationSource, isAbroad = false) => {
            if (cancelled) return
            setProvince(p)
            setSource(s)
            setAbroad(isAbroad)
            setReady(true)
            writeCache(p, s, isAbroad)
        }

        // Un resultado de GPS reciente ya es lo más preciso: no repetir (salvo pedido manual)
        const cached = readCache()
        if (cached?.source === 'gps' && !isManual) {
            gpsResolved.current = true
            setProvince(cached.province)
            setSource('gps')
            setAbroad(cached.abroad)
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
            try {
                permStatus = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
                if (permStatus && !cancelled) {
                    setPermission(permStatus.state as GeoPermission)
                    permStatus.addEventListener('change', onPermChange)
                    // Si ya lo rechazó, el navegador no vuelve a preguntar: no insistir
                    if (permStatus.state === 'denied') return
                }
            } catch {
                // Safari viejo sin Permissions API: igual se intenta
            }

            setLocating(true)
            setGpsError(null)
            try {
                const pos = await getPosition(isManual ? GPS_MANUAL : GPS_AUTO)
                if (cancelled) return
                setPermission('granted')

                let found: Awaited<ReturnType<typeof locate>>
                try {
                    found = await locate(pos.coords.latitude, pos.coords.longitude)
                } catch {
                    // No se pudieron descargar los límites: queda la IP
                    if (!cancelled) setGpsError('limits')
                    return
                }
                if (cancelled) return
                gpsResolved.current = true

                if (found.province) {
                    apply(found.province, 'gps')
                } else if (found.abroad) {
                    // Otro país (ej. Colombia): manda el GPS, aunque la IP parezca argentina
                    apply(null, 'gps', true)
                } else {
                    // Pegado a un borde o costa simplificada dentro del país: desempata la IP
                    const ip = await ipPromise
                    apply(ip, ip ? 'ip' : 'gps')
                }
            } catch (e) {
                if (cancelled) return
                const code = (e as GeolocationPositionError)?.code
                if (code === 1) setPermission('denied')          // PERMISSION_DENIED
                else if (code === 3) setGpsError('timeout')       // TIMEOUT
                else setGpsError('unavailable')                   // POSITION_UNAVAILABLE u otro
                // Queda la IP (ya aplicada o por aplicarse)
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

    return { province, source, abroad, ready, locating, permission, gpsError, retry }
}
