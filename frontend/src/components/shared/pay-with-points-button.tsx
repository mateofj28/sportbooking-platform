"use client";

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/react";
import { Wallet } from "lucide-react";
import { useMarkBookingPaid } from "@/hooks/use-bookings";
import { useMyBalance } from "@/hooks/use-wallet";
import { formatPoints } from "@/lib/points";
import { InsufficientBalance } from "@/components/shared/insufficient-balance";

interface PayWithPointsButtonProps {
    bookingId: string;
    /** Precio que ve el cliente; si cambió en el servidor, el pago se rechaza (409). */
    total: number;
    size?: "sm" | "md" | "lg";
    fullWidth?: boolean;
    /** Texto del botón; por defecto "Pagar X pts". */
    label?: string;
}

/**
 * "Pagar con puntos" para reservas pendientes (turno fijo o reserva manual de un admin).
 * Confirma mostrando el saldo antes y después; si no alcanza, muestra el aviso con WhatsApp.
 */
export function PayWithPointsButton({ bookingId, total, size = "sm", fullWidth, label }: PayWithPointsButtonProps) {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { data: balance = 0, isLoading } = useMyBalance();
    const markPaid = useMarkBookingPaid();
    const price = Math.round(Number(total) || 0);
    const enough = balance >= price;

    return (
        <>
            <Button
                size={size}
                fullWidth={fullWidth}
                color="primary"
                startContent={<Wallet className="h-4 w-4" aria-hidden="true" />}
                onPress={onOpen}
            >
                {label ?? `Pagar ${formatPoints(price)}`}
            </Button>

            <Modal isOpen={isOpen} onClose={onClose} size="sm" placement="center">
                <ModalContent>
                    <ModalHeader>Pagar con puntos</ModalHeader>
                    <ModalBody className="gap-3">
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-default-500">Precio</dt><dd className="font-semibold">{formatPoints(price)}</dd></div>
                            <div className="flex justify-between"><dt className="text-default-500">Tu saldo</dt><dd>{isLoading ? "…" : formatPoints(balance)}</dd></div>
                            {enough && (
                                <div className="flex justify-between border-t border-divider pt-2">
                                    <dt className="text-default-500">Te quedan</dt><dd className="font-semibold">{formatPoints(balance - price)}</dd>
                                </div>
                            )}
                        </dl>
                        {!isLoading && !enough && <InsufficientBalance needed={price} available={balance} />}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose}>Cancelar</Button>
                        <Button
                            color="primary"
                            isDisabled={isLoading || !enough}
                            isLoading={markPaid.isPending}
                            onPress={() => markPaid.mutate({ id: bookingId, expectedTotal: price }, { onSettled: onClose })}
                        >
                            Pagar {formatPoints(price)}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
}
