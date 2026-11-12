// ============================================================
// lib/zod-es.ts
//
// Mensajes de Zod en español para los campos que no tienen un mensaje propio.
// Los esquemas con `message` explícito no cambian (el mensaje propio tiene prioridad).
// Se activa una sola vez al importar este módulo (providers/query-provider.tsx).
// ============================================================

import { z, ZodIssueCode, type ZodErrorMap } from 'zod'

const plural = (n: number | bigint, uno: string, varios: string) => (Number(n) === 1 ? uno : varios)

const esErrorMap: ZodErrorMap = (issue, ctx) => {
    switch (issue.code) {
        case ZodIssueCode.invalid_type:
            if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Este campo es obligatorio' }
            if (issue.expected === 'number') return { message: 'Ingresá un número' }
            if (issue.expected === 'date') return { message: 'Ingresá una fecha válida' }
            return { message: 'Valor inválido' }
        case ZodIssueCode.invalid_string:
            if (issue.validation === 'email') return { message: 'Ingresá un email válido' }
            if (issue.validation === 'url') return { message: 'Ingresá un link válido (https://…)' }
            if (issue.validation === 'uuid') return { message: 'Identificador inválido' }
            if (issue.validation === 'datetime' || issue.validation === 'date') return { message: 'Ingresá una fecha válida' }
            if (issue.validation === 'time') return { message: 'Ingresá una hora válida' }
            return { message: 'Formato inválido' }
        case ZodIssueCode.too_small:
            if (issue.type === 'string') {
                if (Number(issue.minimum) === 1) return { message: 'Este campo es obligatorio' }
                return { message: `Debe tener al menos ${issue.minimum} ${plural(issue.minimum, 'carácter', 'caracteres')}` }
            }
            if (issue.type === 'array') return { message: `Elegí al menos ${issue.minimum} ${plural(issue.minimum, 'opción', 'opciones')}` }
            if (issue.type === 'number' || issue.type === 'bigint') {
                return { message: issue.inclusive ? `Debe ser ${issue.minimum} o más` : `Debe ser mayor que ${issue.minimum}` }
            }
            if (issue.type === 'date') return { message: 'La fecha es demasiado antigua' }
            return { message: 'Valor demasiado chico' }
        case ZodIssueCode.too_big:
            if (issue.type === 'string') return { message: `Admite hasta ${issue.maximum} ${plural(issue.maximum, 'carácter', 'caracteres')}` }
            if (issue.type === 'array') return { message: `Elegí hasta ${issue.maximum} ${plural(issue.maximum, 'opción', 'opciones')}` }
            if (issue.type === 'number' || issue.type === 'bigint') {
                return { message: issue.inclusive ? `Debe ser ${issue.maximum} o menos` : `Debe ser menor que ${issue.maximum}` }
            }
            if (issue.type === 'date') return { message: 'La fecha es demasiado lejana' }
            return { message: 'Valor demasiado grande' }
        case ZodIssueCode.invalid_enum_value:
        case ZodIssueCode.invalid_literal:
        case ZodIssueCode.invalid_union:
        case ZodIssueCode.invalid_union_discriminator:
            return { message: 'Elegí una opción válida' }
        case ZodIssueCode.invalid_date:
            return { message: 'Ingresá una fecha válida' }
        case ZodIssueCode.not_multiple_of:
            return { message: `Debe ser múltiplo de ${issue.multipleOf}` }
        case ZodIssueCode.not_finite:
            return { message: 'Ingresá un número válido' }
        case ZodIssueCode.unrecognized_keys:
            return { message: 'Hay datos que no corresponden' }
        case ZodIssueCode.custom:
            return { message: ctx.defaultError === 'Invalid input' ? 'Valor inválido' : ctx.defaultError }
        default:
            return { message: 'Valor inválido' }
    }
}

z.setErrorMap(esErrorMap)
