// ============================================================
// lib/points.ts
// Billetera de puntos (spec billetera-puntos): 1 punto = 1 peso argentino.
// Formato de montos y link de WhatsApp para comprar puntos (la recarga es manual:
// el cliente transfiere y el admin general le carga los puntos).
// ============================================================

import { formatDateTimeAr } from "@/lib/datetime";

/** Número de WhatsApp para comprar puntos, en formato internacional sin "+" ni espacios. */
export const WHATSAPP_TOPUP_NUMBER = "5492984339319";
/** El mismo número, legible. */
export const WHATSAPP_TOPUP_LABEL = "+54 9 2984 33-9319";

/** 63000 -> "63,000" (miles con coma, igual que los precios de la app: lib/pricing formatPrice). */
export function formatPointsNumber(n: number): string {
    return Math.round(Number(n) || 0).toLocaleString("en-US");
}

/** 63000 -> "$63,000 ARS" (1 punto = 1 peso). */
export function formatPesos(n: number): string {
    return `$${formatPointsNumber(n)} ARS`;
}

/** 63000 -> "63,000 pts" */
export function formatPoints(n: number): string {
    return `${formatPointsNumber(n)} pts`;
}

/** Monto con signo: 63000 -> "+63.000", -63000 -> "−63.000" (signo menos tipográfico). */
export function formatSignedPoints(n: number): string {
    const v = Math.round(Number(n) || 0);
    if (v > 0) return `+${formatPointsNumber(v)}`;
    if (v < 0) return `−${formatPointsNumber(-v)}`;
    return "0";
}

/**
 * Link de WhatsApp con el mensaje ya escrito (R11):
 * "Hola, quiero comprar X puntos. Mi cuenta: email@ejemplo.com"
 */
export function whatsappTopupUrl(points?: number | null, email?: string | null): string {
    const amount = points && points > 0 ? `${formatPointsNumber(points)} puntos` : "puntos";
    const account = email ? ` Mi cuenta: ${email}` : "";
    const text = `Hola, quiero comprar ${amount}.${account}`;
    return `https://wa.me/${WHATSAPP_TOPUP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** Tipos de movimiento de la billetera del cliente (enum wallet_tx_kind). */
export type WalletTxKind = "TOPUP" | "ADJUSTMENT" | "BOOKING_PAYMENT" | "BOOKING_REFUND";

export const WALLET_TX_LABEL: Record<WalletTxKind, string> = {
    TOPUP: "Recarga",
    ADJUSTMENT: "Ajuste",
    BOOKING_PAYMENT: "Reserva",
    BOOKING_REFUND: "Devolución",
};

/** Tipos de movimiento de la sede (enum venue_ledger_kind). */
export type VenueLedgerKind = "BOOKING_CREDIT" | "SETTLEMENT";

export const VENUE_LEDGER_LABEL: Record<VenueLedgerKind, string> = {
    BOOKING_CREDIT: "Turno jugado",
    SETTLEMENT: "Pago de la empresa",
};

/** "2026-10-01" -> "octubre 2026" */
export function formatPeriod(period: string): string {
    const [y, m] = period.split("-").map(Number);
    if (!y || !m) return period;
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Fecha y hora AR de un instante: "13 nov 2026, 8:45 pm" (formato único, lib/datetime). */
export const formatArDateTime = formatDateTimeAr;
