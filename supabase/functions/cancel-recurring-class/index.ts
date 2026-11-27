// ============================================================
// cancel-recurring-class/index.ts
// Cancela una clase fija (Req. 8.5). La base (cancel_recurring_class, 067) decide el rol:
//   - su propia serie -> las fechas a 24 h o más (las más cercanas se mantienen);
//   - el entrenador o el admin general -> todas las futuras, con motivo.
// Lo pagado vuelve al 100%. POST body: { recurring_class_id, reason? }
// ============================================================

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { walletProblem } from '../_shared/wallet-errors.ts'
import { normalizeCancelReason } from '../_shared/cancel-reason.ts'
import { authUser, classEmail, fullName, loadClass, ROLE_LABEL } from '../_shared/classes.ts'
import { sendClassCancellation } from '../_shared/email.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await authUser(req)
    if (!user) return err('No autorizado', 401)

    const { recurring_class_id, reason: rawReason } = await req.json()
    if (typeof recurring_class_id !== 'string' || !recurring_class_id) return err('recurring_class_id es requerido')
    const parsed = normalizeCancelReason(rawReason)
    if (!parsed.ok) return err(parsed.error)

    const supabase = createAdminClient()
    // Primera fecha a cancelar (para el email), antes de cancelar
    const { data: first } = await supabase
      .from('class_bookings')
      .select('class_id, class:trainer_classes!class_id(start_datetime)')
      .eq('recurring_class_id', recurring_class_id)
      .eq('status', 'CONFIRMED')
      .order('created_at')
      .limit(1)
      .maybeSingle()

    const { data, error } = await (supabase.rpc as any)('cancel_recurring_class', {
      p_id: recurring_class_id, p_by: user.id, p_reason: parsed.reason,
    })
    if (error) {
      const problem = walletProblem(error, 'No se pudo cancelar la clase fija')
      return err(problem.message, problem.status)
    }

    // Aviso a la otra parte (best-effort)
    const c = first?.class_id && Number(data?.cancelledCount) > 0 ? await loadClass(supabase, first.class_id) : null
    if (c) {
      const student = c.bookings.find((b) => b.user?.id === data.userId)?.user
      if (data.role === 'CLIENT') {
        const toTrainer = classEmail(c, c.trainer)
        if (toTrainer) {
          void sendClassCancellation({ ...toTrainer, byLabel: ROLE_LABEL.CLIENT, toTrainer: true,
            studentName: `${fullName(student)} (su clase fija, ${data.cancelledCount} fechas)` })
        }
      } else if (student) {
        const toStudent = classEmail(c, student)
        if (toStudent) {
          void sendClassCancellation({ ...toStudent, refunded: Number(data.refunded), reason: parsed.reason,
            byLabel: `${ROLE_LABEL[data.role] ?? ''}: tu clase fija (${data.cancelledCount} fechas)` })
        }
      }
    }

    return ok({ recurringClassId: recurring_class_id, cancelledCount: Number(data.cancelledCount), refunded: Number(data.refunded) })
  } catch (e) {
    console.error('cancel-recurring-class error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
