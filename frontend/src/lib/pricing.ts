import type { Pricing } from "@/types";

/**
 * Fuente única de verdad para calcular precios de cara al cliente.
 *
 * REGLA DEL NEGOCIO: la tarifa define el PRECIO DEL TURNO (fijo), sin importar
 * cuántos minutos u horas dure la reserva. El cliente paga:
 *   precio del turno + comisión de servicio (profitPercent %).
 *
 * NOTA: la columna se llama `pricePerHour` por histórico, pero su valor
 * representa el precio del turno completo.
 *
 * Usar estas funciones en TODA vista del cliente que muestre un precio.
 */

/** Comisión en pesos de una tarifa (sobre el precio del turno). */
export function commissionFor(pricing: Pick<Pricing, "pricePerHour" | "profitPercent">): number {
    const base = Number(pricing.pricePerHour);
    const pct = Number(pricing.profitPercent) || 0;
    return base * (pct / 100);
}

/**
 * Precio FINAL del turno que paga el cliente (precio del turno + comisión).
 * Este es el valor que debe mostrarse en chips de tarifas, "desde $X", etc.
 */
export function finalPricePerTurn(pricing: Pick<Pricing, "pricePerHour" | "profitPercent">): number {
    return Number(pricing.pricePerHour) + commissionFor(pricing);
}

/**
 * Precio FINAL de una reserva. La duración NO afecta el precio: la tarifa es
 * por turno. Se mantiene la firma con duración por compatibilidad, pero se ignora.
 */
export function finalPriceForDuration(
    pricing: Pick<Pricing, "pricePerHour" | "profitPercent">,
    _durationMinutes?: number,
): number {
    return finalPricePerTurn(pricing);
}

/** Alias histórico: antes era "por hora", ahora es por turno. */
export const finalPricePerHour = finalPricePerTurn;

/** 25000 -> "25,000" (separador de miles con coma). */
export function formatPrice(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}
