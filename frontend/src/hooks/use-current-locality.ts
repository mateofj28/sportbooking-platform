'use client'

// ============================================================
// hooks/use-current-locality.ts
//
// Localidad (municipio) en la que está el usuario AHORA, para elegir la publicidad.
// No usa el perfil: alguien de La Plata que hoy está en Rosario ve la de Rosario.
//
// Dos fuentes, en este orden:
//   1. El municipio que el usuario ELIGIÓ a mano ("¿Dónde querés jugar?"). Sirve cuando el
//      GPS no la da (fuera de Argentina, sin permiso, zona rural) o cuando quiere ver otra.
//      Se recuerda en localStorage hasta que la cambie o toque "Buscar cerca de mí".
//      Con un municipio elegido no se pide el GPS.
//   2. El GPS del navegador (pide permiso). Las coordenadas se convierten a localidad en
//      el dispositivo (lib/geo/locality-locator.ts) y no se envían: a la base solo viaja
//      el código de la localidad.
//
// Sin ninguna de las dos no hay municipio, y entonces se muestran solo las nacionales.
// (La IP solo da una provincia aproximada: no sirve para publicidad municipal.)
//
// El resultado del GPS se recuerda unos minutos en sessionStorage para no repetir el
// cálculo (ni el cartel de permiso) en cada navegación dentro de la sesión.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { isLocalityCode, locateLocality, type LocalityInfo } from '@/lib/geo/locality-locator'
import { isProvinceCode } from '@/lib/ar-provinces'

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown'
/** Por qué falló el último intento de GPS (para explicarlo al usuario). */
export type GpsError = 'timeout' | 'unavailable' | 'limits' | null

export interface CurrentLocality {
    /** Localidad elegida o detectada, o null si no hay. */
    locality: LocalityInfo | null
    /** Provincia (ISO), aunque no esté dentro de una localidad (zona rural). */
    province: string | null
    /** true si hay resultado (GPS respondió o el usuario eligió un municipio). */
    located: boolean
    /** true si el GPS lo ubicó fuera de Argentina (y no eligió un municipio). */
    abroad: boolean
    /** true si la localidad la eligió el usuario a mano. */
    manual: boolean
    /** Siempre true enseguida: mientras no hay GPS se muestran las nacionales. */
    ready: boolean
    /** true mientras se espera el GPS (incluye el cartel de permiso). */
    locating: boolean
    permission: GeoPermission
    gpsError: GpsError
    /** Vuelve a intentar con el GPS: espera más y pide una posición nueva. */
    retry: () => void
    /** Elige un municipio a mano (deja de usar el GPS). */
    choose: (locality: LocalityInfo) => void
    /** Olvida el municipio elegido y busca con el GPS ("Buscar cerca de mí"). */
    locateMe: () => void
}

const CACHE_KEY = 'sb:current-locality'
const CHOSEN_KEY = 'sb:chosen-locality'
const CACHE_TTL_MS = 15 * 60 * 1000

/** Intento automático al entrar: rápido y acepta una posición reciente. */
const GPS_AUTO: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60 * 1000 }
/** Reintento manual: más tiempo, más precisión y una posición nueva. */
const GPS_MANUAL: PositionOptions = { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }

interface Cached { locality: LocalityInfo | null; province: string | null; abroad: boolean; at: number }

function readCache(): Cached | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const c = JSON.parse(raw) as Cached
        if (Date.now() - c.at > CACHE_TTL_MS) return null
        if (c.locality && !isLocalityCode(c.locality.code)) return null
        if (c.province !== null && !isProvinceCode(c.province)) return null
        return { ...c, abroad: !!c.abroad }
    } catch {
        return null
    }
}

function writeCache(v: Omit<Cached, 'at'>) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...v, at: Date.now() }))
    } catch {
        // modo privado / storage lleno: no es crítico
    }
}

/** Municipio elegido a mano (validada: lo que hay en localStorage no es confiable). */
function readChosen(): LocalityInfo | null {
    try {
        const raw = localStorage.getItem(CHOSEN_KEY)
        if (!raw) return null
        const c = JSON.parse(raw) as Partial<LocalityInfo>
        if (!isLocalityCode(c.code) || !isProvinceCode(c.province) || typeof c.name !== 'string') return null
        return { code: c.code, name: c.name, category: typeof c.category === 'string' ? c.category : '', province: c.province }
    } catch {
        return null
    }
}

function writeChosen(v: LocalityInfo | null) {
    try {
        if (v) localStorage.setItem(CHOSEN_KEY, JSON.stringify(v))
        else localStorage.removeItem(CHOSEN_KEY)
    } catch {
        // no es crítico
    }
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options))
}

export function useCurrentLocality(enabled = true): CurrentLocality {
    const [locality, setLocality] = useState<LocalityInfo | null>(null)
    const [province, setProvince] = useState<string | null>(null)
    const [located, setLocated] = useState(false)
    const [abroad, setAbroad] = useState(false)
    const [locating, setLocating] = useState(false)
    const [permission, setPermission] = useState<GeoPermission>('unknown')
    const [gpsError, setGpsError] = useState<GpsError>(null)
    const [attempt, setAttempt] = useState(0)
    // undefined = todavía no se leyó localStorage (evita pedir el GPS antes de saberlo)
    const [chosen, setChosen] = useState<LocalityInfo | null | undefined>(undefined)
    const resolved = useRef(false)

    const retry = useCallback(() => setAttempt((n) => n + 1), [])

    const choose = useCallback((l: LocalityInfo) => {
        writeChosen(l)
        setChosen(l)
    }, [])

    const locateMe = useCallback(() => {
        writeChosen(null)
        setChosen(null)
        setAttempt((n) => n + 1)
    }, [])

    useEffect(() => {
        if (typeof window !== 'undefined') setChosen(readChosen())
    }, [])

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return
        // Con un municipio elegido (o sin haber leído todavía si la hay) no se usa el GPS
        if (chosen !== null) {
            setLocating(false)
            return
        }
        let cancelled = false
        const isManual = attempt > 0

        // Un resultado reciente de GPS ya es lo más preciso: no repetir (salvo pedido manual)
        const cached = readCache()
        if (cached && !isManual) {
            resolved.current = true
            setLocality(cached.locality)
            setProvince(cached.province)
            setAbroad(cached.abroad)
            setLocated(true)
            return
        }
        resolved.current = false

        if (!('geolocation' in navigator)) {
            setPermission('unsupported')
            return
        }

        let permStatus: PermissionStatus | null = null
        const onPermChange = () => {
            if (!permStatus) return
            setPermission(permStatus.state as GeoPermission)
            // Si lo habilita desde la configuración del navegador, volver a intentar
            if (permStatus.state === 'granted' && !resolved.current) retry()
        }

        const run = async () => {
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

                let found: Awaited<ReturnType<typeof locateLocality>>
                try {
                    found = await locateLocality(pos.coords.latitude, pos.coords.longitude)
                } catch {
                    if (!cancelled) setGpsError('limits') // no se pudieron descargar los límites
                    return
                }
                if (cancelled) return
                resolved.current = true
                setLocality(found.locality)
                setProvince(found.province)
                setAbroad(found.abroad)
                setLocated(true)
                writeCache({ locality: found.locality, province: found.province, abroad: found.abroad })
            } catch (e) {
                if (cancelled) return
                const code = (e as GeolocationPositionError)?.code
                if (code === 1) setPermission('denied')        // PERMISSION_DENIED
                else if (code === 3) setGpsError('timeout')     // TIMEOUT
                else setGpsError('unavailable')                 // POSITION_UNAVAILABLE u otro
            } finally {
                if (!cancelled) setLocating(false)
            }
        }
        void run()

        return () => {
            cancelled = true
            permStatus?.removeEventListener('change', onPermChange)
        }
    }, [enabled, attempt, retry, chosen])

    if (chosen) {
        return {
            locality: chosen, province: chosen.province, located: true, abroad: false, manual: true,
            ready: true, locating: false, permission, gpsError: null, retry, choose, locateMe,
        }
    }
    return {
        locality, province, located, abroad, manual: false,
        ready: true, locating, permission, gpsError, retry, choose, locateMe,
    }
}
