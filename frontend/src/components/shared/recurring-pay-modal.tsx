"use client";

import { useEffect, useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Radio, RadioGroup } from "@heroui/react";
import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { RecurringPayMode } from "@/hooks/use-bookings";
import { InsufficientBalance } from "@/components/shared/insufficient-balance";
import { formatPoints } from "@/lib/points";

interface RecurringPayModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Precio de cada fecha (créditos). */
    pricePerDate: number;
    /** Cantidad de fechas que se intentan crear (8). */
    dates: number;
    balance: number;
    /** La primera fecha empieza en menos de 24 h (no se podrá cancelar). */
    firstWithin24h: boolean;
    isLoading: boolean;
    /** Error del servidor (ej. el saldo cambió en otra pestaña). */
    error?: string | null;
    onConfirm: (mode: RecurringPayMode) => void;
    /** Cómo se llama lo que se crea (por defecto "turno fijo"; en clases, "clase fija"). */
    noun?: string;
    /** Género de `noun` para armar las frases. */
    feminine?: boolean;
}

/**
 * Al crear un turno fijo: pagar todas las fechas ahora, pagar solo la próxima, o solo
 * crearlas y pagar cada una después. El cobro es todo o nada con el turno (create-recurring).
 */
export function RecurringPayModal({
    isOpen, onClose, pricePerDate, dates, balance, firstWithin24h, isLoading, error, onConfirm, noun = "turno fijo", feminine = false,
}: RecurringPayModalProps) {
    const [mode, setMode] = useState<RecurringPayMode>("NEXT");
    const price = Math.round(pricePerDate);
    const totalAll = price * dates;
    const needed = mode === "ALL" ? totalAll : mode === "NEXT" ? price : 0;
    const enough = balance >= needed;

    // Al abrir: la opción más alta que alcance con el saldo
    useEffect(() => {
        if (!isOpen) return;
        setMode(balance >= totalAll ? "ALL" : balance >= price ? "NEXT" : "NONE");
    }, [isOpen, balance, totalAll, price]);

    return (
        <Modal isOpen={isOpen} onClose={() => !isLoading && onClose()} size="md" placement="center" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader>¿Cómo querés pagar {feminine ? "la" : "el"} {noun}?</ModalHeader>
                <ModalBody className="gap-4">
                    <RadioGroup aria-label={`Forma de pago ${feminine ? "de la" : "del"} ${noun}`} value={mode} onValueChange={(v) => setMode(v as RecurringPayMode)}>
                        <Radio value="ALL" isDisabled={balance < totalAll}
                            description={`${formatPoints(totalAll)} por las ${dates} fechas${balance < totalAll ? " · no te alcanza el saldo" : ""}`}>
                            Pagar todo ahora
                        </Radio>
                        <Radio value="NEXT" isDisabled={balance < price}
                            description={`${formatPoints(price)} · las demás las pagás después${balance < price ? " · no te alcanza el saldo" : ""}`}>
                            Pagar solo la próxima fecha
                        </Radio>
                        <Radio value="NONE"
                            description="Pagás cada fecha desde «Mis reservas», hasta 24 h antes. Si no la pagás, se cancela sola.">
                            Solo crear las fechas
                        </Radio>
                    </RadioGroup>

                    <dl className="space-y-1 rounded-xl border border-divider p-3 text-sm">
                        <div className="flex justify-between"><dt className="text-default-500">Tu saldo</dt><dd>{formatPoints(balance)}</dd></div>
                        <div className="flex justify-between"><dt className="text-default-500">Se cobra ahora</dt><dd className="font-semibold">{formatPoints(needed)}</dd></div>
                        {needed > 0 && enough && (
                            <div className="flex justify-between border-t border-divider pt-1"><dt className="text-default-500">Te quedan</dt><dd>{formatPoints(balance - needed)}</dd></div>
                        )}
                    </dl>
                    {mode === "ALL" && (
                        <p className="text-xs text-default-400">Si alguna fecha no está disponible, no se crea ni se cobra.</p>
                    )}
                    {balance < price && <InsufficientBalance needed={price} available={balance} />}

                    {firstWithin24h && (
                        <div className="flex items-start gap-2 rounded-lg bg-warning-50 p-3 text-xs text-warning-700">
                            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                            La primera fecha empieza en menos de 24 horas: no vas a poder cancelarla. Las demás sí.
                        </div>
                    )}
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose} isDisabled={isLoading}>Volver</Button>
                    <Button color="primary" startContent={isLoading ? undefined : <CheckIcon className="h-4 w-4" />}
                        isDisabled={!enough} isLoading={isLoading} onPress={() => onConfirm(mode)}>
                        {mode === "NONE" ? `Crear ${noun}` : `Crear y pagar ${formatPoints(needed)}`}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
