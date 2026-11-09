// admin-delete-user/index.ts
// Elimina completamente un usuario: primero de auth.users (lo que
// elimina en cascada el perfil via ON DELETE CASCADE), usando
// el Admin API de Supabase que requiere service_role.
// Solo ADMIN general.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { requireAdmin } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Autorización: sin esto, cualquiera con un header cualquiera podría borrar usuarios
    const caller = await requireAdmin(req)
    if (caller instanceof Response) return caller

    const { user_id } = await req.json()
    if (!user_id) return err('user_id es requerido')

    // Evita que el admin se borre a sí mismo y deje la plataforma sin administrador
    if (user_id === caller.userId) return err('No podés eliminar tu propia cuenta', 400)

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
