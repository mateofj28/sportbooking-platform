"use client";

// "Mis reservas" → Clases: las reservas de clase del propio usuario (Req. 7.8, 9.1).
import {
    Button, Card, CardBody, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Pagination, Spinner, Textarea,
} from "@heroui/react";
import Link from "next/link";
import { useState } from "react";
import { AcademicCapIcon, CalendarIcon, ClockIcon, MapPinIcon, UserIcon } from "@heroicons/react/24/outline";
import { useCancelClassBooking, useMyClassBookings, type MyClassBooking } from "@/hooks/use-classes";
import { serverNow } from "@/lib/clock";
import { formatDateAr, formatTimeAr } from "@/lib/datetime";
import { formatPoints } from "@/lib/points";
import { CANCELLED_BY_LABEL, classBookingChip } from "@/lib/trainers";
import { useToastStore } from "@/stores/toast-store";

const PAGE_SIZE = 20;

export function MyClassesTab() {
    const [scope, setScope] = useState<"UPCOMING" | "HISTORY">("UPCOMING");
    const [page, setPage] = useState(1);
    const { data, isLoading } = useMyClassBookings(scope, page, PAGE_SIZE);
    const cancel = useCancelClassBooking();
    const addToast = useToastStore((s) => s.addToast);
    const [toCancel, setToCancel] = useState<MyClassBooking | null>(null);
    const [reason, setReason] = useState("");
    const nowMs = serverNow();
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

    const onCancel = () => {
        if (!toCancel) return;
        cancel.mutate({ id: toCancel.id, reason }, {
            onSuccess: (r) => {
                setToCancel(null);
                setReason("");
                addToast(r.refunded > 0 ? `Clase cancelada. Te devolvimos ${formatPoints(r.refunded)}.` : "Clase cancelada");
            },
            onError: (e) => addToast(e.message),
        });
    };

    return (
        <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-3 pt-2" role="group" aria-label="Filtro de clases">
                {([["UPCOMING", "Próximas"], ["HISTORY", "Historial"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => { setScope(k); setPage(1); }}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium ${scope === k ? "bg-primary text-white" : "bg-default-100 text-default-600"}`}>
                        {label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (data?.items.length ?? 0) === 0 ? (
                <div className="py-12 text-center">
                    <AcademicCapIcon className="mx-auto h-12 w-12 text-default-300" />
                    <p className="mt-4 text-lg text-default-500">{scope === "UPCOMING" ? "No tenés clases próximas" : "Todavía no hay clases en tu historial"}</p>
                    <Button color="primary" variant="flat" className="mt-4" as={Link} href="/entrenadores">Ver entrenadores</Button>
                </div>
            ) : (
                data!.items.map((b) => {
                    const chip = classBookingChip(b, nowMs);
                    const c = b.class;
                    return (
                        <Card key={b.id} shadow="none" className="w-full bg-content1">
                            <CardBody className="flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="font-semibold">Clase de {c.sport.name}</h3>
                                        <Chip color={chip.color} size="sm" variant="flat">{chip.label}</Chip>
                                        <Chip size="sm" variant="flat">{c.isGroup ? `Grupal · ${c.taken}/${c.capacity}` : "Individual"}</Chip>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-default-500">
                                        <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />
                                            <Link href={`/entrenadores/${c.trainer.id}`} className="text-primary">{c.trainer.firstName} {c.trainer.lastName}</Link>
                                        </span>
                                        <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" />{formatDateAr(c.start)}</span>
                                        <span className="flex items-center gap-1"><ClockIcon className="h-3 w-3" />{formatTimeAr(c.start)} — {formatTimeAr(c.end)}</span>
                                        <span className="flex items-center gap-1"><MapPinIcon className="h-3 w-3" />{c.location}</span>
                                    </div>
                                    <p className="mt-1 text-sm font-medium">Total: {formatPoints(Number(b.totalPrice))}</p>
                                    {b.status === "CANCELLED" && (
                                        <p className="mt-1 text-xs text-default-500">
                                            La canceló {CANCELLED_BY_LABEL[b.cancelledByRole ?? ""] ?? "—"}
                                            {b.cancellationReason ? ` · Motivo: ${b.cancellationReason}` : ""}. Se devolvió el 100% a tu billetera.
                                        </p>
                                    )}
                                </div>
                                {b.status === "CONFIRMED" && new Date(c.end).getTime() > nowMs && (
                                    b.canCancel ? (
                                        <Button color="danger" variant="light" size="sm" onPress={() => setToCancel(b)}>Cancelar</Button>
                                    ) : (
                                        <p className="text-xs text-default-400 sm:max-w-[160px]">Faltan menos de 24 h: ya no se puede cancelar.</p>
                                    )
                                )}
                            </CardBody>
                        </Card>
                    );
                })
            )}

            {totalPages > 1 && (
                <div className="flex justify-center"><Pagination size="sm" showControls total={totalPages} page={page} onChange={setPage} /></div>
            )}

            <Modal isOpen={!!toCancel} onClose={() => setToCancel(null)} placement="center">
                <ModalContent>
                    <ModalHeader>Cancelar clase</ModalHeader>
                    <ModalBody>
                        <p className="text-default-600">¿Seguro que querés cancelar tu lugar en esta clase?</p>
                        {toCancel && (
                            <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                                Te devolvemos {formatPoints(Number(toCancel.totalPrice))} a tu billetera (el 100% de lo pagado).
                            </p>
                        )}
                        <Textarea label="Motivo (opcional)" variant="bordered" maxLength={300} value={reason} onValueChange={setReason} />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={() => setToCancel(null)}>Volver</Button>
                        <Button color="danger" isLoading={cancel.isPending} onPress={onCancel}>Cancelar clase</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
