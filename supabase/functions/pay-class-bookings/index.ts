// ============================================================
// pay-class-bookings/index.ts
// Pagar fechas pendientes de clases fijas con créditos (Req. 8.5). Solo el titular.
// POST { class_booking_id, expected_total? }  o  { class_booking_ids: [...], expected_total? }
// expected_total = lo que ve el cliente; si el precio cambió (E23), no se cobra (409).
// ============================================================

import { createAdminClient, ok, err, corsHeaders } from '../_shared/db.ts'
import { walletProblem } from '../_shared/wallet-errors.ts'
import { authUser } from '../_shared/classes.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await authUser(req)
    if (!user) return err('No autorizado', 401)

    const { class_booking_id, class_booking_ids, expected_total } = await req.json()
    const hasExpected = expected_total !== undefined && expected_total !== null
    if (hasExpected && (!Number.isInteger(expected_total) || expected_total < 0)) return err('expected_total inválido')

    const supabase = createAdminClient()
    if (Array.isArray(class_booking_ids)) {
      const ids = [...new Set(class_booking_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)))] as string[]
      if (ids.length === 0 || ids.length > 20) return err('Elegí entre 1 y 20 fechas para pagar')
      const { data, error } = await (supabase.rpc as any)('pay_class_bookings_batch', {
        p_ids: ids, p_user: user.id, p_expected: hasExpected ? expected_total : null,
      })
      if (error) {
        const problem = walletProblem(error, 'No se pudieron pagar las fechas')
        return err(problem.message, problem.status, { code: problem.code, ...problem.extra })
      }
      return ok({ paid: true, paidCount: Number(data?.paidCount ?? 0), total: Number(data?.total ?? 0) })
    }

    if (typeof class_booking_id !== 'string' || !UUID.test(class_booking_id)) return err('class_booking_id es requerido')
    const { data, error } = await (supabase.rpc as any)('pay_class_booking', {
      p_id: class_booking_id, p_user: user.id, p_expected: hasExpected ? expected_total : null,
    })
    if (error) {
      const problem = walletProblem(error, 'No se pudo pagar la clase')
      return err(problem.message, problem.status, { code: problem.code, ...problem.extra })
    }
    return ok({ id: class_booking_id, paid: true, paidCount: data?.already ? 0 : 1, total: Number(data?.total ?? 0) })
  } catch (e) {
    console.error('pay-class-bookings error:', e)
    return err(`Error interno: ${String(e)}`, 500)
  }
})
