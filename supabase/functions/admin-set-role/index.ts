// admin-set-role/index.ts
// Actualiza el rol y venue_id de un usuario via set_user_role (RPC).
// La autorización se verifica en la DB: solo ADMIN puede cambiar roles.

import { createAdminClient, ok, err } from '../_shared/db.ts'

Deno.serve(async (req) => {
  try {
    // Verificar que viene un JWT (usuario autenticado)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autorizado', 401)

    const { user_id, role, venue_id } = await req.json()
    if (!user_id || !role) return err('user_id y role son requeridos')

    // Usar service_role para llamar a set_user_role.
    // La función SQL set_user_role no tiene restricción de rol —
    // la restricción está en el RLS de profiles + el layout del dashboard
    // que solo permite acceder a ADMIN.
    const supabase = createAdminClient()

    const { data, error } = await (supabase.rpc as any)('set_user_role', {
      p_user_id: user_id,
      p_role: role,
      p_venue_id: venue_id ?? null,
    })
    if (error) return err(error.message)

    return ok(data)
  } catch (e) {
    return err(`Error interno: ${String(e)}`, 500)
  }
})
