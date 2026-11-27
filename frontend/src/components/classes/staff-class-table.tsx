"use client";

// Tabla de clases para el panel: "Mis clases" del entrenador y "Clases" del admin general.
// El detalle muestra los alumnos y permite cancelar un lugar o la clase entera (con motivo).
// El entrenador ve su tarifa (base); el admin general también la comisión y el total.
import {
    Button, Chip, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, TableBody, TableCell, TableColumn,
    TableHeader, TableRow, Textarea,
} from "@heroui/react";
import { useState } from "react";
import { EyeIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/shared/data-table";
import { Credits } from "@/components/trainer/credits";
import { useCancelClassBooking, useCancelTrainerClass, type ClassInfo, type ClassStudent } from "@/hooks/use-classes";
import { serverNow } from "@/lib/clock";
import { formatDateShortAr, formatTimeAr } from "@/lib/datetime";
import { CANCELLED_BY_LABEL, classChip } from "@/lib/trainers";
import { suspendReasonSchema } from "@/lib/validations/trainer.schema";
import { useToastStore } from "@/stores/toast-store";

type Target = { kind: "class"; cls: ClassInfo } | { kind: "student"; cls: ClassInfo; student: ClassStudent };

export function StaffClassTable({ items, view, emptyContent }: { items: ClassInfo[]; view: "TRAINER" | "ADMIN"; emptyContent: string }) {
    const [openId, setOpenId] = useState<string | null>(null);
    const [target, setTarget] = useState<Target | null>(null);
    const [reason, setReason] = useState("");
    const [reasonError, setReasonError] = useState<string | null>(null);
    const cancelClass = useCancelTrainerClass();
    const cancelStudent = useCancelClassBooking();
    const addToast = useToastStore((s) => s.addToast);
    const nowMs = serverNow();
    const open = items.find((c) => c.classId === openId) ?? null;
    const isAdmin = view === "ADMIN";

    const canCancel = (c: ClassInfo) => c.status === "OPEN" && new Date(c.end).getTime() > nowMs;

    const onConfirm = () => {
        if (!target) return;
        // Mismo límite que la base: motivo obligatorio de 3 a 300 caracteres
        const parsed = suspendReasonSchema.safeParse(reason);
        if (!parsed.success) { setReasonError(parsed.error.issues[0].message); return; }
        setReasonError(null);
        const done = (msg: string) => { setTarget(null); setReason(""); addToast(msg); };
        if (target.kind === "class") {
            cancelClass.mutate({ classId: target.cls.classId, reason: parsed.data }, {
                onSuccess: (r) => { setOpenId(null); done(`Clase cancelada. Se devolvió el 100% a ${r.students} alumno${r.students === 1 ? "" : "s"}.`); },
                onError: (e) => addToast(e.message),
            });
        } else {
            cancelStudent.mutate({ id: target.student.bookingId, reason: parsed.data }, {
                onSuccess: () => done("Lugar cancelado. Se devolvió el 100% al alumno."),
                onError: (e) => addToast(e.message),
            });
        }
    };

    return (
        <>
            <DataTable aria-label="Clases">
                <TableHeader>
                    <TableColumn>FECHA</TableColumn>
                    <TableColumn>HORARIO</TableColumn>
                    <TableColumn>DEPORTE</TableColumn>
                    <TableColumn>{isAdmin ? "ENTRENADOR" : "LUGAR"}</TableColumn>
                    <TableColumn>ALUMNOS</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent={emptyContent}>
                    {items.map((c) => {
                        const chip = classChip(c, nowMs);
                        return (
                            <TableRow key={c.classId}>
                                <TableCell>{formatDateShortAr(c.start)}</TableCell>
                                <TableCell>{formatTimeAr(c.start)} a {formatTimeAr(c.end)}</TableCell>
                                <TableCell>{c.sport.name} <span className="text-xs text-default-400">{c.isGroup ? "grupal" : "individual"}</span></TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                    {isAdmin ? `${c.trainer.firstName} ${c.trainer.lastName}` : c.location}
                                </TableCell>
                                <TableCell>{c.taken}/{c.capacity}</TableCell>
                                <TableCell><Chip size="sm" variant="flat" color={chip.color}>{chip.label}</Chip></TableCell>
                                <TableCell>
                                    <Button size="sm" variant="light" color="primary" startContent={<EyeIcon className="h-4 w-4" />} onPress={() => setOpenId(c.classId)}>
                                        Ver
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </DataTable>

            <Modal isOpen={!!open} onClose={() => setOpenId(null)} size="2xl" scrollBehavior="inside" placement="center">
                <ModalContent>
                    {open && (
                        <>
                            <ModalHeader className="flex-col items-start">
                                <span>Clase de {open.sport.name}</span>
                                <span className="text-sm font-normal text-default-500">
                                    {formatDateShortAr(open.start)} · {formatTimeAr(open.start)} a {formatTimeAr(open.end)} · {open.location}
                                </span>
                            </ModalHeader>
                            <ModalBody className="gap-3">
                                {isAdmin && <p className="text-sm">Entrenador: {open.trainer.firstName} {open.trainer.lastName}</p>}
                                {open.status === "CANCELLED" && (
                                    <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">Clase cancelada{open.cancellationReason ? `: ${open.cancellationReason}` : ""}.</p>
                                )}
                                <ul className="divide-y divide-divider">
                                    {(open.students ?? []).map((s) => (
                                        <li key={s.bookingId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                            <div>
                                                <p className="font-medium">
                                                    {s.firstName} {s.lastName}
                                                    {s.isRecurring && <span className="ml-2 text-xs font-normal text-default-500">clase fija</span>}
                                                    {s.status === "CONFIRMED" && s.paymentStatus === "PENDING" && (
                                                        <span className="ml-2 text-xs font-normal text-warning-600">sin pagar</span>
                                                    )}
                                                </p>
                                                {isAdmin && s.email && <p className="text-xs text-default-500">{s.email}</p>}
                                                <p className="text-xs text-default-500">
                                                    {isAdmin
                                                        ? <>Total <Credits amount={Number(s.totalPrice ?? 0)} /> · entrenador <Credits amount={Number(s.basePrice)} /> · comisión <Credits amount={Number(s.commissionAmount ?? 0)} /></>
                                                        : <>Tu tarifa <Credits amount={Number(s.basePrice)} /></>}
                                                </p>
                                                {s.status === "CANCELLED" && (
                                                    <p className="text-xs text-danger">
                                                        Cancelada por {CANCELLED_BY_LABEL[s.cancelledByRole ?? ""] ?? "—"}{s.cancellationReason ? ` · ${s.cancellationReason}` : ""}
                                                    </p>
                                                )}
                                            </div>
                                            {s.status === "CONFIRMED" && canCancel(open) && (
                                                <Button size="sm" color="danger" variant="light"
                                                    onPress={() => { setReason(""); setReasonError(null); setTarget({ kind: "student", cls: open, student: s }); }}>
                                                    Cancelar lugar
                                                </Button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </ModalBody>
                            <ModalFooter>
                                <Button variant="light" onPress={() => setOpenId(null)}>Cerrar</Button>
                                {canCancel(open) && (
                                    <Button color="danger" variant="flat"
                                        onPress={() => { setReason(""); setReasonError(null); setTarget({ kind: "class", cls: open }); }}>
                                        Cancelar clase
                                    </Button>
                                )}
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

            <Modal isOpen={!!target} onClose={() => setTarget(null)} placement="center">
                <ModalContent>
                    <ModalHeader>{target?.kind === "class" ? "Cancelar la clase entera" : "Cancelar el lugar del alumno"}</ModalHeader>
                    <ModalBody className="gap-3">
                        <p className="text-sm">
                            {target?.kind === "class"
                                ? "Se cancelan todos los lugares y cada alumno recibe el 100% de lo que pagó. Les avisamos por email."
                                : `Se cancela el lugar de ${target?.kind === "student" ? `${target.student.firstName} ${target.student.lastName}` : ""} y recibe el 100% de lo que pagó. Le avisamos por email.`}
                        </p>
                        <Textarea label="Motivo" variant="bordered" isRequired maxLength={300} value={reason} onValueChange={setReason}
                            description="Lo ve el alumno" isInvalid={!!reasonError} errorMessage={reasonError} />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={() => setTarget(null)}>Volver</Button>
                        <Button color="danger" isLoading={cancelClass.isPending || cancelStudent.isPending} onPress={onConfirm}>Confirmar</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
}
