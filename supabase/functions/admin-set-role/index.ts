// admin-set-role/index.ts
// Actualiza el rol y venue_id de un usuario via set_user_role (RPC).
// Solo ADMIN general.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { requireAdmin } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  // Responder al preflight CORS que envía el browser antes de cada POST
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Autorización: sin esto, cualquiera con un header cualquiera podría cambiar roles
    const caller = await requireAdmin(req)
    if (caller instanceof Response) return caller

    const { user_id, role, venue_id } = await req.json()
    if (!user_id || !role) return err('user_id y role son requeridos')

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
