// ============================================================
// create-class-booking/index.ts
// Reserva y paga una clase con un entrenador (Req. 7). Todo o nada en book_class (066):
// valida horario, cupo, 24 h / 30 días, precio y saldo, y descuenta los créditos.
// POST body: { trainer_id, sport_id, start (ISO), hours, expected_total? }
// Siempre a nombre de quien llama (también si es admin o entrenador: reglas de cliente).
// ============================================================

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { walletProblem } from '../_shared/wallet-errors.ts'
import { authUser, classEmail, fullName, loadClass } from '../_shared/classes.ts'
import { sendClassBookedToTrainer, sendClassConfirmation } from '../_shared/email.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await authUser(req)
    if (!user) return err('No autorizado', 401)

    const { trainer_id, sport_id, start, hours, expected_total } = await req.json()
    if (typeof trainer_id !== 'string' || !UUID.test(trainer_id) || typeof sport_id !== 'string' || !UUID.test(sport_id)) {
      return err('Elegí el entrenador y el deporte')
    }
    const startAt = typeof start === 'string' ? new Date(start) : null
    if (!startAt || Number.isNaN(startAt.getTime())) return err('Elegí un horario')
    if (!Number.isInteger(hours) || hours < 1 || hours > 8) return err('Elegí la duración')
    if (expected_total != null && (!Number.isInteger(expected_total) || expected_total < 0)) {
      return err('Precio esperado inválido')
    }

    const supabase = createAdminClient()
    const { data, error } = await (supabase.rpc as any)('book_class', {
      p_user: user.id,
      p_trainer: trainer_id,
      p_sport: sport_id,
      p_start: startAt.toISOString(),
      p_hours: hours,
      p_expected: expected_total ?? null,
      p_by: user.id,
    })
    if (error) {
      const problem = walletProblem(error, 'No se pudo reservar la clase')
      return err(problem.message, problem.status, { code: problem.code, ...problem.extra })
    }

    // Emails (best-effort): al alumno y al entrenador
    const c = await loadClass(supabase, data.classId)
    if (c) {
      const me = c.bookings.find((b) => b.id === data.classBookingId)
      const toStudent = me ? classEmail(c, me.user, Number(data.total)) : null
      if (toStudent) void sendClassConfirmation(toStudent)
      const toTrainer = classEmail(c, c.trainer)
      if (toTrainer) {
        void sendClassBookedToTrainer({
          ...toTrainer,
          studentName: fullName(me?.user),
          taken: c.bookings.filter((b) => b.status !== 'CANCELLED').length,
          capacity: c.capacity,
        })
      }
    }

    return ok({ classBookingId: data.classBookingId, classId: data.classId, total: Number(data.total) }, 201)
  } catch (e) {
    console.error('create-class-booking error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
