// ============================================================
// cancel-trainer-class/index.ts
// El entrenador de la clase (o el admin general) cancela la clase entera: todas sus
// reservas, con devolución del 100% a cada alumno (Req. 9.2, 9.3). Motivo obligatorio.
// POST body: { class_id, reason }
// ============================================================

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { walletProblem } from '../_shared/wallet-errors.ts'
import { normalizeCancelReason } from '../_shared/cancel-reason.ts'
import { authUser, classEmail, loadClass, ROLE_LABEL } from '../_shared/classes.ts'
import { sendClassCancellation } from '../_shared/email.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await authUser(req)
    if (!user) return err('No autorizado', 401)

    const { class_id, reason: rawReason } = await req.json()
    if (typeof class_id !== 'string' || !class_id) return err('class_id es requerido')
    const parsed = normalizeCancelReason(rawReason)
    if (!parsed.ok) return err(parsed.error)

    const supabase = createAdminClient()
    const { data, error } = await (supabase.rpc as any)('cancel_trainer_class', {
      p_class: class_id,
      p_by: user.id,
      p_reason: parsed.reason,
    })
    if (error) {
      const problem = walletProblem(error, 'No se pudo cancelar la clase')
      return err(problem.message, problem.status)
    }

    const items: { id: string; userId: string; refunded: number }[] = data?.bookings ?? []
    const c = await loadClass(supabase, class_id)
    if (c) {
      for (const it of items) {
        const student = c.bookings.find((b) => b.id === it.id)?.user
        const mail = student ? classEmail(c, student) : null
        if (mail) {
          void sendClassCancellation({ ...mail, refunded: Number(it.refunded), reason: parsed.reason, byLabel: ROLE_LABEL[data.role] ?? '' })
        }
      }
    }

    return ok({ id: class_id, cancelled: true, students: items.length })
  } catch (e) {
    console.error('cancel-trainer-class error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
