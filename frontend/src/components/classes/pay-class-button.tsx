"use client";

// Pagar fechas pendientes de una clase fija con créditos ("Pagar" / "Pagar todo").
// Todo o nada; si el precio cambió mientras el cliente miraba, no se cobra.
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/react";
import { useState } from "react";
import { InsufficientBalance } from "@/components/shared/insufficient-balance";
import { usePayClassBookings } from "@/hooks/use-classes";
import { useMyBalance } from "@/hooks/use-wallet";
import { formatPoints } from "@/lib/points";
import { useToastStore } from "@/stores/toast-store";

export function PayClassButton({ dates, label }: { dates: { id: string; total: number }[]; label?: string }) {
    const modal = useDisclosure();
    const pay = usePayClassBookings();
    const { data: balance = 0, isLoading } = useMyBalance();
    const addToast = useToastStore((s) => s.addToast);
    const [error, setError] = useState<string | null>(null);
    if (dates.length === 0) return null;

    const total = dates.reduce((s, d) => s + Math.round(Number(d.total)), 0);
    const enough = balance >= total;
    const many = dates.length > 1;

    const onPay = () => {
        setError(null);
        pay.mutate({ ids: dates.map((d) => d.id), expectedTotal: total }, {
            onSuccess: (r) => { modal.onClose(); addToast(`Pagaste ${r.paidCount} fecha${r.paidCount === 1 ? "" : "s"} con tus créditos`); },
            onError: (e) => setError(e.message),
        });
    };

    return (
        <>
            <Button size="sm" color="primary" variant={many ? "flat" : "solid"} onPress={() => { setError(null); modal.onOpen(); }}>
                {label ?? (many ? `Pagar todo (${dates.length})` : "Pagar")}
            </Button>
            <Modal isOpen={modal.isOpen} onClose={modal.onClose} placement="center">
                <ModalContent>
                    <ModalHeader>{many ? `Pagar ${dates.length} fechas` : "Pagar la clase"}</ModalHeader>
                    <ModalBody className="gap-3">
                        <dl className="space-y-1 rounded-xl border border-divider p-3 text-sm">
                            <div className="flex justify-between"><dt className="text-default-500">Total</dt><dd className="font-semibold">{formatPoints(total)}</dd></div>
                            <div className="flex justify-between"><dt className="text-default-500">Tu saldo</dt><dd>{isLoading ? "…" : formatPoints(balance)}</dd></div>
                            {enough && !isLoading && (
                                <div className="flex justify-between border-t border-divider pt-1"><dt className="text-default-500">Te quedan</dt><dd>{formatPoints(balance - total)}</dd></div>
                            )}
                        </dl>
                        {!isLoading && !enough && <InsufficientBalance needed={total} available={balance} />}
                        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={modal.onClose}>Volver</Button>
                        <Button color="primary" isLoading={pay.isPending} isDisabled={isLoading || !enough} onPress={onPay}>
                            Pagar {formatPoints(total)}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
}
