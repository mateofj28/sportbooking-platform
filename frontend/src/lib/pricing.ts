import type { Pricing } from "@/types";

/**
 * Fuente única de verdad para calcular precios de cara al cliente.
 *
 * REGLA DEL NEGOCIO: el precio que paga el cliente SIEMPRE es
 *   precio base + comisión de servicio (profitPercent %).
 *
 * Usar estas funciones en TODA vista del cliente que muestre un precio,
 * para no volver a mostrar el base sin la comisión.
 */

/** Comisión en pesos de una tarifa para una duración dada (en horas). */
export function commissionFor(pricing: Pick<Pricing, "pricePerHour" | "profitPercent">, hours = 1): number {
    const base = Number(pricing.pricePerHour) * hours;
    const pct = Number(pricing.profitPercent) || 0;
    return base * (pct / 100);
}

/**
 * Precio FINAL por hora que paga el cliente (base + comisión).
 * Este es el valor que debe mostrarse en chips de tarifas, "desde $X/hr", etc.
 */
export function finalPricePerHour(pricing: Pick<Pricing, "pricePerHour" | "profitPercent">): number {
    return Number(pricing.pricePerHour) + commissionFor(pricing, 1);
}

/** Precio FINAL para una reserva de cierta duración (en minutos). */
export function finalPriceForDuration(
    pricing: Pick<Pricing, "pricePerHour" | "profitPercent">,
    durationMinutes: number,
): number {
    const hours = durationMinutes / 60;
    return Number(pricing.pricePerHour) * hours + commissionFor(pricing, hours);
}

/** 25000 -> "25,000" (separador de miles con coma). */
export function formatPrice(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}
