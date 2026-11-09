// ============================================================
// _shared/auth.ts
// Autorización para Edge Functions de administración.
//
// Estas funciones usan la service_role key (saltan RLS), así que el control
// de acceso TIENE que hacerse acá: nunca asumir que el llamador es admin
// solo porque mandó un header Authorization.
//
// El rol se lee de public.profiles (fuente de verdad, siempre actualizada),
// no del JWT: el token puede estar vencido respecto a un cambio de rol.
// ============================================================

import { createAdminClient, err } from './db.ts'

export interface AdminCaller {
  userId: string
}

/**
 * Exige que quien llama sea un ADMIN general activo.
 *
 * Uso:
 *   const caller = await requireAdmin(req)
 *   if (caller instanceof Response) return caller
 *
 * - 401 si no hay token, es inválido o está vencido.
 * - 403 si el usuario existe pero no es ADMIN (o está desactivado).
 */
export async function requireAdmin(req: Request): Promise<AdminCaller | Response> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return err('No autorizado', 401)

  const admin = createAdminClient()

  // Valida la firma y vigencia del JWT contra Auth. La clave publicable
  // (anon) NO es un JWT de usuario, así que acá devuelve error.
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return err('No autorizado', 401)

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) return err('No se pudo verificar el usuario', 500)
  if (!profile || profile.role !== 'ADMIN' || profile.is_active === false) {
    return err('Solo el administrador general puede realizar esta acción', 403)
  }

  return { userId: data.user.id }
}
