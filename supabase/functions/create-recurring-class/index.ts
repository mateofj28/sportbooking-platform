// ============================================================
// create-recurring-class/index.ts
// Clase fija semanal con un entrenador (Req. 8, E15): 8 fechas desde la elegida, salteando las
// que no se pueden. Todo pasa en book_class_series (067), todo o nada con el pago.
// POST body: { trainer_id, sport_id, start (ISO), hours, pay_mode: 'ALL'|'NEXT'|'NONE', expected_total? }
//   expected_total = precio de UNA fecha que ve el cliente (si cambió, no se crea nada).
// Siempre a nombre de quien llama (reglas de cliente).
// ============================================================

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { walletProblem } from '../_shared/wallet-errors.ts'
import { authUser, classEmail, fullName, loadClass } from '../_shared/classes.ts'
import { sendClassBookedToTrainer, sendClassSeriesConfirmation } from '../_shared/email.ts'
import { arDateLabel } from '../_shared/ar-time.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await authUser(req)
    if (!user) return err('No autorizado', 401)

    const { trainer_id, sport_id, start, hours, pay_mode, expected_total } = await req.json()
    if (typeof trainer_id !== 'string' || !UUID.test(trainer_id) || typeof sport_id !== 'string' || !UUID.test(sport_id)) {
      return err('Elegí el entrenador y el deporte')
    }
    const startAt = typeof start === 'string' ? new Date(start) : null
    if (!startAt || Number.isNaN(startAt.getTime())) return err('Elegí un horario')
    if (!Number.isInteger(hours) || hours < 1 || hours > 8) return err('Elegí la duración')
    if (!['ALL', 'NEXT', 'NONE'].includes(pay_mode)) return err('Forma de pago inválida')
    if (expected_total != null && (!Number.isInteger(expected_total) || expected_total < 0)) {
      return err('Precio esperado inválido')
    }

    const supabase = createAdminClient()
    const { data, error } = await (supabase.rpc as any)('book_class_series', {
      p_user: user.id,
      p_trainer: trainer_id,
      p_sport: sport_id,
      p_start: startAt.toISOString(),
      p_hours: hours,
      p_pay_mode: pay_mode,
      p_expected: expected_total ?? null,
      p_by: user.id,
    })
    if (error) {
      const problem = walletProblem(error, 'No se pudo crear la clase fija')
      return err(problem.message, problem.status, { code: problem.code, ...problem.extra })
    }

    // Emails (best-effort): al alumno (resumen) y al entrenador (primera clase)
    const created: { id: string; classId: string; start: string }[] = data?.created ?? []
    const skipped: { start: string }[] = data?.skipped ?? []
    const c = created[0] ? await loadClass(supabase, created[0].classId) : null
    if (c) {
      const me = c.bookings.find((b) => b.id === created[0].id)
      const toStudent = me ? classEmail(c, me.user) : null
      if (toStudent) {
        void sendClassSeriesConfirmation({
          ...toStudent,
          createdCount: Number(data.createdCount),
          paidCount: Number(data.paidCount),
          skipped: skipped.map((s) => arDateLabel(s.start)),
        })
      }
      const toTrainer = classEmail(c, c.trainer)
      if (toTrainer) {
        void sendClassBookedToTrainer({
          ...toTrainer,
          studentName: `${fullName(me?.user)} (clase fija, ${data.createdCount} fechas)`,
          taken: c.bookings.filter((b) => b.status !== 'CANCELLED').length,
          capacity: c.capacity,
        })
      }
    }

    return ok(data, 201)
  } catch (e) {
    console.error('create-recurring-class error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
