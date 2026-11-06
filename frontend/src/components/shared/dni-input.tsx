'use client'

// ============================================================
// components/shared/dni-input.tsx
// Input de DNI reutilizable con:
// - Solo números (bloqueo en tiempo real)
// - Máximo 15 dígitos
// - Verificación de unicidad en Supabase (opcional, on blur)
// Usado en: registro de usuario, edición de usuario (admin)
// ============================================================

import { useState } from 'react'
import { Input } from '@heroui/react'
import { CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface DniInputProps {
    value: string
    onChange: (value: string) => void
    /** Si se proporciona, se excluye este ID al verificar unicidad (para edición) */
    excludeUserId?: string
    error?: string | null
    onError?: (error: string | null) => void
    isRequired?: boolean
    isInvalid?: boolean
    errorMessage?: string
}

export function DniInput({
    value,
    onChange,
    excludeUserId,
    error,
    onError,
    isRequired = false,
    isInvalid,
    errorMessage,
}: DniInputProps) {
    const [checking, setChecking] = useState(false)

    const handleBlur = async () => {
        if (!onError || !value || !/^[0-9]{1,15}$/.test(value)) return
        setChecking(true)
        onError(null)

        let query = supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('dni', value)

        // Si estamos editando, excluir el usuario actual de la verificación
        if (excludeUserId) {
            query = query.neq('id', excludeUserId)
        }

        const { count } = await query
        setChecking(false)
        if ((count ?? 0) > 0) {
            onError('Este DNI ya está registrado en la plataforma')
        }
    }

    return (
        <Input
            label={`DNI${isRequired ? "" : " (opcional)"}`}
            placeholder="12345678"
            type="text"
            inputMode="numeric"
            maxLength={15}
            variant="bordered"
            value={value}
            onValueChange={(v) => onChange(v.replace(/\D/g, "").slice(0, 15))}
            onBlur={handleBlur}
            isInvalid={!!isInvalid || !!error}
            errorMessage={errorMessage || error || undefined}
            isDisabled={checking}
            description={checking ? "Verificando DNI..." : undefined}
            classNames={{ inputWrapper: "bg-default-50" }}
            startContent={<CreditCard className="h-4 w-4 text-default-400" />}
            onKeyPress={(e) => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
        />
    )
}
