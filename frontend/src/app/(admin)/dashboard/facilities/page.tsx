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
    Textarea,
    useDisclosure,
} from "@heroui/react";
import { useFacilities } from "@/hooks/use-facilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import type { Sport, Venue } from "@/types";

export default function AdminFacilitiesPage() {
    const queryClient = useQueryClient();
    const { data: facilities, isLoading } = useFacilities();
    const { data: sports } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });
    const { data: venues } = useQuery({
        queryKey: ["venues"],
        queryFn: () => apiClient.get<Venue[]>("/venues"),
    });

    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
    const [form, setForm] = useState({
        name: "",
        description: "",
        venueId: "",
        sportId: "",
        surfaceType: "",
        minBookingDuration: "60",
        maxBookingDuration: "120",
    });
    const [editForm, setEditForm] = useState({
        id: "",
        name: "",
        description: "",
        surfaceType: "",
        minBookingDuration: "60",
        maxBookingDuration: "120",
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => apiClient.post("/facilities", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
            onClose();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/facilities/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
        },
    });

    const editMutation = useMutation({
        mutationFn: ({ id, ...data }: { id: string; name: string; description: string; surfaceType: string; minBookingDuration: number; maxBookingDuration: number }) =>
            apiClient.patch(`/facilities/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
            onEditClose();
        },
    });

    const handleEdit = (facility: any) => {
        setEditForm({
            id: facility.id,
            name: facility.name,
            description: facility.description || "",
            surfaceType: facility.surfaceType || "",
            minBookingDuration: String(facility.minBookingDuration),
            maxBookingDuration: String(facility.maxBookingDuration),
        });
        onEditOpen();
    };

    const handleEditSubmit = () => {
        editMutation.mutate({
            id: editForm.id,
            name: editForm.name,
            description: editForm.description,
            surfaceType: editForm.surfaceType,
            minBookingDuration: parseInt(editForm.minBookingDuration),
            maxBookingDuration: parseInt(editForm.maxBookingDuration),
        });
    };

    const handleCreate = () => {
        setForm({
            name: "",
            description: "",
            venueId: venues?.[0]?.id || "",
            sportId: sports?.[0]?.id || "",
            surfaceType: "",
            minBookingDuration: "60",
            maxBookingDuration: "120",
        });
        onOpen();
    };

    const handleSubmit = () => {
        createMutation.mutate({
            ...form,
            minBookingDuration: parseInt(form.minBookingDuration),
            maxBookingDuration: parseInt(form.maxBookingDuration),
        });
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
                    <h1 className="text-2xl font-bold">Instalaciones</h1>
                    <p className="text-sm text-default-500 mt-1">Gestiona las canchas y campos</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={handleCreate}>
                    Nueva Instalación
                </Button>
            </div>

            <Table aria-label="Instalaciones">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>DEPORTE</TableColumn>
                    <TableColumn>SEDE</TableColumn>
                    <TableColumn>SUPERFICIE</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay instalaciones">
                    {(facilities || []).map((facility) => (
                        <TableRow key={facility.id}>
                            <TableCell className="font-medium">{facility.name}</TableCell>
                            <TableCell>
                                <Chip color="primary" size="sm" variant="flat">
                                    {facility.sport.name}
                                </Chip>
                            </TableCell>
                            <TableCell>{facility.venue.name}</TableCell>
                            <TableCell>{facility.surfaceType || "-"}</TableCell>
                            <TableCell>
                                <Chip color={facility.isActive ? "success" : "danger"} size="sm" variant="dot">
                                    {facility.isActive ? "Activa" : "Inactiva"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        color="primary"
                                        variant="light"
                                        isIconOnly
                                        onPress={() => handleEdit(facility)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        color="danger"
                                        variant="light"
                                        isIconOnly
                                        onPress={() => deleteMutation.mutate(facility.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <Modal isOpen={isOpen} onClose={onClose} size="2xl">
                <ModalContent>
                    <ModalHeader>Nueva Instalación</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input label="Nombre" variant="bordered" value={form.name} onValueChange={(v) => setForm({ ...form, name: v })} />
                        <Textarea label="Descripción" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
                        <Input label="Tipo de superficie" variant="bordered" value={form.surfaceType} onValueChange={(v) => setForm({ ...form, surfaceType: v })} />
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Duración mín (min)" type="number" variant="bordered" value={form.minBookingDuration} onValueChange={(v) => setForm({ ...form, minBookingDuration: v })} />
                            <Input label="Duración máx (min)" type="number" variant="bordered" value={form.maxBookingDuration} onValueChange={(v) => setForm({ ...form, maxBookingDuration: v })} />
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose}>Cancelar</Button>
                        <Button color="primary" onPress={handleSubmit} isLoading={createMutation.isPending}>Crear</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal isOpen={isEditOpen} onClose={onEditClose} size="2xl">
                <ModalContent>
                    <ModalHeader>Editar Instalación</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input label="Nombre" variant="bordered" value={editForm.name} onValueChange={(v) => setEditForm({ ...editForm, name: v })} />
                        <Textarea label="Descripción" variant="bordered" value={editForm.description} onValueChange={(v) => setEditForm({ ...editForm, description: v })} />
                        <Input label="Tipo de superficie" variant="bordered" value={editForm.surfaceType} onValueChange={(v) => setEditForm({ ...editForm, surfaceType: v })} />
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Duración mín (min)" type="number" variant="bordered" value={editForm.minBookingDuration} onValueChange={(v) => setEditForm({ ...editForm, minBookingDuration: v })} />
                            <Input label="Duración máx (min)" type="number" variant="bordered" value={editForm.maxBookingDuration} onValueChange={(v) => setEditForm({ ...editForm, maxBookingDuration: v })} />
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onEditClose}>Cancelar</Button>
                        <Button color="primary" onPress={handleEditSubmit} isLoading={editMutation.isPending}>Guardar</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
}
