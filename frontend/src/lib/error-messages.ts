// ============================================================
// lib/error-messages.ts
//
// Traduce al español (Argentina) los errores que llegan en inglés desde Supabase
// (Auth, PostgREST / Postgres, Storage, Edge Functions) o desde el navegador (red).
//
// Regla: lo que ya está en español (nuestros RAISE EXCEPTION, los mensajes de las
// Edge Functions) se deja como está. Lo que está en inglés se traduce por código y,
// si no hay código, por el texto. Si no se reconoce, se muestra un mensaje genérico
// en español (el original queda en la consola para depurar).
//
// Se aplica en:
//   - toAppError(): en los hooks, al lanzar el error de supabase-js.
//   - invokeFunction / callRpc (lib/supabase-helpers.ts).
//   - MutationCache / QueryCache (providers/query-provider.tsx): red de seguridad
//     para cualquier error que llegue a la interfaz por React Query.
//   - addToast (stores/toast-store.ts): red de seguridad para los avisos.
// ============================================================

const MSG = {
    invalidCredentials: 'Email o contraseña incorrectos.',
    emailNotConfirmed: 'Todavía no confirmaste tu email. Revisá tu casilla (y el correo no deseado).',
    emailExists: 'Ya existe una cuenta con ese email.',
    dniExists: 'Ya existe una cuenta con ese DNI.',
    weakPassword: 'La contraseña es demasiado débil. Probá con una más larga que combine letras y números.',
    samePassword: 'La nueva contraseña tiene que ser distinta de la actual.',
    invalidEmail: 'El email no es válido.',
    emailRateLimit: 'Enviamos demasiados emails en poco tiempo. Esperá unos minutos y probá de nuevo.',
    rateLimit: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
    signupDisabled: 'El registro de usuarios está deshabilitado por el momento.',
    session: 'Tu sesión expiró. Iniciá sesión de nuevo.',
    linkExpired: 'El link expiró o ya se usó. Pedí uno nuevo.',
    userNotFound: 'No encontramos ese usuario.',
    userBanned: 'Tu cuenta está suspendida. Escribinos desde Ayuda y soporte.',
    emailNotAuthorized: 'Por el momento no podemos enviar emails a esa dirección.',
    reauth: 'Por seguridad, volvé a iniciar sesión e intentá de nuevo.',
    duplicate: 'Ya existe un registro con esos datos.',
    duplicateVenue: 'Ya existe un complejo con ese nombre.',
    duplicateSport: 'Ya existe un deporte con ese nombre.',
    inUse: 'No se puede eliminar porque tiene datos asociados (por ejemplo, reservas o canchas).',
    missingRef: 'Uno de los datos elegidos ya no existe. Recargá la página y probá de nuevo.',
    notNull: 'Falta completar un dato obligatorio.',
    check: 'Algún dato está fuera de los valores permitidos.',
    overlap: 'Ese horario ya está reservado.',
    permission: 'No tenés permiso para hacer esto.',
    notFound: 'No encontramos lo que buscabas. Puede que se haya eliminado.',
    badFormat: 'Hay un dato con formato inválido.',
    tooLong: 'Un texto es demasiado largo.',
    outOfRange: 'Un número está fuera del rango permitido.',
    badDate: 'Hay una fecha u hora inválida.',
    timeout: 'La operación tardó demasiado. Probá de nuevo.',
    network: 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.',
    server: 'El servidor no pudo completar la operación. Probá de nuevo en un momento.',
    fileTooLarge: 'El archivo es demasiado pesado. Elegí uno más liviano.',
    fileType: 'Ese tipo de archivo no está permitido. Subí una imagen JPG, PNG o WebP.',
    fileExists: 'Ya existe un archivo con ese nombre. Probá de nuevo.',
    aborted: 'Se canceló la operación.',
    generic: 'Ocurrió un error inesperado. Probá de nuevo en un momento.',
} as const

/** Códigos de Supabase Auth (AuthError.code). */
const AUTH_CODES: Record<string, string> = {
    invalid_credentials: MSG.invalidCredentials,
    email_not_confirmed: MSG.emailNotConfirmed,
    user_already_exists: MSG.emailExists,
    email_exists: MSG.emailExists,
    weak_password: MSG.weakPassword,
    same_password: MSG.samePassword,
    email_address_invalid: MSG.invalidEmail,
    over_email_send_rate_limit: MSG.emailRateLimit,
    over_request_rate_limit: MSG.rateLimit,
    over_sms_send_rate_limit: MSG.rateLimit,
    signup_disabled: MSG.signupDisabled,
    email_provider_disabled: MSG.signupDisabled,
    session_not_found: MSG.session,
    session_expired: MSG.session,
    refresh_token_not_found: MSG.session,
    refresh_token_already_used: MSG.session,
    bad_jwt: MSG.session,
    no_authorization: MSG.session,
    otp_expired: MSG.linkExpired,
    flow_state_expired: MSG.linkExpired,
    flow_state_not_found: MSG.linkExpired,
    bad_code_verifier: MSG.linkExpired,
    user_not_found: MSG.userNotFound,
    user_banned: MSG.userBanned,
    email_address_not_authorized: MSG.emailNotAuthorized,
    reauthentication_needed: MSG.reauth,
    reauthentication_not_valid: MSG.reauth,
    not_admin: MSG.permission,
}

/** Reglas por texto (para errores sin código, o con el código perdido en el camino). */
const TEXT_RULES: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
    [/invalid login credentials/i, MSG.invalidCredentials],
    [/email not confirmed/i, MSG.emailNotConfirmed],
    [/user already registered|already been registered|email address .*already|email.*already exists/i, MSG.emailExists],
    [/password should be at least (\d+)/i, (m) => `La contraseña debe tener al menos ${m[1]} caracteres.`],
    [/password should contain/i, MSG.weakPassword],
    [/new password should be different/i, MSG.samePassword],
    [/unable to validate email|email address .*invalid|invalid email/i, MSG.invalidEmail],
    [/you can only request this (?:after|once every) (\d+) seconds?/i, (m) => `Por seguridad, esperá ${m[1]} segundos antes de volver a intentarlo.`],
    [/email rate limit/i, MSG.emailRateLimit],
    [/rate limit|too many requests/i, MSG.rateLimit],
    [/signups? not allowed|signups? (?:are )?disabled/i, MSG.signupDisabled],
    [/auth session missing|jwt expired|invalid jwt|refresh token|session (?:not found|expired)/i, MSG.session],
    [/email link is invalid|link .*expired|token has expired|otp/i, MSG.linkExpired],
    [/conflicting key value violates exclusion constraint/i, MSG.overlap],
    [/duplicate key.*dni/i, MSG.dniExists],
    [/duplicate key.*email/i, MSG.emailExists],
    [/duplicate key.*venues?_(?:slug|name)/i, MSG.duplicateVenue],
    [/duplicate key.*sports?_name/i, MSG.duplicateSport],
    [/duplicate key/i, MSG.duplicate],
    [/update or delete on table .*violates foreign key/i, MSG.inUse],
    [/violates foreign key/i, MSG.missingRef],
    [/violates not-null/i, MSG.notNull],
    [/violates check constraint/i, MSG.check],
    [/row-level security|permission denied|not authorized|unauthorized|forbidden/i, MSG.permission],
    [/invalid input syntax|invalid input value/i, MSG.badFormat],
    [/value too long/i, MSG.tooLong],
    [/out of range/i, MSG.outOfRange],
    [/date\/time field value|invalid (?:date|time)/i, MSG.badDate],
    [/payload too large|exceeded the maximum allowed size|entity too large/i, MSG.fileTooLarge],
    [/mime type .*not supported|invalid mime/i, MSG.fileType],
    [/the resource already exists/i, MSG.fileExists],
    [/failed to fetch|networkerror|load failed|network request failed|fetch failed|err_network|failed to send a request/i, MSG.network],
    [/timeout|timed out/i, MSG.timeout],
    [/abort/i, MSG.aborted],
    [/no rows|contains 0 rows|not found/i, MSG.notFound],
    [/edge function returned a non-2xx|internal server error|internal error|bad gateway|service unavailable|relay error/i, MSG.server],
]

/** Postgres / PostgREST (PostgrestError.code). Algunos dependen de que el texto esté en inglés. */
function byDbCode(code: string, message: string): string | null {
    const english = looksEnglish(message)
    switch (code) {
        case '23505': {
            if (/dni/i.test(message)) return MSG.dniExists
            if (/email/i.test(message)) return MSG.emailExists
            if (/venues?_(?:slug|name)/i.test(message)) return MSG.duplicateVenue
            if (/sports?_name/i.test(message)) return MSG.duplicateSport
            return MSG.duplicate
        }
        case '23503': return /update or delete/i.test(message) ? MSG.inUse : MSG.missingRef
        case '23502': return MSG.notNull
        case '23514': return english ? MSG.check : null   // nuestros CHECK/RAISE ya vienen en español
        case '23P01': return MSG.overlap
        case '42501': return english ? MSG.permission : null
        case 'PGRST116': return MSG.notFound
        case 'PGRST301':
        case 'PGRST302':
        case 'PGRST303': return MSG.session
        case '22P02': return MSG.badFormat
        case '22001': return MSG.tooLong
        case '22003': return MSG.outOfRange
        case '22007':
        case '22008': return MSG.badDate
        case '57014': return MSG.timeout
        case '22023': return english ? MSG.badFormat : null
        default: return null
    }
}

const SPANISH_HINT = /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|que|para|con|una?|debe|puede|ya|hay|tiene|esta|reserva|turno|cancha|fecha|hora|horario|precio|tarifa|usuario|motivo|sin|solo|complejo|al|interno|no se|no hay|no autorizado|inv[aá]lid[oa]|obligatori[oa]|requerid[oa]s?|son|es)\b/i
const ENGLISH_HINT = /\b(the|is|are|was|not|invalid|failed|failure|unable|must|should|cannot|can't|already|missing|required|denied|exceeded|unexpected|error|request|status|violates|constraint|duplicate|key|value|syntax|function|relation|column|does|exist|permission|unauthorized|forbidden|found|timeout|expired|token|user|password|network|fetch|internal|server|undefined|null|type|cannot read|properties)\b/i

/** ¿El texto parece estar en inglés (y no en español)? */
export function looksEnglish(text: string): boolean {
    if (!text) return false
    if (SPANISH_HINT.test(text)) return false
    return ENGLISH_HINT.test(text) || /^[A-Z][a-z]+Error\b/.test(text)
}

function byText(message: string): string | null {
    for (const [re, out] of TEXT_RULES) {
        const m = message.match(re)
        if (m) return typeof out === 'function' ? out(m) : out
    }
    return null
}

interface ErrorLike { message?: unknown; code?: unknown; error?: unknown; error_description?: unknown; msg?: unknown }

function extract(input: unknown): { message: string; code: string } {
    if (input == null) return { message: '', code: '' }
    if (typeof input === 'string') return { message: input, code: '' }
    if (typeof input === 'object') {
        const e = input as ErrorLike
        const raw = e.message ?? e.error_description ?? e.msg ?? e.error
        const message = typeof raw === 'string' ? raw : raw != null ? extract(raw).message : ''
        const code = typeof e.code === 'string' ? e.code : ''
        return { message, code }
    }
    return { message: String(input), code: '' }
}

/**
 * Mensaje en español para mostrar al usuario, a partir de cualquier error
 * (Error, AuthError, PostgrestError, StorageError, objeto { message } o texto).
 */
export function translateError(input: unknown, fallback: string = MSG.generic): string {
    const { message, code } = extract(input)
    const msg = message.trim()

    if (code && AUTH_CODES[code]) return AUTH_CODES[code]
    if (code) {
        const db = byDbCode(code, msg)
        if (db) return db
    }
    if (!msg) return fallback

    // "Prefijo en español: detalle técnico en inglés" (así responden algunas Edge Functions,
    // ej. "Error al cancelar: permission denied…"): traducir el detalle o quedarse con el prefijo.
    const cut = msg.indexOf(': ')
    if (cut > 0) {
        const prefix = msg.slice(0, cut)
        const tail = msg.slice(cut + 2)
        const tailIsEnglish = looksEnglish(tail) || (!SPANISH_HINT.test(tail) && /[a-z]{3,}\s+[a-z]{3,}/i.test(tail))
        if (SPANISH_HINT.test(prefix) && tailIsEnglish) {
            const known = byText(tail)
            if (known) return known
            if (/^error interno$/i.test(prefix)) return MSG.server
            return `${prefix.replace(/[.\s]+$/, '')}. Probá de nuevo en un momento.`
        }
    }

    // Ya está en español: dejarlo
    if (!looksEnglish(msg)) return msg

    const known = byText(msg)
    if (known) return known

    if (typeof console !== 'undefined') console.warn('[error sin traducir]', msg)
    return fallback
}

/** Error listo para lanzar desde un hook (mensaje traducido, conserva el código). */
export function toAppError(input: unknown, fallback?: string): Error {
    const e = new Error(translateError(input, fallback))
    const { code } = extract(input)
    if (code) (e as Error & { code?: string }).code = code
    return e
}

/**
 * Traduce EN EL LUGAR el mensaje de un error que ya circula (lo usa React Query,
 * para que el `error.message` que leen las pantallas quede en español).
 */
export function translateErrorInPlace(error: unknown): void {
    if (!error || typeof error !== 'object') return
    const e = error as { message?: unknown }
    if (typeof e.message !== 'string') return
    const out = translateError(error)
    if (out !== e.message) {
        try {
            e.message = out
        } catch {
            // propiedad de solo lectura: no es crítico
        }
    }
}
