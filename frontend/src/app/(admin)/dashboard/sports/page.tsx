"use client";

import {
    Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure,
} from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import type { Sport } from "@/types";

export default function AdminSportsPage() {
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
    const [form, setForm] = useState({ name: "", description: "", maxPlayers: "" });
    const [editForm, setEditForm] = useState({ id: "", name: "", description: "", maxPlayers: "" });
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const { data: sports, isLoading } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => apiClient.post("/sports", data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sports"] }); onClose(); setForm({ name: "", description: "", maxPlayers: "" }); addToast("Deporte creado correctamente"); },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/sports/${id}`),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sports"] }); addToast("Deporte eliminado"); },
    });

    const editMutation = useMutation({
        mutationFn: ({ id, ...data }: any) => apiClient.patch(`/sports/${id}`, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sports"] }); onEditClose(); addToast("Deporte actualizado"); },
    });

    const handleEdit = (sport: Sport) => {
        setEditForm({ id: sport.id, name: sport.name, description: sport.description || "", maxPlayers: sport.maxPlayers != null ? String(sport.maxPlayers) : "" });
        onEditOpen();
    };

    const buildPayload = (f: { name: string; description: string; maxPlayers: string }) => ({
        name: f.name,
        description: f.description || undefined,
        maxPlayers: f.maxPlayers ? parseInt(f.maxPlayers) : undefined,
    });

    if (isLoading) return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Deportes</h1>
                    <p className="text-sm text-default-500 mt-1">Catálogo de deportes disponibles</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={onOpen}>Nuevo Deporte</Button>
            </div>

            <Table aria-label="Deportes">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>DESCRIPCIÓN</TableColumn>
                    <TableColumn>JUGADORES</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay deportes">
                    {(sports || []).map((sport) => (
                        <TableRow key={sport.id}>
                            <TableCell className="font-medium">{sport.name}</TableCell>
                            <TableCell className="text-default-500">{sport.description || "-"}</TableCell>
                            <TableCell className="text-default-500">{sport.maxPlayers != null ? sport.maxPlayers : "-"}</TableCell>
                            <TableCell><Chip color={sport.isActive ? "success" : "danger"} size="sm" variant="dot">{sport.isActive ? "Activo" : "Inactivo"}</Chip></TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEdit(sport)}><Pencil className="h-4 w-4" /></Button>
                                    <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(sport.id)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Create Modal */}
            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalContent>
                    <ModalHeader>Nuevo Deporte</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input label="Nombre" placeholder="Ej: Fútbol" variant="bordered" value={form.name} onValueChange={(v) => setForm({ ...form, name: v })} />
                        <Input label="Descripción" placeholder="Descripción breve (opcional)" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
                        <Input label="Cantidad de jugadores" type="number" min="1" placeholder="Ej: 22" variant="bordered" value={form.maxPlayers} onValueChange={(v) => setForm({ ...form, maxPlayers: v })} />
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
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onEditClose}>Cancelar</Button>
                        <Button color="primary" onPress={() => editMutation.mutate({ id: editForm.id, ...buildPayload(editForm) })} isLoading={editMutation.isPending}>Guardar</Button>
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
