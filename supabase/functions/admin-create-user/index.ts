// admin-create-user/index.ts
// Crea un usuario con rol y perfil. Solo accesible para ADMIN.

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err('No autorizado', 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user || user.app_metadata?.role !== 'ADMIN') return err('Solo ADMIN puede crear usuarios', 403)

    const { email, password, first_name, last_name, phone, dni, role, venue_id } = await req.json()
    if (!email || !password) return err('email y password son requeridos')

    const supabase = createAdminClient()

    // Crear usuario en Supabase Auth con service_role
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: first_name ?? '', last_name: last_name ?? '' },
      app_metadata: { role: role ?? 'CLIENT', venue_id: venue_id ?? null },
    })
    if (authErr) return err(authErr.message)

    // El trigger handle_new_user crea el profile automáticamente.
    // Forzar el rol correcto via set_user_role por si el trigger tardó.
    if (authData.user) {
      await (supabase.rpc as any)('set_user_role', {
        p_user_id: authData.user.id,
        p_role: role ?? 'CLIENT',
        p_venue_id: venue_id ?? null,
      })
      // Actualizar campos extra en profiles
      if (phone || dni) {
        await supabase.from('profiles').update({
          ...(phone ? { phone } : {}),
          ...(dni ? { dni } : {}),
        }).eq('id', authData.user.id)
      }
    }

    return ok({ id: authData.user?.id, email }, 201)
  } catch (e) {
    return err(`Error interno: ${String(e)}`, 500)
  }
})
