'use client'

// ============================================================
// components/shared/phone-input.tsx
// Input de teléfono reutilizable con:
// - Selector de código de país (prefijo)
// - Validación por país (dígitos exactos + prefijos válidos)
// - Placeholder dinámico según país
// - Descripción del formato bajo el campo
// Usado en: registro de usuario, edición de usuario (admin)
// ============================================================

import { useState } from 'react'
import { Input } from '@heroui/react'

export interface CountryCode {
    code: string
    country: string
    flag: string
    digits: number
    starts: string[]
    placeholder: string
    label: string
}

export const COUNTRY_CODES: CountryCode[] = [
    { code: "+54", country: "AR", flag: "🇦🇷", digits: 10, starts: ["11", "2", "3", "4", "9"], placeholder: "11 2345-6789", label: "10 dígitos, ej: 11 2345-6789" },
    { code: "+57", country: "CO", flag: "🇨🇴", digits: 10, starts: ["3"], placeholder: "300 123 4567", label: "10 dígitos, comienza con 3" },
    { code: "+56", country: "CL", flag: "🇨🇱", digits: 9, starts: ["9", "2", "3", "4", "5", "6", "7"], placeholder: "9 1234 5678", label: "9 dígitos, ej: 9 1234 5678" },
    { code: "+52", country: "MX", flag: "🇲🇽", digits: 10, starts: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], placeholder: "55 1234 5678", label: "10 dígitos" },
    { code: "+51", country: "PE", flag: "🇵🇪", digits: 9, starts: ["9"], placeholder: "912 345 678", label: "9 dígitos, comienza con 9" },
    { code: "+593", country: "EC", flag: "🇪🇨", digits: 9, starts: ["9"], placeholder: "98 765 4321", label: "9 dígitos, comienza con 9" },
    { code: "+598", country: "UY", flag: "🇺🇾", digits: 8, starts: ["09", "2", "4"], placeholder: "094 123 456", label: "8 dígitos" },
    { code: "+591", country: "BO", flag: "🇧🇴", digits: 8, starts: ["6", "7"], placeholder: "71 234 567", label: "8 dígitos, comienza con 6 o 7" },
    { code: "+595", country: "PY", flag: "🇵🇾", digits: 9, starts: ["09"], placeholder: "0981 234 567", label: "9 dígitos, comienza con 09" },
    { code: "+58", country: "VE", flag: "🇻🇪", digits: 10, starts: ["04", "02"], placeholder: "0414 123 4567", label: "10 dígitos, comienza con 04 o 02" },
    { code: "+1", country: "US", flag: "🇺🇸", digits: 10, starts: ["2", "3", "4", "5", "6", "7", "8", "9"], placeholder: "212 555 1234", label: "10 dígitos" },
    { code: "+34", country: "ES", flag: "🇪🇸", digits: 9, starts: ["6", "7", "9"], placeholder: "612 345 678", label: "9 dígitos, comienza con 6, 7 o 9" },
    { code: "+55", country: "BR", flag: "🇧🇷", digits: 11, starts: ["9"], placeholder: "11 91234 5678", label: "11 dígitos, comienza con 9" },
]

/** Valida un número local contra las reglas del país.
 *  Devuelve null si es válido, o el mensaje de error si no lo es. */
export function validatePhoneNumber(value: string, countryCode: string): string | null {
    if (!value) return null
    const digits = value.replace(/[\s\-]/g, "")
    const rule = COUNTRY_CODES.find((c) => c.code === countryCode)
    if (!rule) return null

    if (!/^\d+$/.test(digits)) return "Solo se permiten números"
    if (digits.length !== rule.digits) return `Debe tener ${rule.digits} dígitos (${rule.label})`
    const validStart = rule.starts.some((s) => digits.startsWith(s))
    if (!validStart) return `Para ${rule.country} debe comenzar con: ${rule.starts.join(", ")} — ${rule.label}`
    return null
}

interface PhoneInputProps {
    /** Número local (sin código de país) */
    value: string
    onChange: (value: string) => void
    /** Código de país seleccionado, ej: "+54" */
    countryCode: string
    onCountryCodeChange: (code: string) => void
    error?: string | null
    onError?: (error: string | null) => void
    label?: string
    isRequired?: boolean
}

export function PhoneInput({
    value,
    onChange,
    countryCode,
    onCountryCodeChange,
    error,
    onError,
    label = "Teléfono",
    isRequired = false,
}: PhoneInputProps) {
    const [showCodes, setShowCodes] = useState(false)
    const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode) ?? COUNTRY_CODES[0]

    const handleBlur = () => {
        if (onError) {
            onError(validatePhoneNumber(value, countryCode))
        }
    }

    const handleCountryChange = (code: string) => {
        onCountryCodeChange(code)
        if (onError) onError(null) // reset error al cambiar de país
        setShowCodes(false)
    }

    return (
        <div className="relative">
            <Input
                label={`${label}${isRequired ? "" : " (opcional)"}`}
                placeholder={selectedCountry.placeholder}
                type="tel"
                inputMode="numeric"
                maxLength={selectedCountry.digits + 4}
                variant="bordered"
                value={value}
                onValueChange={(v) => onChange(v.replace(/[^\d\s\-]/g, ""))}
                onBlur={handleBlur}
                isInvalid={!!error}
                errorMessage={error ?? undefined}
                description={!error ? selectedCountry.label : undefined}
                onKeyPress={(e) => { if (!/[\d\s\-]/.test(e.key)) e.preventDefault() }}
                classNames={{ inputWrapper: "bg-default-50" }}
                startContent={
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowCodes(!showCodes)}
                            className="flex items-center gap-1 text-sm font-medium text-default-600 hover:text-primary transition-colors pr-2 border-r border-default-200 mr-2"
                        >
                            <span>{selectedCountry.flag}</span>
                            <span className="text-xs">{countryCode}</span>
                        </button>
                    </div>
                }
            />
            {showCodes && (
                <div className="absolute top-full left-0 z-50 mt-1 w-56 max-h-48 overflow-y-auto rounded-xl border border-divider bg-background shadow-xl">
                    {COUNTRY_CODES.map((c) => (
                        <button
                            key={c.code}
                            type="button"
                            onClick={() => handleCountryChange(c.code)}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-default-100 transition-colors ${countryCode === c.code ? "bg-primary-50 text-primary" : ""}`}
                        >
                            <span className="text-base">{c.flag}</span>
                            <span className="font-medium">{c.country}</span>
                            <span className="text-default-400 ml-auto">{c.code}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
