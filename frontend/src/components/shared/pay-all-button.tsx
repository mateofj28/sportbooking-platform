"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/react";
import { Wallet } from "@/components/icons";
import { useMarkBookingsPaid } from "@/hooks/use-bookings";
import { useMyBalance } from "@/hooks/use-wallet";
import { formatPoints } from "@/lib/points";
import { InsufficientBalance } from "@/components/shared/insufficient-balance";

/** Fechas pendientes que se pagan juntas. */
export interface PendingDate {
    id: string;
    total: number;
}

/**
 * "Pagar todo": paga de una vez todas las fechas pendientes de un turno fijo, con
 * confirmación (saldo antes y después). Todo o nada.
 */
export function PayAllButton({ dates }: { dates: PendingDate[] }) {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { data: balance = 0, isLoading } = useMyBalance();
    const payAll = useMarkBookingsPaid();
    const [error, setError] = useState<string | null>(null);

    const total = dates.reduce((s, d) => s + Math.round(Number(d.total) || 0), 0);
    const enough = balance >= total;
    if (dates.length < 2) return null; // con una sola fecha alcanza su botón "Pagar"

    const open = () => { setError(null); onOpen(); };

    return (
        <>
            <Button color="primary" startContent={<Wallet className="h-4 w-4" aria-hidden="true" />} onPress={open}>
                Pagar todo ({formatPoints(total)})
            </Button>

            <Modal isOpen={isOpen} onClose={() => !payAll.isPending && onClose()} size="sm" placement="center">
                <ModalContent>
                    <ModalHeader>Pagar todas las fechas</ModalHeader>
                    <ModalBody className="gap-3">
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between"><dt className="text-default-500">Fechas pendientes</dt><dd>{dates.length}</dd></div>
                            <div className="flex justify-between"><dt className="text-default-500">Total</dt><dd className="font-semibold">{formatPoints(total)}</dd></div>
                            <div className="flex justify-between"><dt className="text-default-500">Tu saldo</dt><dd>{isLoading ? "…" : formatPoints(balance)}</dd></div>
                            {enough && (
                                <div className="flex justify-between border-t border-divider pt-2">
                                    <dt className="text-default-500">Te quedan</dt><dd className="font-semibold">{formatPoints(balance - total)}</dd>
                                </div>
                            )}
                        </dl>
                        {!isLoading && !enough && <InsufficientBalance needed={total} available={balance} />}
                        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose} isDisabled={payAll.isPending}>Cancelar</Button>
                        <Button
                            color="primary"
                            isDisabled={isLoading || !enough}
                            isLoading={payAll.isPending}
                            onPress={() => payAll.mutate(
                                { ids: dates.map((d) => d.id), expectedTotal: total },
                                { onSuccess: onClose, onError: (e: Error) => setError(e.message) },
                            )}
                        >
                            Pagar {formatPoints(total)}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
}
