"use client";

// Franjas semanales de disponibilidad del entrenador (spec entrenadores, Etapa 1).
// Horas en punto; una franja puede cruzar la medianoche. La comisión la define la
// administración: acá se ve en solo lectura junto con el precio final que paga el cliente.
import {
    Button, Checkbox, CheckboxGroup, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
    Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { PointsInput } from "@/components/shared/points-input";
import { Credits } from "@/components/trainer/credits";
import { useDeleteTrainerSlot, useMyTrainerPanel, useSaveTrainerSlot, type TrainerSlot } from "@/hooks/use-trainer";
import { finalRate, hasGroupSports, slotHours, slotRangeLabel, sortSlots, TRAINER_LIMITS, WEEKDAYS, WHOLE_HOURS } from "@/lib/trainers";
import { trainerSlotSchema } from "@/lib/validations/trainer.schema";
import { useToastStore } from "@/stores/toast-store";

interface SlotForm {
    id: string | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    location: string;
    rateIndividual: number | null;
    rateGroup: number | null;
    sportIds: string[];
}

const EMPTY: SlotForm = { id: null, dayOfWeek: 0, startTime: "18:00", endTime: "20:00", location: "", rateIndividual: null, rateGroup: null, sportIds: [] };

export default function TrainerAvailabilityPage() {
    const { data: panel, isLoading } = useMyTrainerPanel();
    const save = useSaveTrainerSlot();
    const remove = useDeleteTrainerSlot();
    const addToast = useToastStore((s) => s.addToast);
    const modal = useDisclosure();
    const [form, setForm] = useState<SlotForm>(EMPTY);
    const [editing, setEditing] = useState<TrainerSlot | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const slots = useMemo(() => sortSlots(panel?.slots ?? []), [panel]);
    const selectedSports = (panel?.sports ?? []).filter((s) => form.sportIds.includes(s.id));
    const needsGroup = hasGroupSports(selectedSports);

    if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
    if (!panel) return <p className="text-sm text-danger">No pudimos cargar tu disponibilidad. Probá recargar la página.</p>;

    const openNew = () => {
        setEditing(null);
        setForm({ ...EMPTY, sportIds: panel.sports.length === 1 ? [panel.sports[0].id] : [] });
        setErrors({});
        modal.onOpen();
    };
    const openEdit = (s: TrainerSlot) => {
        setEditing(s);
        setForm({
            id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, location: s.location,
            rateIndividual: s.rateIndividual, rateGroup: s.rateGroup, sportIds: s.sports.map((x) => x.id),
        });
        setErrors({});
        modal.onOpen();
    };

    const onSave = () => {
        const parsed = trainerSlotSchema(needsGroup).safeParse({ ...form, rateGroup: needsGroup ? form.rateGroup : null });
        if (!parsed.success) {
            const e: Record<string, string> = {};
            for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
            setErrors(e);
            return;
        }
        setErrors({});
        save.mutate({ ...parsed.data, id: form.id, rateGroup: parsed.data.rateGroup ?? null }, {
            onSuccess: () => { modal.onClose(); addToast(form.id ? "Franja actualizada" : "Franja agregada"); },
            onError: (e) => addToast(e.message),
        });
    };

    const set = <K extends keyof SlotForm>(k: K, v: SlotForm[K]) => setForm((f) => ({ ...f, [k]: v }));
    const pct = editing?.commissionPercent;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Disponibilidad</h1>
                    <p className="text-sm text-default-500 mt-1">Tus franjas de cada semana. Los clientes reservan clases dentro de ellas.</p>
                </div>
                <Button color="primary" className="w-full sm:w-auto" startContent={<PlusIcon className="h-4 w-4" />}
                    onPress={openNew} isDisabled={panel.sports.length === 0}>
                    Nueva franja
                </Button>
            </div>

            {panel.sports.length === 0 && (
                <p className="text-sm text-warning">
                    Primero elegí tus deportes en <Link href="/dashboard/trainer/profile" className="text-primary underline">Mi perfil de entrenador</Link>.
                </p>
            )}

            <DataTable aria-label="Franjas de disponibilidad">
                <TableHeader>
                    <TableColumn>DÍA</TableColumn>
                    <TableColumn>HORARIO</TableColumn>
                    <TableColumn>LUGAR</TableColumn>
                    <TableColumn>DEPORTES</TableColumn>
                    <TableColumn>TARIFA INDIVIDUAL</TableColumn>
                    <TableColumn>TARIFA GRUPAL</TableColumn>
                    <TableColumn>COMISIÓN</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="Todavía no cargaste franjas">
                    {slots.map((s) => (
                        <TableRow key={s.id}>
                            <TableCell className="font-medium">{WEEKDAYS[s.dayOfWeek]}</TableCell>
                            <TableCell>{slotRangeLabel(s)} <span className="text-xs text-default-400">({slotHours(s)} h)</span></TableCell>
                            <TableCell className="max-w-[220px] truncate" title={s.location}>{s.location}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-1">
                                    {s.sports.map((sp) => <Chip key={sp.id} size="sm" variant="flat">{sp.name}</Chip>)}
                                </div>
                            </TableCell>
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
                            <TableCell>{Number(s.commissionPercent)}%</TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button size="sm" variant="light" color="primary" isIconOnly title="Editar" onPress={() => openEdit(s)}>
                                        <PencilIcon className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="light" color="danger" isIconOnly title="Eliminar" onPress={() => setDeleteId(s.id)}>
                                        <TrashIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>
            <p className="text-xs text-default-500">
                Las tarifas son por hora de clase. La comisión de cada franja la define la administración y se suma a tu tarifa.
            </p>

            <Modal isOpen={modal.isOpen} onClose={modal.onClose} size="2xl" scrollBehavior="inside" placement="center">
                <ModalContent>
                    <ModalHeader>{form.id ? "Editar franja" : "Nueva franja"}</ModalHeader>
                    <ModalBody className="gap-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <Select label="Día" variant="bordered" disallowEmptySelection
                                selectedKeys={[String(form.dayOfWeek)]}
                                onSelectionChange={(k: any) => set("dayOfWeek", Number(Array.from(k)[0]))}>
                                {WEEKDAYS.map((d, i) => <SelectItem key={String(i)}>{d}</SelectItem>)}
                            </Select>
                            <Select label="Desde" variant="bordered" disallowEmptySelection
                                selectedKeys={[form.startTime]}
                                onSelectionChange={(k: any) => set("startTime", String(Array.from(k)[0]))}>
                                {WHOLE_HOURS.map((h) => <SelectItem key={h}>{h}</SelectItem>)}
                            </Select>
                            <Select label="Hasta" variant="bordered" disallowEmptySelection
                                selectedKeys={[form.endTime]}
                                onSelectionChange={(k: any) => set("endTime", String(Array.from(k)[0]))}
                                isInvalid={!!errors.endTime} errorMessage={errors.endTime}
                                description={form.endTime < form.startTime ? "Termina al día siguiente" : undefined}>
                                {WHOLE_HOURS.map((h) => <SelectItem key={h}>{h}</SelectItem>)}
                            </Select>
                        </div>

                        <Input label="Lugar" variant="bordered" value={form.location} maxLength={TRAINER_LIMITS.location}
                            onValueChange={(v) => set("location", v)}
                            description="Dirección o nombre del lugar donde das la clase"
                            isInvalid={!!errors.location} errorMessage={errors.location} />

                        <CheckboxGroup label="Deportes en esta franja" orientation="horizontal"
                            value={form.sportIds} onValueChange={(v) => set("sportIds", v)}
                            isInvalid={!!errors.sportIds} errorMessage={errors.sportIds}>
                            {panel.sports.map((s) => (
                                <Checkbox key={s.id} value={s.id}>
                                    {s.name} <span className="text-xs text-default-500">({(s.maxStudents ?? 1) > 1 ? `grupal hasta ${s.maxStudents}` : "individual"})</span>
                                </Checkbox>
                            ))}
                        </CheckboxGroup>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <PointsInput label="Tarifa individual por hora" value={form.rateIndividual} max={TRAINER_LIMITS.rateMax}
                                onChange={(v) => set("rateIndividual", v)} isRequired
                                isInvalid={!!errors.rateIndividual} errorMessage={errors.rateIndividual} />
                            {needsGroup && (
                                <PointsInput label="Tarifa grupal por hora (por alumno)" value={form.rateGroup} max={TRAINER_LIMITS.rateMax}
                                    onChange={(v) => set("rateGroup", v)} isRequired
                                    isInvalid={!!errors.rateGroup} errorMessage={errors.rateGroup} />
                            )}
                        </div>

                        <div className="rounded-lg bg-default-100 px-4 py-3 text-sm">
                            {pct != null ? (
                                <>
                                    <p>Comisión de la administración: <strong>{Number(pct)}%</strong> (no la podés cambiar).</p>
                                    {form.rateIndividual != null && (
                                        <p className="text-default-600 mt-1">
                                            El cliente paga <Credits amount={finalRate(form.rateIndividual, Number(pct))} /> por hora individual
                                            {needsGroup && form.rateGroup != null && <> y <Credits amount={finalRate(form.rateGroup, Number(pct))} /> por hora grupal</>}.
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p>La comisión la define la administración y se suma a tu tarifa. Vas a ver el precio final al guardar.</p>
                            )}
                        </div>
                        {form.id && (
                            <p className="text-xs text-default-500">
                                Las clases ya pagadas no cambian. Las fechas sin pagar de clases fijas (a más de 24 h) toman la tarifa,
                                el lugar y el horario nuevos, manteniendo su lugar dentro de la franja; si ya no entran, se cancelan solas.
                                Al alumno le avisamos por email.
                            </p>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={modal.onClose}>Cancelar</Button>
                        <Button color="primary" isLoading={save.isPending} onPress={onSave}>Guardar</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => deleteId && remove.mutate(deleteId, {
                    onSuccess: () => { setDeleteId(null); addToast("Franja eliminada"); },
                    onError: (e) => { setDeleteId(null); addToast(e.message); },
                })}
                title="Eliminar franja"
                message="¿Seguro que querés eliminar esta franja? Las clases ya pagadas se mantienen; las fechas sin pagar de clases fijas se cancelan. Si era la única franja, tu perfil vuelve a borrador."
                confirmLabel="Eliminar"
                isLoading={remove.isPending}
            />
        </div>
    );
}
