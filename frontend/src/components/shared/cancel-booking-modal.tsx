"use client";

import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea } from "@heroui/react";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useCancelBooking } from "@/hooks/use-bookings";
import { formatDateAr, formatTimeAr, formatDateShortAr } from "@/lib/datetime";
import { cancelBookingSchema, CANCEL_REASON_MAX } from "@/lib/validations/booking.schema";
import { useToastStore } from "@/stores/toast-store";
import { formatPoints } from "@/lib/points";

export interface CancelBookingTarget {
    id: string;
    startDatetime: string;
    clientName: string;
    facilityName: string;
    /** Puntos pagados (se devuelven al cancelar). 0 o sin valor = reserva pendiente. */
    paidPoints?: number;
}

interface CancelBookingModalProps {
    /** Reserva a cancelar; null = modal cerrado. */
    booking: CancelBookingTarget | null;
    onClose: () => void;
    onCancelled?: () => void;
}

/**
 * Confirmación de cancelación con motivo opcional (panel de administración).
 * La autorización la decide la Edge Function cancel-booking; si la rechaza
 * (ej. regla de 24 h en una reserva propia), su mensaje se muestra acá.
 */
export function CancelBookingModal({ booking, onClose, onCancelled }: CancelBookingModalProps) {
    const addToast = useToastStore((s) => s.addToast);
    const cancelBooking = useCancelBooking();
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Cada vez que se abre para otra reserva, arrancar limpio
    useEffect(() => {
        setReason("");
        setError(null);
    }, [booking?.id]);

    const close = () => { if (!cancelBooking.isPending) onClose(); };

    const confirm = () => {
        if (!booking) return;
        const parsed = cancelBookingSchema.safeParse({ reason });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Motivo inválido");
            return;
        }
        cancelBooking.mutate(
            { id: booking.id, reason: parsed.data.reason || undefined },
            {
                onSuccess: (res) => {
                    const refunded = Number(res?.refunded ?? 0);
                    addToast(refunded > 0 ? `Reserva cancelada. Se devolvieron ${formatPoints(refunded)} al cliente` : "Reserva cancelada");
                    onCancelled?.();
                    onClose();
                },
                onError: (e: Error) => setError(e.message || "No se pudo cancelar la reserva"),
            },
        );
    };

    return (
        <Modal isOpen={!!booking} onClose={close} size="md">
            <ModalContent>
                <ModalHeader className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Cancelar reserva
                </ModalHeader>
                <ModalBody className="gap-3">
                    {booking && (
                        <p className="text-sm text-default-600">
                            ¿Seguro que deseas cancelar la reserva de <strong>{booking.clientName}</strong> en{" "}
                            <strong>{booking.facilityName}</strong> del{" "}
                            {formatDateShortAr(booking.startDatetime)}{" "}
                            a las {formatTimeAr(booking.startDatetime)}? Esta acción no se puede deshacer.
                        </p>
                    )}
                    {booking && (booking.paidPoints ?? 0) > 0 && (
                        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                            Se le devuelven {formatPoints(booking.paidPoints ?? 0)} a {booking.clientName} (el 100% de lo pagado).
                        </p>
                    )}
                    <Textarea
                        label="Motivo (opcional)"
                        placeholder="Ej: mantenimiento de la cancha"
                        variant="bordered"
                        value={reason}
                        onValueChange={(v) => { setReason(v); setError(null); }}
                        maxLength={CANCEL_REASON_MAX}
                        description={`${reason.length}/${CANCEL_REASON_MAX}`}
                        minRows={2}
                    />
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={close} isDisabled={cancelBooking.isPending}>Volver</Button>
                    <Button color="danger" onPress={confirm} isLoading={cancelBooking.isPending}>
                        Sí, cancelar reserva
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}
