"use client";
import { toAppError } from '@/lib/error-messages'

import {
    Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, RadioGroup, Radio, useDisclosure,
    Switch, CheckboxGroup, Checkbox, Divider,
} from "@heroui/react";
import { DataTable } from "@/components/shared/data-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { camelize } from "@/lib/supabase-helpers";
import { useSports } from "@/hooks/use-sports";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { PencilIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { Sport } from "@/types";

export default function AdminSportsPage() {
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
    const [form, setForm] = useState({ name: "", description: "", maxPlayers: "", billingType: "PER_SESSION" });
    const [editForm, setEditForm] = useState({ id: "", name: "", description: "", maxPlayers: "", billingType: "PER_SESSION" });
    // Clases con entrenadores (spec entrenadores, Req. 1)
    const [classForm, setClassForm] = useState({ enabled: false, durations: ["1"] as string[], maxStudents: "1" });
    const maxStudentsNum = Number(classForm.maxStudents);
    const classFormError = !classForm.enabled ? null
        : classForm.durations.length === 0 ? "Elegí al menos una duración"
        : !Number.isInteger(maxStudentsNum) || maxStudentsNum < 1 || maxStudentsNum > 50 ? "El cupo tiene que ser entre 1 y 50 alumnos"
        : null;
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const { data: sports, isLoading } = useSports(false);

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const { error } = await supabase.from("sports").insert({
                name: data.name,
                description: data.description || null,
                max_players: data.maxPlayers ?? null,
                billing_type: data.billingType,
            });
            if (error) throw toAppError(error);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sports"] }); onClose(); setForm({ name: "", description: "", maxPlayers: "", billingType: "PER_SESSION" }); addToast("Deporte creado correctamente"); },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("sports").delete().eq("id", id);
            if (error) throw toAppError(error);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sports"] }); addToast("Deporte eliminado"); },
    });

    const editMutation = useMutation({
        mutationFn: async ({ id, ...data }: any) => {
            const { error } = await supabase.from("sports").update({
                name: data.name,
                description: data.description || null,
                max_players: data.maxPlayers ?? null,
                billing_type: data.billingType,
                classes_enabled: data.classesEnabled,
                class_durations: data.classDurations,
                class_max_students: data.classMaxStudents,
            }).eq("id", id);
            if (error) throw toAppError(error);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sports"] }); onEditClose(); addToast("Deporte actualizado"); },
        onError: (e: Error) => addToast(e.message, "error"),
    });

    const handleEdit = (sport: Sport) => {
        setEditForm({ id: sport.id, name: sport.name, description: sport.description || "", maxPlayers: sport.maxPlayers != null ? String(sport.maxPlayers) : "", billingType: sport.billingType || "PER_SESSION" });
        setClassForm({
            enabled: !!sport.classesEnabled,
            durations: (sport.classDurations?.length ? sport.classDurations : [1]).map(String),
            maxStudents: String(sport.classMaxStudents ?? 1),
        });
        onEditOpen();
    };

    const buildPayload = (f: { name: string; description: string; maxPlayers: string; billingType: string }) => ({
        name: f.name,
        description: f.description || undefined,
        maxPlayers: f.maxPlayers ? parseInt(f.maxPlayers) : undefined,
        billingType: f.billingType,
    });

    if (isLoading) return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Deportes</h1>
                    <p className="text-sm text-default-500 mt-1">Catálogo de deportes disponibles</p>
                </div>
                <Button color="primary" startContent={<PlusIcon className="h-4 w-4" />} onPress={onOpen}>Nuevo Deporte</Button>
            </div>

            <DataTable aria-label="Deportes">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>DESCRIPCIÓN</TableColumn>
                    <TableColumn>JUGADORES</TableColumn>
                    <TableColumn>MODALIDAD</TableColumn>
                    <TableColumn>CLASES</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay deportes">
                    {(sports || []).map((sport) => (
                        <TableRow key={sport.id}>
                            <TableCell className="font-medium">{sport.name}</TableCell>
                            <TableCell className="text-default-500">{sport.description || "-"}</TableCell>
                            <TableCell className="text-default-500">{sport.maxPlayers != null ? sport.maxPlayers : "-"}</TableCell>
                            <TableCell>
                                <Chip color={sport.billingType === "MONTHLY" ? "secondary" : "primary"} size="sm" variant="flat">
                                    {sport.billingType === "MONTHLY" ? "Mensualidad" : "Por turno"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                {sport.classesEnabled ? (
                                    <span className="text-sm text-default-600">
                                        {(sport.classDurations ?? []).map((h) => `${h} h`).join(" · ")}
                                        {" · "}
                                        {(sport.classMaxStudents ?? 1) > 1 ? `grupal, hasta ${sport.classMaxStudents}` : "individual"}
                                    </span>
                                ) : (
                                    <span className="text-sm text-default-400">No</span>
                                )}
                            </TableCell>
                            <TableCell><Chip color={sport.isActive ? "success" : "danger"} size="sm" variant="flat">{sport.isActive ? "Activo" : "Inactivo"}</Chip></TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEdit(sport)}><PencilIcon className="h-4 w-4" /></Button>
                                    <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(sport.id)}><TrashIcon className="h-4 w-4" /></Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>

            {/* Create Modal */}
            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalContent>
                    <ModalHeader>Nuevo Deporte</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input label="Nombre" placeholder="Ej: Fútbol" variant="bordered" value={form.name} onValueChange={(v) => setForm({ ...form, name: v })} />
                        <Input label="Descripción" placeholder="Descripción breve (opcional)" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
                        <Input label="Cantidad de jugadores" type="number" min="1" placeholder="Ej: 22" variant="bordered" value={form.maxPlayers} onValueChange={(v) => setForm({ ...form, maxPlayers: v })} />
                        <RadioGroup
                            label="Modalidad de cobro"
                            value={form.billingType}
                            onValueChange={(v) => setForm({ ...form, billingType: v })}
                            description={form.billingType === "MONTHLY" ? "Los jugadores abonan una mensualidad, no un turno individual." : "Los jugadores reservan y abonan por turno."}
                        >
                            <Radio value="PER_SESSION">Por turno</Radio>
                            <Radio value="MONTHLY">Mensualidad</Radio>
                        </RadioGroup>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose}>Cancelar</Button>
                        <Button color="primary" onPress={() => createMutation.mutate(buildPayload(form))} isLoading={createMutation.isPending} isDisabled={!form.name}>Crear</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={isEditOpen} onClose={onEditClose}>
                <ModalContent>
                    <ModalHeader>Editar Deporte</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input label="Nombre" variant="bordered" value={editForm.name} onValueChange={(v) => setEditForm({ ...editForm, name: v })} />
                        <Input label="Descripción" variant="bordered" value={editForm.description} onValueChange={(v) => setEditForm({ ...editForm, description: v })} />
                        <Input label="Cantidad de jugadores" type="number" min="1" placeholder="Ej: 22" variant="bordered" value={editForm.maxPlayers} onValueChange={(v) => setEditForm({ ...editForm, maxPlayers: v })} />
                        <RadioGroup
                            label="Modalidad de cobro"
                            value={editForm.billingType}
                            onValueChange={(v) => setEditForm({ ...editForm, billingType: v })}
                            description={editForm.billingType === "MONTHLY" ? "Los jugadores abonan una mensualidad, no un turno individual." : "Los jugadores reservan y abonan por turno."}
                        >
                            <Radio value="PER_SESSION">Por turno</Radio>
                            <Radio value="MONTHLY">Mensualidad</Radio>
                        </RadioGroup>

                        <Divider />
                        <div className="space-y-3" role="group" aria-label="Clases con entrenadores">
                            <Switch isSelected={classForm.enabled} onValueChange={(v) => setClassForm({ ...classForm, enabled: v })}>
                                Admite clases con entrenadores
                            </Switch>
                            {classForm.enabled && (
                                <>
                                    <CheckboxGroup
                                        label="Duraciones permitidas de una clase"
                                        orientation="horizontal"
                                        value={classForm.durations}
                                        onValueChange={(v) => setClassForm({ ...classForm, durations: [...v].sort((a, b) => Number(a) - Number(b)) })}
                                        description="Horas enteras. El cliente elige entre estas al reservar."
                                    >
                                        {["1", "2", "3", "4", "5", "6", "7", "8"].map((h) => <Checkbox key={h} value={h}>{h} h</Checkbox>)}
                                    </CheckboxGroup>
                                    <Input
                                        label="Máximo de alumnos por clase"
                                        type="number"
                                        min="1"
                                        max="50"
                                        variant="bordered"
                                        value={classForm.maxStudents}
                                        onValueChange={(v) => setClassForm({ ...classForm, maxStudents: v.replace(/\D/g, "") })}
                                        description={maxStudentsNum > 1 ? "Clase grupal: varios alumnos en el mismo horario." : "1 = clase individual."}
                                    />
                                    <p className="text-xs text-default-400">Los cambios no afectan las clases ya reservadas.</p>
                                </>
                            )}
                            {classFormError && <p role="alert" className="text-sm text-danger">{classFormError}</p>}
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onEditClose}>Cancelar</Button>
                        <Button
                            color="primary"
                            isDisabled={!!classFormError}
                            onPress={() => editMutation.mutate({
                                id: editForm.id,
                                ...buildPayload(editForm),
                                classesEnabled: classForm.enabled,
                                classDurations: classForm.durations.map(Number),
                                classMaxStudents: maxStudentsNum || 1,
                            })}
                            isLoading={editMutation.isPending}
                        >
                            Guardar
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Confirm Delete */}
            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }}
                title="Eliminar deporte"
                message="¿Estás seguro? Esta acción no se puede deshacer."
                confirmLabel="Eliminar"
            />
        </div>
    );
}
