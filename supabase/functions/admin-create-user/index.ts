// admin-create-user/index.ts
// Crea un usuario con rol y perfil. Solo accesible para ADMIN.
// Roles: CLIENT, ADMIN, VENUE_ADMIN (con venue_id) y TRAINER (entrenador: DNI y teléfono
// obligatorios, spec entrenadores E5/E6; set_user_role le crea su ficha en borrador).

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { requireAdmin } from '../_shared/auth.ts'

const ROLES = ['CLIENT', 'ADMIN', 'VENUE_ADMIN', 'TRAINER'] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    // Autorización: el rol se verifica en profiles (no en el JWT, que puede estar desactualizado)
    const caller = await requireAdmin(req)
    if (caller instanceof Response) return caller

    const { email, password, first_name, last_name, phone, dni, role, venue_id } = await req.json()
    if (!email || !password) return err('email y password son requeridos')
    const targetRole = (role ?? 'CLIENT') as string
    if (!ROLES.includes(targetRole as (typeof ROLES)[number])) return err('Rol inválido')
    if (targetRole === 'TRAINER') {
      if (!String(first_name ?? '').trim() || !String(last_name ?? '').trim()) return err('Nombre y apellido son obligatorios')
      if (!String(phone ?? '').trim()) return err('El teléfono es obligatorio para un entrenador')
      if (!String(dni ?? '').trim()) return err('El DNI es obligatorio para un entrenador')
    }

    const supabase = createAdminClient()

    // Crear usuario en Supabase Auth con service_role
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: first_name ?? '', last_name: last_name ?? '' },
      app_metadata: { role: targetRole, venue_id: venue_id ?? null },
    })
    if (authErr) return err(authErr.message)

    if (authData.user) {
      const userId = authData.user.id
      // Datos extra del perfil (el trigger handle_new_user ya creó la fila)
      if (phone || dni) {
        const { error: pErr } = await supabase.from('profiles').update({
          ...(phone ? { phone } : {}),
          ...(dni ? { dni } : {}),
        }).eq('id', userId)
        if (pErr) {
          // Ej. DNI repetido: no dejar un usuario a medias
          await supabase.auth.admin.deleteUser(userId)
          return err(pErr.code === '23505' ? 'Ya existe un usuario con ese DNI' : pErr.message)
        }
      }
      // Rol (y ficha de entrenador si corresponde). Si falla, se deshace el alta.
      const { error: rErr } = await (supabase.rpc as any)('set_user_role', {
        p_user_id: userId,
        p_role: targetRole,
        p_venue_id: venue_id ?? null,
      })
      if (rErr) {
        await supabase.auth.admin.deleteUser(userId)
        return err(rErr.message)
      }
      if (targetRole === 'TRAINER') {
        await supabase.from('trainers').update({ created_by: caller.userId }).eq('user_id', userId)
      }
    }

    return ok({ id: authData.user?.id, email, role: targetRole }, 201)
  } catch (e) {
    return err(`Error interno: ${String(e)}`, 500)
  }
})
