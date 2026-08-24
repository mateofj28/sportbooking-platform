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
import { Select, SelectItem } from "@heroui/select";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import type { Sport, Venue } from "@/types";

const SURFACE_TYPES = [
    "Césped sintético",
    "Césped natural",
    "Arcilla",
    "Cemento",
    "Madera",
    "Caucho",
    "Vidrio/Cristal",
    "Parquet",
    "Tartán",
];

// Duraciones recomendadas por deporte (slug → opciones en minutos)
const DURATION_BY_SPORT: Record<string, { min: number; max: number; options: number[] }> = {
    futbol: { min: 60, max: 60, options: [60] },
    tenis: { min: 60, max: 90, options: [60, 90] },
    padel: { min: 60, max: 90, options: [60, 90] },
    basquetbol: { min: 60, max: 90, options: [60, 90] },
    voleibol: { min: 60, max: 90, options: [60, 90] },
};

const DEFAULT_DURATION = { min: 60, max: 120, options: [60, 90, 120] };

export default function AdminFacilitiesPage() {
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
    const [deleteId, setDeleteId] = useState<string | null>(null);
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
            addToast("Item creado correctamente");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/facilities/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
            addToast("Item eliminado correctamente");
        },
    });

    const editMutation = useMutation({
        mutationFn: ({ id, ...data }: { id: string; name: string; description: string; surfaceType: string; minBookingDuration: number; maxBookingDuration: number }) =>
            apiClient.patch(`/facilities/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
            onEditClose();
            addToast("Item actualizado correctamente");
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
                                        onPress={() => setDeleteId(facility.id)}
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
                        <Input label="Nombre" placeholder="Ej: Cancha de Fútbol 5 - A" variant="bordered" value={form.name} onValueChange={(v) => setForm({ ...form, name: v })} />
                        <div className="grid grid-cols-2 gap-4">
                            <Select
                                label="Sede"
                                placeholder="Seleccionar sede"
                                variant="bordered"
                                selectedKeys={form.venueId ? new Set([form.venueId]) as any : new Set() as any}
                                onSelectionChange={(keys: any) => setForm({ ...form, venueId: Array.from(keys)[0] as string || "" })}
                            >
                                {(venues || []).map((v) => (
                                    <SelectItem key={v.id} textValue={`${v.name} — ${v.city}`}>{v.name} — {v.city}</SelectItem>
                                ))}
                            </Select>
                            <Select
                                label="Deporte"
                                placeholder="Seleccionar deporte"
                                variant="bordered"
                                selectedKeys={form.sportId ? new Set([form.sportId]) as any : new Set() as any}
                                onSelectionChange={(keys: any) => {
                                    const sportId = Array.from(keys)[0] as string || "";
                                    const sport = sports?.find((s) => s.id === sportId);
                                    const durations = sport ? (DURATION_BY_SPORT[sport.slug] || DEFAULT_DURATION) : DEFAULT_DURATION;
                                    setForm({ ...form, sportId, minBookingDuration: String(durations.min), maxBookingDuration: String(durations.max) });
                                }}
                            >
                                {(sports || []).map((s) => (
                                    <SelectItem key={s.id}>{s.name}</SelectItem>
                                ))}
                            </Select>
                        </div>
                        <Textarea label="Descripción" placeholder="Descripción breve de la instalación" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
                        <Select
                            label="Tipo de superficie"
                            placeholder="Seleccionar superficie"
                            variant="bordered"
                            selectedKeys={form.surfaceType ? new Set([form.surfaceType]) as any : new Set() as any}
                            onSelectionChange={(keys: any) => setForm({ ...form, surfaceType: Array.from(keys)[0] as string || "" })}
                        >
                            {SURFACE_TYPES.map((s) => (
                                <SelectItem key={s}>{s}</SelectItem>
                            ))}
                        </Select>
                        {/* Duration - auto-calculated from sport */}
                        <div>
                            <p className="text-xs text-default-500 mb-2">Duración de reserva (según deporte seleccionado)</p>
                            <div className="flex gap-2">
                                {(() => {
                                    const sport = sports?.find((s) => s.id === form.sportId);
                                    const durations = sport ? (DURATION_BY_SPORT[sport.slug] || DEFAULT_DURATION) : DEFAULT_DURATION;
                                    return durations.options.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setForm({ ...form, minBookingDuration: String(d), maxBookingDuration: String(d) })}
                                            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${form.minBookingDuration === String(d)
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-divider hover:border-primary"
                                                }`}
                                        >
                                            {d} min
                                        </button>
                                    ));
                                })()}
                            </div>
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
                        <Select
                            label="Tipo de superficie"
                            placeholder="Seleccionar superficie"
                            variant="bordered"
                            selectedKeys={editForm.surfaceType ? new Set([editForm.surfaceType]) as any : new Set() as any}
                            onSelectionChange={(keys: any) => setEditForm({ ...editForm, surfaceType: Array.from(keys)[0] as string || "" })}
                        >
                            {SURFACE_TYPES.map((s) => (
                                <SelectItem key={s} textValue={s}>{s}</SelectItem>
                            ))}
                        </Select>
                        <div>
                            <p className="text-xs text-default-500 mb-2">Duración de reserva</p>
                            <div className="flex gap-2">
                                {DEFAULT_DURATION.options.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, minBookingDuration: String(d), maxBookingDuration: String(d) })}
                                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${editForm.minBookingDuration === String(d)
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-divider hover:border-primary"
                                            }`}
                                    >
                                        {d} min
                                    </button>
                                ))}
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onEditClose}>Cancelar</Button>
                        <Button color="primary" onPress={handleEditSubmit} isLoading={editMutation.isPending}>Guardar</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }}
                title="Eliminar"
                message="¿Estás seguro? Esta acción no se puede deshacer."
                confirmLabel="Eliminar"
            />
        </div>
    );
}
