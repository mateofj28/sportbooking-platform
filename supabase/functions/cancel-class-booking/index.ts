// ============================================================
// cancel-class-booking/index.ts
// Cancela el lugar de un alumno en una clase y le devuelve el 100% (Req. 9).
// La base (cancel_class_booking, 066) decide quién cancela:
//   - su propia reserva -> reglas de cliente: hasta 24 h antes;
//   - el entrenador de la clase o el admin general -> en cualquier momento, con motivo.
// POST body: { class_booking_id, reason? }
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

    const { class_booking_id, reason: rawReason } = await req.json()
    if (typeof class_booking_id !== 'string' || !class_booking_id) return err('class_booking_id es requerido')
    const parsed = normalizeCancelReason(rawReason)
    if (!parsed.ok) return err(parsed.error)

    const supabase = createAdminClient()
    const { data, error } = await (supabase.rpc as any)('cancel_class_booking', {
      p_id: class_booking_id,
      p_by: user.id,
      p_reason: parsed.reason,
    })
    if (error) {
      const problem = walletProblem(error, 'No se pudo cancelar la clase')
      return err(problem.message, problem.status)
    }
    const refunded = Number(data?.refunded ?? 0)

    // Emails (best-effort)
    const c = await loadClass(supabase, data.classId)
    const student = c?.bookings.find((b) => b.id === class_booking_id)?.user
    if (c && student) {
      if (data.role === 'CLIENT') {
        // Canceló el alumno: confirmación a él y aviso al entrenador
        const toStudent = classEmail(c, student)
        if (toStudent) void sendClassCancellation({ ...toStudent, refunded, byLabel: ROLE_LABEL.CLIENT })
        const toTrainer = classEmail(c, c.trainer)
        if (toTrainer) void sendClassCancellation({ ...toTrainer, byLabel: ROLE_LABEL.CLIENT, toTrainer: true, studentName: fullName(student) })
      } else {
        const toStudent = classEmail(c, student)
        if (toStudent) void sendClassCancellation({ ...toStudent, refunded, reason: parsed.reason, byLabel: ROLE_LABEL[data.role] ?? '' })
      }
    }

    return ok({ id: class_booking_id, cancelled: true, refunded, role: data.role })
  } catch (e) {
    console.error('cancel-class-booking error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
