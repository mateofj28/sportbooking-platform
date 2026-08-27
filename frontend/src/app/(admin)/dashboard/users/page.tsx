"use client";

import {
    Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { UserX, UserCheck, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import type { User, PaginatedResult, Venue } from "@/types";

const ROLE_COLORS: Record<string, "secondary" | "warning" | "default"> = {
    ADMIN: "secondary",
    VENUE_ADMIN: "warning",
    CLIENT: "default",
};

const ROLE_LABELS: Record<string, string> = {
    ADMIN: "Admin General",
    VENUE_ADMIN: "Admin Sede",
    CLIENT: "Cliente",
};

export default function AdminUsersPage() {
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [reactivateId, setReactivateId] = useState<string | null>(null);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
    const [editUser, setEditUser] = useState<User | null>(null);
    const [editRole, setEditRole] = useState("");
    const [editVenueId, setEditVenueId] = useState("");

    // Create form state
    const [createForm, setCreateForm] = useState({
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        phone: "",
        dni: "",
        role: "CLIENT",
        venueId: "",
    });

    const { data, isLoading } = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => apiClient.get<PaginatedResult<User>>("/users?limit=100"),
    });

    const { data: venues } = useQuery({
        queryKey: ["venues"],
        queryFn: () => apiClient.get<Venue[]>("/venues"),
    });

    const deactivateMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            addToast("Usuario desactivado");
        },
    });

    const reactivateMutation = useMutation({
        mutationFn: (id: string) => apiClient.patch(`/users/${id}/reactivate`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            addToast("Usuario reactivado");
        },
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ id, role, venueId }: { id: string; role: string; venueId?: string }) =>
            apiClient.patch(`/users/${id}`, { role, venueId: venueId || null }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onClose();
            addToast("Rol actualizado correctamente");
        },
    });

    const createUserMutation = useMutation({
        mutationFn: (data: any) => apiClient.post("/users", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onCreateClose();
            addToast("Usuario creado correctamente");
            setCreateForm({ email: "", password: "", firstName: "", lastName: "", phone: "", dni: "", role: "CLIENT", venueId: "" });
        },
        onError: (error: any) => {
            addToast(error?.response?.data?.message || "Error al crear usuario");
        },
    });

    const handleEditRole = (user: User) => {
        setEditUser(user);
        setEditRole(user.role);
        setEditVenueId(user.venueId || "");
        onOpen();
    };

    const handleSaveRole = () => {
        if (!editUser) return;
        updateRoleMutation.mutate({
            id: editUser.id,
            role: editRole,
            venueId: editRole === "VENUE_ADMIN" ? editVenueId : undefined,
        });
    };

    const handleCreateSubmit = () => {
        createUserMutation.mutate({
            email: createForm.email,
            password: createForm.password,
            firstName: createForm.firstName,
            lastName: createForm.lastName,
            phone: createForm.phone || undefined,
            dni: createForm.dni || undefined,
            role: createForm.role,
            venueId: createForm.role === "VENUE_ADMIN" ? createForm.venueId : undefined,
        });
    };

    if (isLoading) {
        return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
    }

    const users = data?.data || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Usuarios</h1>
                    <p className="text-sm text-default-500 mt-1">Gestiona los usuarios de la plataforma</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={onCreateOpen}>
                    Nuevo Usuario
                </Button>
            </div>

            <Table aria-label="Usuarios">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>DNI</TableColumn>
                    <TableColumn>EMAIL</TableColumn>
                    <TableColumn>ROL</TableColumn>
                    <TableColumn>SEDE</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay usuarios">
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                            <TableCell className="text-sm text-default-500">{user.dni || "—"}</TableCell>
                            <TableCell className="text-sm text-default-500">{user.email}</TableCell>
                            <TableCell>
                                <Chip color={ROLE_COLORS[user.role] || "default"} size="sm" variant="flat">
                                    {ROLE_LABELS[user.role] || user.role}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                {user.role === "VENUE_ADMIN" && user.venueId ? (
                                    <span className="text-xs text-default-500">
                                        {venues?.find((v) => v.id === user.venueId)?.name || "—"}
                                    </span>
                                ) : (
                                    <span className="text-xs text-default-400">—</span>
                                )}
                            </TableCell>
                            <TableCell>
                                <Chip color={user.isActive ? "success" : "danger"} size="sm" variant="dot">
                                    {user.isActive ? "Activo" : "Inactivo"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEditRole(user)}>
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    {user.isActive && user.role !== "ADMIN" && (
                                        <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(user.id)}>
                                            <UserX className="h-4 w-4" />
                                        </Button>
                                    )}
                                    {!user.isActive && (
                                        <Button size="sm" color="success" variant="light" isIconOnly onPress={() => setReactivateId(user.id)}>
                                            <UserCheck className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Create User Modal */}
            <Modal isOpen={isCreateOpen} onClose={onCreateClose} size="2xl">
                <ModalContent>
                    <ModalHeader>Nuevo Usuario</ModalHeader>
                    <ModalBody className="gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Nombre" variant="bordered" value={createForm.firstName} onValueChange={(v) => setCreateForm({ ...createForm, firstName: v })} isRequired />
                            <Input label="Apellido" variant="bordered" value={createForm.lastName} onValueChange={(v) => setCreateForm({ ...createForm, lastName: v })} isRequired />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Email" type="email" variant="bordered" value={createForm.email} onValueChange={(v) => setCreateForm({ ...createForm, email: v })} isRequired />
                            <Input label="Contraseña" type="password" variant="bordered" value={createForm.password} onValueChange={(v) => setCreateForm({ ...createForm, password: v })} isRequired description="Mín. 8 caracteres, 1 mayúscula, 1 número" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Teléfono" variant="bordered" value={createForm.phone} onValueChange={(v) => setCreateForm({ ...createForm, phone: v })} />
                            <Input label="DNI" variant="bordered" value={createForm.dni} onValueChange={(v) => setCreateForm({ ...createForm, dni: v })} />
                        </div>
                        <Select
                            label="Rol"
                            variant="bordered"
                            selectedKeys={createForm.role ? [createForm.role] : []}
                            onSelectionChange={(keys: any) => setCreateForm({ ...createForm, role: Array.from(keys)[0] as string || "CLIENT" })}
                        >
                            <SelectItem key="CLIENT" textValue="Cliente">Cliente</SelectItem>
                            <SelectItem key="VENUE_ADMIN" textValue="Admin de Sede">Admin de Sede</SelectItem>
                            <SelectItem key="ADMIN" textValue="Admin General">Admin General</SelectItem>
                        </Select>
                        {createForm.role === "VENUE_ADMIN" && (
                            <Select
                                label="Sede asignada"
                                placeholder="Seleccionar sede"
                                variant="bordered"
                                selectedKeys={createForm.venueId ? [createForm.venueId] : []}
                                onSelectionChange={(keys: any) => setCreateForm({ ...createForm, venueId: Array.from(keys)[0] as string || "" })}
                            >
                                {(venues || []).map((v) => (
                                    <SelectItem key={v.id} textValue={`${v.name} — ${v.city}`}>{v.name} — {v.city}</SelectItem>
                                ))}
                            </Select>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onCreateClose}>Cancelar</Button>
                        <Button
                            color="primary"
                            onPress={handleCreateSubmit}
                            isLoading={createUserMutation.isPending}
                            isDisabled={!createForm.email || !createForm.password || !createForm.firstName || !createForm.lastName}
                        >
                            Crear Usuario
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Edit Role Modal */}
            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalContent>
                    <ModalHeader>Editar Rol de Usuario</ModalHeader>
                    <ModalBody className="gap-4">
                        {editUser && (
                            <div className="rounded-lg bg-default-50 p-3 mb-2">
                                <p className="font-semibold text-sm">{editUser.firstName} {editUser.lastName}</p>
                                <p className="text-xs text-default-500">{editUser.email}</p>
                            </div>
                        )}
                        <Select
                            label="Rol"
                            variant="bordered"
                            selectedKeys={editRole ? new Set([editRole]) as any : new Set() as any}
                            onSelectionChange={(keys: any) => setEditRole(Array.from(keys)[0] as string || "")}
                        >
                            <SelectItem key="CLIENT" textValue="Cliente">Cliente</SelectItem>
                            <SelectItem key="VENUE_ADMIN" textValue="Admin de Sede">Admin de Sede</SelectItem>
                            <SelectItem key="ADMIN" textValue="Admin General">Admin General</SelectItem>
                        </Select>

                        {editRole === "VENUE_ADMIN" && (
                            <Select
                                label="Sede asignada"
                                placeholder="Seleccionar sede"
                                variant="bordered"
                                selectedKeys={editVenueId ? new Set([editVenueId]) as any : new Set() as any}
                                onSelectionChange={(keys: any) => setEditVenueId(Array.from(keys)[0] as string || "")}
                            >
                                {(venues || []).map((v) => (
                                    <SelectItem key={v.id} textValue={`${v.name} — ${v.city}`}>{v.name} — {v.city}</SelectItem>
                                ))}
                            </Select>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose}>Cancelar</Button>
                        <Button
                            color="primary"
                            onPress={handleSaveRole}
                            isLoading={updateRoleMutation.isPending}
                            isDisabled={editRole === "VENUE_ADMIN" && !editVenueId}
                        >
                            Guardar
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Deactivate Confirm */}
            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => { deactivateMutation.mutate(deleteId!); setDeleteId(null); }}
                title="Desactivar usuario"
                message="¿Estás seguro? El usuario no podrá acceder al sistema."
                confirmLabel="Desactivar"
            />

            {/* Reactivate Confirm */}
            <ConfirmModal
                isOpen={!!reactivateId}
                onClose={() => setReactivateId(null)}
                onConfirm={() => { reactivateMutation.mutate(reactivateId!); setReactivateId(null); }}
                title="Reactivar usuario"
                message="¿Deseas volver a activar este usuario? Podrá acceder nuevamente al sistema."
                confirmLabel="Reactivar"
            />
        </div>
    );
}
