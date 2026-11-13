"use client";

import { Button } from "@heroui/react";
import { MessageCircle } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { whatsappTopupUrl } from "@/lib/points";

interface WhatsappTopupButtonProps {
    /** Puntos a comprar (se escriben en el mensaje). Sin valor: "quiero comprar puntos". */
    points?: number | null;
    size?: "sm" | "md" | "lg";
    fullWidth?: boolean;
    isDisabled?: boolean;
    label?: string;
}

/** Abre WhatsApp con "Hola, quiero comprar X puntos. Mi cuenta: email" (R11). */
export function WhatsappTopupButton({ points, size = "md", fullWidth, isDisabled, label = "Cargar puntos por WhatsApp" }: WhatsappTopupButtonProps) {
    const email = useAuthStore((s) => s.user?.email);
    return (
        <Button
            as="a"
            href={whatsappTopupUrl(points, email)}
            target="_blank"
            rel="noopener noreferrer"
            size={size}
            fullWidth={fullWidth}
            isDisabled={isDisabled}
            className="bg-[#25D366] font-medium text-white!"
            startContent={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
        >
            {label}
        </Button>
    );
}
