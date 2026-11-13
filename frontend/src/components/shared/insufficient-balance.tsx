"use client";

import { AlertTriangle } from "lucide-react";
import { formatPoints } from "@/lib/points";
import { WhatsappTopupButton } from "@/components/shared/whatsapp-topup-button";

/** Aviso de saldo insuficiente con el botón de WhatsApp por lo que falta (R2.2, R11.3). */
export function InsufficientBalance({ needed, available }: { needed: number; available: number }) {
    const missing = Math.max(0, Math.round(needed) - Math.round(available));
    return (
        <div role="alert" className="space-y-3 rounded-xl border border-warning-200 bg-warning-50 p-4">
            <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-600" aria-hidden="true" />
                <div className="text-sm">
                    <p className="font-semibold text-warning-700!">Saldo insuficiente</p>
                    <p className="text-warning-700">
                        Necesitás {formatPoints(needed)} y tenés {formatPoints(available)}. Te faltan {formatPoints(missing)}.
                    </p>
                </div>
            </div>
            <WhatsappTopupButton points={missing} size="sm" label={`Comprar ${formatPoints(missing)} por WhatsApp`} />
        </div>
    );
}
