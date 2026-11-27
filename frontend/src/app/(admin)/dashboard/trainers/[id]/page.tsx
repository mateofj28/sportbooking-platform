"use client";

// Detalle de un entrenador (solo admin general): perfil, franjas con su comisión, bloqueos
// y suspensión. La comisión por franja solo la cambia el admin general (spec entrenadores, Etapa 1).
import {
    Button, Card, CardBody, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
    Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow, Textarea, useDisclosure,
} from "@heroui/react";
import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeftIcon, ExclamationTriangleIcon, PencilIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/shared/data-table";
import { Credits } from "@/components/trainer/credits";
import { useAdminTrainerDetail, useSetSlotCommission, useSetTrainerStatus, type TrainerSlot } from "@/hooks/use-trainer";
import { formatDateAr, formatDateTimeAr } from "@/lib/datetime";
import { durationsLabel, finalRate, slotRangeLabel, sortSlots, TRAINER_LIMITS, TRAINER_STATUS_META, WEEKDAYS } from "@/lib/trainers";
import { slotCommissionSchema, suspendReasonSchema } from "@/lib/validations/trainer.schema";
import { useToastStore } from "@/stores/toast-store";

function dayLabel(ymd: string): string {
    return formatDateAr(`${ymd}T12:00:00-03:00`, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function AdminTrainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data: t, isLoading, error } = useAdminTrainerDetail(id);
    const setStatus = useSetTrainerStatus();
    const setCommission = useSetSlotCommission();
    const addToast = useToastStore((s) => s.addToast);

    const statusModal = useDisclosure();
    const [reason, setReason] = useState("");
    const [reasonError, setReasonError] = useState<string | null>(null);

    const commissionModal = useDisclosure();
    const [slot, setSlot] = useState<TrainerSlot | null>(null);
    const [percent, setPercent] = useState("");
    const [percentError, setPercentError] = useState<string | null>(null);

    if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
    if (error || !t) {
        return (
            <div className="space-y-3">
                <p className="text-sm text-danger">{error?.message || "No encontramos este entrenador."}</p>
                <Button as={Link} href="/dashboard/trainers" variant="bordered">Volver a Entrenadores</Button>
            </div>
        );
    }

    const meta = TRAINER_STATUS_META[t.status];
    const suspended = t.status === "SUSPENDED";
    const slots = sortSlots(t.slots);

    const onStatus = () => {
        let r: string | null = null;
        if (!suspended) {
            const parsed = suspendReasonSchema.safeParse(reason);
            if (!parsed.success) { setReasonError(parsed.error.issues[0].message); return; }
            r = parsed.data;
        }
        setReasonError(null);
        setStatus.mutate({ trainerId: t.trainerId, suspend: !suspended, reason: r }, {
            onSuccess: () => {
                statusModal.onClose();
                addToast(suspended ? "Entrenador reactivado: quedó en borrador hasta que publique" : "Entrenador suspendido");
            },
            onError: (e) => addToast(e.message),
        });
    };

    const openCommission = (s: TrainerSlot) => {
        setSlot(s);
        setPercent(String(Number(s.commissionPercent)));
        setPercentError(null);
        commissionModal.onOpen();
    };
    const pctNumber = percent.trim() === "" ? NaN : Number(percent.replace(",", "."));
    const onCommission = () => {
        if (!slot) return;
        const parsed = slotCommissionSchema.safeParse(pctNumber);
        if (!parsed.success) { setPercentError(parsed.error.issues[0].message); return; }
        // numeric(5,2) en la base: hasta 2 decimales
        const value = Math.round(parsed.data * 100) / 100;
        setPercentError(null);
        setCommission.mutate({ slotId: slot.id, percent: value }, {
            onSuccess: () => { commissionModal.onClose(); addToast("Comisión actualizada"); },
            onError: (e) => addToast(e.message),
        });
    };

    return (
        <div className="space-y-6">
            <Button as={Link} href="/dashboard/trainers" variant="light" size="sm" startContent={<ArrowLeftIcon className="h-4 w-4" />}>
                Entrenadores
            </Button>

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold">{t.firstName} {t.lastName}</h1>
                        <Chip size="sm" variant="flat" color={meta.color}>{meta.label}</Chip>
                    </div>
                    <p className="text-sm text-default-500 mt-1">
                        {t.email} · {t.phone || "sin teléfono"} · DNI {t.dni || "—"}
                    </p>
                    <p className="text-xs text-default-500 mt-0.5">
                        Alta {formatDateTimeAr(t.createdAt)}{t.publishedAt ? ` · Publicado por primera vez ${formatDateTimeAr(t.publishedAt)}` : ""}
                    </p>
                    {t.role !== "TRAINER" && <p className="text-xs text-warning mt-1">Esta cuenta ya no tiene rol de entrenador.</p>}
                    {!t.isActive && <p className="text-xs text-danger mt-1">La cuenta está desactivada.</p>}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button as={Link} href={`/dashboard/classes?trainer=${t.trainerId}`} variant="bordered" className="w-full sm:w-auto">
                        Ver clases
                    </Button>
                    <Button color={suspended ? "primary" : "danger"} variant={suspended ? "solid" : "flat"} className="w-full sm:w-auto"
                        onPress={() => { setReason(""); setReasonError(null); statusModal.onOpen(); }}>
                        {suspended ? "Reactivar" : "Suspender"}
                    </Button>
                </div>
            </div>

            {suspended && (
                <div role="alert" className="flex gap-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger">
                    <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
                    <p>Suspendido {t.suspendedAt ? formatDateTimeAr(t.suspendedAt) : ""}. Motivo: {t.suspendedReason}. Los clientes no lo ven.</p>
                </div>
            )}
            {t.status === "DRAFT" && t.publishProblems.length > 0 && (
                <div className="rounded-lg bg-warning-50 px-4 py-3 text-sm">
                    <p className="font-semibold">Le falta para publicar:</p>
                    <ul className="mt-1 list-disc pl-5 text-default-600">
                        {t.publishProblems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                </div>
            )}

            <Card shadow="none" className="bg-content1">
                <CardBody className="gap-3 p-5 text-sm">
                    <div>
                        <p className="text-xs text-default-500">Descripción</p>
                        <p>{t.bio || "—"}</p>
                    </div>
                    <div>
                        <p className="text-xs text-default-500">Experiencia</p>
                        <p className="whitespace-pre-line">{t.experience || "—"}</p>
                    </div>
                    <div>
                        <p className="text-xs text-default-500 mb-1">Deportes</p>
                        <div className="flex flex-wrap gap-1">
                            {t.sports.length === 0 && "—"}
                            {t.sports.map((s) => (
                                <Chip key={s.id} size="sm" variant="flat">
                                    {s.name} · {durationsLabel(s.durations)} · {(s.maxStudents ?? 1) > 1 ? `hasta ${s.maxStudents}` : "individual"}
                                </Chip>
                            ))}
                        </div>
                    </div>
                </CardBody>
            </Card>

            <section className="space-y-2">
                <h2 className="text-lg font-semibold">Franjas semanales</h2>
                <DataTable aria-label="Franjas del entrenador">
                    <TableHeader>
                        <TableColumn>DÍA</TableColumn>
                        <TableColumn>HORARIO</TableColumn>
                        <TableColumn>LUGAR</TableColumn>
                        <TableColumn>DEPORTES</TableColumn>
                        <TableColumn>INDIVIDUAL</TableColumn>
                        <TableColumn>GRUPAL</TableColumn>
                        <TableColumn>COMISIÓN</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Todavía no cargó franjas">
                        {slots.map((s) => (
                            <TableRow key={s.id}>
                                <TableCell className="font-medium">{WEEKDAYS[s.dayOfWeek]}</TableCell>
                                <TableCell>{slotRangeLabel(s)}</TableCell>
                                <TableCell className="max-w-[220px] truncate" title={s.location}>{s.location}</TableCell>
                                <TableCell>{s.sports.map((x) => x.name).join(", ")}</TableCell>
                                <TableCell>
                                    <Credits amount={s.rateIndividual} />
                                    <p className="text-xs text-default-500">cliente paga <Credits amount={s.finalIndividual} /></p>
                                </TableCell>
                                <TableCell>
                                    {s.rateGroup != null ? (
                                        <>
                                            <Credits amount={s.rateGroup} />
                                            <p className="text-xs text-default-500">cliente paga <Credits amount={s.finalGroup ?? 0} /></p>
                                        </>
                                    ) : "—"}
                                </TableCell>
                                <TableCell>
                                    <Button size="sm" variant="light" color="primary" endContent={<PencilIcon className="h-3.5 w-3.5" />}
                                        onPress={() => openCommission(s)} aria-label={`Cambiar comisión (${Number(s.commissionPercent)}%)`}>
                                        {Number(s.commissionPercent)}%
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
                <p className="text-xs text-default-500">
                    Tarifas por hora. La comisión se suma a la tarifa del entrenador; él la ve pero no la puede cambiar.
                    Una franja nueva toma la comisión de la franja modificada más recientemente (10% si es la primera).
                </p>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-semibold">Bloqueos</h2>
                <DataTable aria-label="Bloqueos del entrenador">
                    <TableHeader>
                        <TableColumn>DESDE</TableColumn>
                        <TableColumn>HASTA</TableColumn>
                        <TableColumn>MOTIVO</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Sin días bloqueados">
                        {t.blocks.map((b) => (
                            <TableRow key={b.id}>
                                <TableCell>{dayLabel(b.startDate)}</TableCell>
                                <TableCell>{dayLabel(b.endDate)}</TableCell>
                                <TableCell>{b.reason || "—"}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </DataTable>
            </section>

            <Modal isOpen={statusModal.isOpen} onClose={statusModal.onClose} placement="center">
                <ModalContent>
                    <ModalHeader>{suspended ? "Reactivar entrenador" : "Suspender entrenador"}</ModalHeader>
                    <ModalBody className="gap-3">
                        {suspended ? (
                            <p className="text-sm">El perfil vuelve a borrador. El entrenador tiene que publicarlo de nuevo para que los clientes lo vean.</p>
                        ) : (
                            <>
                                <p className="text-sm">Los clientes dejan de verlo. El entrenador ve el motivo en su panel.</p>
                                <Textarea label="Motivo" variant="bordered" isRequired value={reason} onValueChange={setReason}
                                    maxLength={TRAINER_LIMITS.suspendReasonMax}
                                    isInvalid={!!reasonError} errorMessage={reasonError} />
                            </>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={statusModal.onClose}>Cancelar</Button>
                        <Button color={suspended ? "primary" : "danger"} isLoading={setStatus.isPending} onPress={onStatus}>
                            {suspended ? "Reactivar" : "Suspender"}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal isOpen={commissionModal.isOpen} onClose={commissionModal.onClose} placement="center">
                <ModalContent>
                    <ModalHeader>Comisión de la franja</ModalHeader>
                    <ModalBody className="gap-3">
                        {slot && (
                            <p className="text-sm text-default-600">{WEEKDAYS[slot.dayOfWeek]} {slotRangeLabel(slot)} · {slot.location}</p>
                        )}
                        <Input type="number" label="Comisión" variant="bordered" min={1} max={100} step="0.01"
                            value={percent} onValueChange={setPercent}
                            endContent={<span className="text-sm text-default-400">%</span>}
                            isInvalid={!!percentError} errorMessage={percentError} />
                        {slot && Number.isFinite(pctNumber) && pctNumber >= 1 && pctNumber <= 100 && (
                            <p className="text-sm text-default-600">
                                El cliente pagaría <Credits amount={finalRate(slot.rateIndividual, pctNumber)} /> por hora individual
                                {slot.rateGroup != null && <> y <Credits amount={finalRate(slot.rateGroup, pctNumber)} /> por hora grupal</>}.
                            </p>
                        )}
                        <p className="text-xs text-default-500">Las clases ya pagadas mantienen su precio.</p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={commissionModal.onClose}>Cancelar</Button>
                        <Button color="primary" isLoading={setCommission.isPending} onPress={onCommission}>Guardar</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
