"use client";

import {
    Button,
    Chip,
    Spinner,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Input,
    useDisclosure,
} from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import type { Sport } from "@/types";

export default function AdminSportsPage() {
    const queryClient = useQueryClient();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
    const [form, setForm] = useState({ name: "", slug: "", icon: "" });
    const [editForm, setEditForm] = useState({ id: "", name: "", slug: "", icon: "" });

    const { data: sports, isLoading } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => apiClient.post("/sports", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sports"] });
            onClose();
            setForm({ name: "", slug: "", icon: "" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/sports/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sports"] });
        },
    });

    const editMutation = useMutation({
        mutationFn: ({ id, ...data }: { id: string; name: string; slug: string; icon: string }) =>
            apiClient.patch(`/sports/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sports"] });
            onEditClose();
        },
    });

    const handleEdit = (sport: Sport) => {
        setEditForm({ id: sport.id, name: sport.name, slug: sport.slug, icon: sport.icon || "" });
        onEditOpen();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Deportes</h1>
                    <p className="text-sm text-default-500 mt-1">Catálogo de deportes disponibles</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={onOpen}>
                    Nuevo Deporte
                </Button>
            </div>

            <Table aria-label="Deportes">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>SLUG</TableColumn>
                    <TableColumn>ICONO</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay deportes">
                    {(sports || []).map((sport) => (
                        <TableRow key={sport.id}>
                            <TableCell className="font-medium">{sport.name}</TableCell>
                            <TableCell className="text-default-500">{sport.slug}</TableCell>
                            <TableCell>{sport.icon || "-"}</TableCell>
                            <TableCell>
                                <Chip color={sport.isActive ? "success" : "danger"} size="sm" variant="dot">
                                    {sport.isActive ? "Activo" : "Inactivo"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        color="primary"
                                        variant="light"
                                        isIconOnly
                                        onPress={() => handleEdit(sport)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        color="danger"
                                        variant="light"
                                        isIconOnly
                                        onPress={() => deleteMutation.mutate(sport.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalContent>
                    <ModalHeader>Nuevo Deporte</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input
                            label="Nombre"
                            placeholder="Ej: Fútbol"
                            variant="bordered"
                            value={form.name}
                            onValueChange={(v) =>
                                setForm({
                                    ...form,
                                    name: v,
                                    slug: v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                                })
                            }
                        />
                        <Input label="Slug" variant="bordered" value={form.slug} onValueChange={(v) => setForm({ ...form, slug: v })} />
                        <Input label="Icono" placeholder="Ej: soccer" variant="bordered" value={form.icon} onValueChange={(v) => setForm({ ...form, icon: v })} />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose}>Cancelar</Button>
                        <Button color="primary" onPress={() => createMutation.mutate(form)} isLoading={createMutation.isPending}>Crear</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal isOpen={isEditOpen} onClose={onEditClose}>
                <ModalContent>
                    <ModalHeader>Editar Deporte</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input
                            label="Nombre"
                            variant="bordered"
                            value={editForm.name}
                            onValueChange={(v) =>
                                setEditForm({
                                    ...editForm,
                                    name: v,
                                    slug: v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
                                })
                            }
                        />
                        <Input label="Slug" variant="bordered" value={editForm.slug} onValueChange={(v) => setEditForm({ ...editForm, slug: v })} />
                        <Input label="Icono" placeholder="Ej: soccer" variant="bordered" value={editForm.icon} onValueChange={(v) => setEditForm({ ...editForm, icon: v })} />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onEditClose}>Cancelar</Button>
                        <Button color="primary" onPress={() => editMutation.mutate(editForm)} isLoading={editMutation.isPending}>Guardar</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
