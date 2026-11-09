"use client";

import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { BadgeDollarSign } from "lucide-react";
import { useEffect, useState } from "react";
import { useMarkBookingPaid } from "@/hooks/use-bookings";
import { formatDateAr, formatTimeAr } from "@/lib/datetime";
import { useToastStore } from "@/stores/toast-store";

export interface MarkPaidTarget {
    id: string;
    startDatetime: string;
    clientName: string;
    facilityName: string;
    /** Monto a mostrar según el rol (base para el admin de sede, total para el general). */
    amountLabel: string;
}

interface MarkPaidModalProps {
    booking: MarkPaidTarget | null;
    onClose: () => void;
    onPaid?: () => void;
}

/**
 * Confirma que el complejo recibió el pago de una reserva impaga (turno fijo).
 * Edge Function mark-paid: idempotente y valida permisos (lo mío / lo ajeno).
 */
export function MarkPaidModal({ booking, onClose, onPaid }: MarkPaidModalProps) {
    const addToast = useToastStore((s) => s.addToast);
    const markPaid = useMarkBookingPaid();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { setError(null); }, [booking?.id]);

    const close = () => { if (!markPaid.isPending) onClose(); };

    const confirm = () => {
        if (!booking) return;
        markPaid.mutate(booking.id, {
            onSuccess: () => {
                addToast("Pago registrado");
                onPaid?.();
                onClose();
            },
            onError: (e: Error) => setError(e.message || "No se pudo registrar el pago"),
        });
    };

    return (
        <Modal isOpen={!!booking} onClose={close} size="md">
            <ModalContent>
                <ModalHeader className="flex items-center gap-2">
                    <BadgeDollarSign className="h-5 w-5 text-success" />
                    Marcar como pagada
                </ModalHeader>
                <ModalBody className="gap-3">
                    {booking && (
                        <p className="text-sm text-default-600">
                            ¿Confirmás que se recibió el pago de <strong>{booking.amountLabel}</strong> de{" "}
                            <strong>{booking.clientName}</strong> por <strong>{booking.facilityName}</strong> del{" "}
                            {formatDateAr(booking.startDatetime, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}{" "}
                            a las {formatTimeAr(booking.startDatetime)}?
                        </p>
                    )}
                    <p className="text-xs text-default-400">
                        Al registrar el pago, el turno ya no se cancela automáticamente por falta de pago.
                    </p>
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={close} isDisabled={markPaid.isPending}>Volver</Button>
                    <Button color="success" onPress={confirm} isLoading={markPaid.isPending}>
                        Sí, registrar pago
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
