import { z } from "zod";
import { isProvinceCode } from "@/lib/ar-provinces";

export const loginSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(1, "La contraseña es requerida"),
});

export const registerSchema = z
    .object({
        firstName: z.string().min(2, "Mínimo 2 caracteres"),
        lastName: z.string().min(2, "Mínimo 2 caracteres"),
        email: z.string().email("Email inválido"),
        dni: z
            .string()
            .min(1, "El DNI es requerido")
            .refine(
                (v) => /^[0-9]{1,15}$/.test(v),
                "El DNI solo puede contener números (máximo 15 dígitos)",
            ),
        // Ubicación del cliente: define qué publicidad ve. Código ISO (ej. "AR-X").
        province: z
            .string({ required_error: "Elegí tu provincia" })
            .refine(isProvinceCode, "Elegí tu provincia"),
        password: z.string()
            .min(8, "Mínimo 8 caracteres")
            .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
            .regex(/\d/, "Debe tener al menos un número"),
        confirmPassword: z.string(),
        phone: z
            .string()
            .optional()
            .refine(
                (v) => !v || /^[\d\s\-]+$/.test(v),
                "El teléfono solo puede contener números",
            ),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Las contraseñas no coinciden",
        path: ["confirmPassword"],
    });

export const forgotPasswordSchema = z.object({
    email: z.string().email("Email inválido"),
});

export const resetPasswordSchema = z
    .object({
        password: z.string()
            .min(8, "Mínimo 8 caracteres")
            .regex(/[A-Z]/, "Debe tener al menos una mayúscula")
            .regex(/\d/, "Debe tener al menos un número"),
        confirmPassword: z.string(),
        token: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Las contraseñas no coinciden",
        path: ["confirmPassword"],
    });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
