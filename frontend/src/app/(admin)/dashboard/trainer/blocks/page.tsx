"use client";

// Bloqueos del entrenador: días en los que no da clases (vacaciones, torneos…). Spec entrenadores, Etapa 1.
// Fechas en hora de Argentina: desde hoy y hasta 2 años hacia adelante (mismo límite que la base).
import {
    Button, DateRangePicker, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
    Spinner, TableBody, TableCell, TableColumn, TableHeader, TableRow, useDisclosure,
} from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useAddTrainerBlock, useDeleteTrainerBlock, useMyTrainerPanel } from "@/hooks/use-trainer";
import { addYearsToDate, todayAr } from "@/lib/ads";
import { formatDateAr } from "@/lib/datetime";
import { TRAINER_LIMITS } from "@/lib/trainers";
import { trainerBlockSchema } from "@/lib/validations/trainer.schema";
import { useToastStore } from "@/stores/toast-store";

/** "YYYY-MM-DD" → "lun 10 nov 2026" sin correr el día por la zona del navegador. */
function dayLabel(ymd: string): string {
    return formatDateAr(`${ymd}T12:00:00-03:00`, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function TrainerBlocksPage() {
    const { data: panel, isLoading } = useMyTrainerPanel();
    const add = useAddTrainerBlock();
    const remove = useDeleteTrainerBlock();
    const addToast = useToastStore((s) => s.addToast);
    const modal = useDisclosure();
    const [range, setRange] = useState<{ start: string; end: string } | null>(null);
    const [reason, setReason] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const today = todayAr();
    const maxDay = addYearsToDate(today, 2);
    const minDate = useMemo(() => parseDate(today), [today]);
    const maxDate = useMemo(() => parseDate(maxDay), [maxDay]);

    if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
    if (!panel) return <p className="text-sm text-danger">No pudimos cargar tus bloqueos. Probá recargar la página.</p>;

    const openNew = () => { setRange(null); setReason(""); setErrors({}); modal.onOpen(); };

    const onSave = () => {
        const parsed = trainerBlockSchema(today, maxDay).safeParse({ startDate: range?.start ?? "", endDate: range?.end ?? "", reason });
        if (!parsed.success) {
            const e: Record<string, string> = {};
            for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message;
            setErrors(e);
            return;
        }
        setErrors({});
        add.mutate(parsed.data, {
            onSuccess: () => { modal.onClose(); addToast("Bloqueo agregado"); },
            onError: (e) => addToast(e.message),
        });
    };

    const rangeError = errors.startDate || errors.endDate;
    const blocks = [...panel.blocks].sort((a, b) => a.startDate.localeCompare(b.startDate));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Bloqueos</h1>
                    <p className="text-sm text-default-500 mt-1">Días en los que no das clases. En esos días no se pueden reservar clases con vos.</p>
                </div>
                <Button color="primary" className="w-full sm:w-auto" startContent={<PlusIcon className="h-4 w-4" />} onPress={openNew}>
                    Nuevo bloqueo
                </Button>
            </div>

            <DataTable aria-label="Bloqueos">
                <TableHeader>
                    <TableColumn>DESDE</TableColumn>
                    <TableColumn>HASTA</TableColumn>
                    <TableColumn>MOTIVO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No tenés días bloqueados">
                    {blocks.map((b) => (
                        <TableRow key={b.id}>
                            <TableCell>{dayLabel(b.startDate)}</TableCell>
                            <TableCell>{dayLabel(b.endDate)}</TableCell>
                            <TableCell className="max-w-[260px] truncate" title={b.reason ?? ""}>{b.reason || "—"}</TableCell>
                            <TableCell>
                                <Button size="sm" variant="light" color="danger" isIconOnly title="Eliminar" onPress={() => setDeleteId(b.id)}>
                                    <TrashIcon className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>

            <Modal isOpen={modal.isOpen} onClose={modal.onClose} placement="center" scrollBehavior="inside">
                <ModalContent>
                    <ModalHeader>Nuevo bloqueo</ModalHeader>
                    <ModalBody className="gap-4">
                        <DateRangePicker
                            label="Días bloqueados"
                            variant="bordered"
                            showMonthAndYearPickers
                            // Cast: HeroUI trae su copia de @internationalized/date (mismo runtime)
                            minValue={minDate as any}
                            maxValue={maxDate as any}
                            value={range ? { start: parseDate(range.start), end: parseDate(range.end) } as any : null}
                            onChange={(v) => {
                                const r = v as { start: CalendarDate; end: CalendarDate } | null;
                                setRange(r ? { start: r.start.toString(), end: r.end.toString() } : null);
                            }}
                            isInvalid={!!rangeError}
                            errorMessage={rangeError}
                            description="Podés bloquear desde hoy y hasta 2 años hacia adelante"
                        />
                        <Input label="Motivo (opcional)" variant="bordered" value={reason} onValueChange={setReason}
                            maxLength={TRAINER_LIMITS.blockReason}
                            isInvalid={!!errors.reason} errorMessage={errors.reason} />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={modal.onClose}>Cancelar</Button>
                        <Button color="primary" isLoading={add.isPending} onPress={onSave}>Guardar</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => deleteId && remove.mutate(deleteId, {
                    onSuccess: () => { setDeleteId(null); addToast("Bloqueo eliminado"); },
                    onError: (e) => { setDeleteId(null); addToast(e.message); },
                })}
                title="Eliminar bloqueo"
                message="¿Seguro que querés eliminar este bloqueo? Esos días vuelven a estar disponibles."
                confirmLabel="Eliminar"
                isLoading={remove.isPending}
            />
        </div>
    );
}
