// admin-set-role/index.ts
// Actualiza el rol y venue_id en app_metadata del JWT de Supabase.
// Solo accesible para ADMIN.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createAdminClient, ok, err } from '../_shared/db.ts'

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autorizado', 401)

    // Verificar que quien llama es un ADMIN usando su JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user || user.app_metadata?.role !== 'ADMIN') return err('Solo ADMIN puede cambiar roles', 403)

    const { user_id, role, venue_id } = await req.json()
    if (!user_id || !role) return err('user_id y role son requeridos')

    const supabase = createAdminClient()

    // Llamar a la función set_user_role que actualiza profiles + app_metadata
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
