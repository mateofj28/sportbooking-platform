// admin-delete-user/index.ts
// Elimina completamente un usuario: primero de auth.users (lo que
// elimina en cascada el perfil via ON DELETE CASCADE), usando
// el Admin API de Supabase que requiere service_role.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autorizado', 401)

    const { user_id } = await req.json()
    if (!user_id) return err('user_id es requerido')

    const supabase = createAdminClient()

    // Usar el Admin API para eliminar de auth.users.
    // Esto dispara ON DELETE CASCADE en profiles.id → auth.users.id
    const { error } = await supabase.auth.admin.deleteUser(user_id)
    if (error) return err(error.message)

    return ok({ deleted: true, user_id })
  } catch (e) {
    return err(`Error interno: ${String(e)}`, 500)
  }
})
