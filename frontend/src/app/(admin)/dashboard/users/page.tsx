"use client";
import { toAppError } from '@/lib/error-messages'

import {
    Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure, Pagination,
} from "@heroui/react";
import { DataTable } from "@/components/shared/data-table";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { camelize, invokeFunction, Tables } from "@/lib/supabase-helpers";
import { useVenues } from "@/hooks/use-venues";
import { UserX, UserCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { PhoneInput } from "@/components/shared/phone-input";
import { DniInput } from "@/components/shared/dni-input";
import { useToastStore } from "@/stores/toast-store";
import type { User, Venue } from "@/types";

const ROLE_COLORS: Record<string, "secondary" | "warning" | "default"> = {
    ADMIN: "secondary",
    VENUE_ADMIN: "warning",
    CLIENT: "default",
};

const ROLE_LABELS: Record<string, string> = {
    ADMIN: "Admin General",
    VENUE_ADMIN: "Admin Complejo",
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
    const [editForm, setEditForm] = useState({
        firstName: "",
        lastName: "",
        dni: "",
        phone: "",
    });
    const [editPhoneCountryCode, setEditPhoneCountryCode] = useState("+54");
    const [editPhoneError, setEditPhoneError] = useState<string | null>(null);
    const [editDniError, setEditDniError] = useState<string | null>(null);
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

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

    const PAGE_SIZE = 20;
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [filterRole, setFilterRole] = useState("");
    const [filterVenue, setFilterVenue] = useState("");

    // Reset a página 1 cuando cambian los filtros
    const handleSearch = (v: string) => { setSearch(v); setPage(1); };
    const handleFilterRole = (v: string) => { setFilterRole(v); setPage(1); };
    const handleFilterVenue = (v: string) => { setFilterVenue(v); setPage(1); };

    const { data, isLoading } = useQuery({
        queryKey: ["admin-users", page, search, filterRole, filterVenue],
        queryFn: async (): Promise<{ data: User[]; meta: { total: number } }> => {
            const from = (page - 1) * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            let query = supabase
                .from("profiles")
                .select("*", { count: "exact" })
                .order("created_at", { ascending: false })
                .range(from, to);

            // Filtros aplicados en el servidor — sin traer todos los registros al cliente
            if (filterRole) query = query.eq("role", filterRole as any);
            if (filterVenue) query = query.eq("venue_id", filterVenue);
            if (search) {
                // Búsqueda por nombre completo, email o DNI (ilike = case-insensitive)
                query = query.or(
                    `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,dni.ilike.%${search}%`
                );
            }

            const { data: rows, error, count } = await query;
            if (error) throw toAppError(error);
            return {
                data: (rows ?? []).map((r) => camelize(r as Tables<'profiles'>) as unknown as User),
                meta: { total: count ?? 0 },
            };
        },
        placeholderData: (prev) => prev, // mantiene los datos anteriores al paginar
    });

    const { data: venues } = useVenues();

    const deactivateMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", id);
            if (error) throw toAppError(error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            addToast("Usuario desactivado");
        },
    });

    const reactivateMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("profiles").update({ is_active: true }).eq("id", id);
            if (error) throw toAppError(error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            addToast("Usuario reactivado");
        },
    });

    const updateRoleMutation = useMutation({
        mutationFn: async ({ id, role, venueId }: { id: string; role: string; venueId?: string }) => {
            // Actualizar profiles
            const { error } = await supabase.from("profiles")
                .update({ role: role as any, venue_id: venueId || null })
                .eq("id", id);
            if (error) throw toAppError(error);
            // Actualizar app_metadata para que el JWT refleje el nuevo rol
            const { error: fnErr } = await invokeFunction('admin-set-role', { user_id: id, role, venue_id: venueId || null });
            if (fnErr) console.warn("set_user_role:", fnErr); // best-effort
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onClose();
            addToast("Rol actualizado. El usuario debe cerrar sesión para ver el cambio.");
        },
    });

    const createUserMutation = useMutation({
        mutationFn: async (data: any) => {
            const { data: result, error } = await invokeFunction('admin-create-user', {
                email: data.email,
                password: data.password,
                first_name: data.firstName,
                last_name: data.lastName,
                phone: data.phone,
                dni: data.dni,
                role: data.role,
                venue_id: data.venueId || null,
            });
            if (error) throw new Error(error);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onCreateClose();
            addToast("Usuario creado correctamente");
            setCreateForm({ email: "", password: "", firstName: "", lastName: "", phone: "", dni: "", role: "CLIENT", venueId: "" });
        },
        onError: (error: any) => {
            addToast(error?.message || "Error al crear usuario");
        },
    });

    const updateProfileMutation = useMutation({
        mutationFn: async ({ id, firstName, lastName, dni, phone, role, venueId }: {
            id: string; firstName: string; lastName: string; dni: string; phone: string; role: string; venueId?: string;
        }) => {
            // Paso 1: actualizar datos personales en profiles (nombre, DNI, teléfono)
            const { error: profileErr } = await supabase.from("profiles").update({
                first_name: firstName,
                last_name: lastName,
                dni: dni || null,
                phone: phone || null,
            }).eq("id", id);
            if (profileErr) throw toAppError(profileErr);

            // Paso 2: sincronizar rol + venue_id en profiles Y en app_metadata del JWT.
            // Siempre a través de admin-set-role para garantizar consistencia.
            // Si esto falla, el error se propaga y se muestra al admin (no silencioso).
            const { error: roleErr } = await invokeFunction('admin-set-role', {
                user_id: id,
                role,
                venue_id: venueId || null,
            });
            if (roleErr) throw new Error(`Error al asignar rol: ${roleErr}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onClose();
            addToast("Usuario actualizado. Si cambió el rol, el usuario debe cerrar sesión para verlo.");
        },
        onError: (error: any) => {
            addToast(error?.message || "Error al actualizar el usuario");
        },
    });

    const deleteUserMutation = useMutation({
        mutationFn: async (id: string) => {
            // Usar Edge Function que elimina de auth.users con service_role.
            // La eliminación en auth.users propaga en cascada a profiles.
            const { error } = await invokeFunction('admin-delete-user', { user_id: id });
            if (error) throw new Error(error);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            setDeleteUserId(null);
            onClose();
            addToast("Usuario eliminado del sistema");
        },
        onError: (error: any) => {
            setDeleteUserId(null);
            addToast(error?.message || "Error al eliminar el usuario");
        },
    });

    const handleEditRole = (user: User) => {
        setEditUser(user);
        setEditRole(user.role);
        setEditVenueId(user.venueId || "");
        setEditPhoneError(null);
        setEditDniError(null);
        // Detectar el código de país del teléfono guardado (ej: "+54 11 2345-6789")
        const savedPhone = user.phone || "";
        const matchedCode = ["+593", "+598", "+591", "+595", "+54", "+57", "+56", "+52", "+51", "+58", "+34", "+55", "+1"]
            .find((c) => savedPhone.startsWith(c));
        if (matchedCode) {
            setEditPhoneCountryCode(matchedCode);
            setEditForm({
                firstName: user.firstName || "",
                lastName: user.lastName || "",
                dni: user.dni || "",
                phone: savedPhone.slice(matchedCode.length).trim(),
            });
        } else {
            setEditPhoneCountryCode("+54");
            setEditForm({
                firstName: user.firstName || "",
                lastName: user.lastName || "",
                dni: user.dni || "",
                phone: savedPhone,
            });
        }
        onOpen();
    };

    const handleSaveEdit = () => {
        if (!editUser) return;
        // Bloquear si hay errores de validación
        if (editDniError || editPhoneError) return;
        updateProfileMutation.mutate({
            id: editUser.id,
            firstName: editForm.firstName,
            lastName: editForm.lastName,
            dni: editForm.dni,
            // Guardar teléfono con el código de país prefijado
            phone: editForm.phone ? `${editPhoneCountryCode} ${editForm.phone}` : "",
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

    const allUsers = data?.data || [];
    const totalUsers = data?.meta.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

    // Con paginación server-side, data?.data ya viene filtrada
    const users = allUsers;

    if (isLoading) {
        return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Usuarios</h1>
                    <p className="text-sm text-default-500 mt-1">
                        {totalUsers > 0 ? `${totalUsers} usuario${totalUsers !== 1 ? "s" : ""} en el sistema` : "Gestiona los usuarios de la plataforma"}
                    </p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={onCreateOpen}>
                    Nuevo Usuario
                </Button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Input
                    placeholder="Buscar por nombre, DNI o email..."
                    variant="bordered"
                    size="sm"
                    value={search}
                    onValueChange={handleSearch}
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    isClearable
                    onClear={() => handleSearch("")}
                />
                <Select
                    placeholder="Filtrar por rol"
                    variant="bordered"
                    size="sm"
                    selectedKeys={filterRole ? [filterRole] : []}
                    onSelectionChange={(keys: any) => handleFilterRole(Array.from(keys)[0] as string || "")}
                >
                    <SelectItem key="CLIENT">Cliente</SelectItem>
                    <SelectItem key="VENUE_ADMIN">Admin Complejo</SelectItem>
                    <SelectItem key="ADMIN">Admin General</SelectItem>
                </Select>
                <Select
                    placeholder="Filtrar por complejo"
                    variant="bordered"
                    size="sm"
                    selectedKeys={filterVenue ? [filterVenue] : []}
                    onSelectionChange={(keys: any) => handleFilterVenue(Array.from(keys)[0] as string || "")}
                >
                    {(venues || []).map((v) => (
                        <SelectItem key={v.id}>{v.name}</SelectItem>
                    ))}
                </Select>
            </div>

            {(search || filterRole || filterVenue) && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-default-500">
                        {totalUsers} resultado{totalUsers !== 1 ? "s" : ""}
                    </span>
                    <Button size="sm" variant="light" color="danger" onPress={() => { handleSearch(""); handleFilterRole(""); handleFilterVenue(""); }}>
                        Limpiar filtros
                    </Button>
                </div>
            )}

            <DataTable aria-label="Usuarios">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>DNI</TableColumn>
                    <TableColumn>EMAIL</TableColumn>
                    <TableColumn>TELÉFONO</TableColumn>
                    <TableColumn>ROL</TableColumn>
                    <TableColumn>COMPLEJO</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay usuarios">
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                            <TableCell className="text-sm text-default-500">{user.dni || "—"}</TableCell>
                            <TableCell className="text-sm text-default-500">{user.email}</TableCell>
                            <TableCell className="text-sm text-default-500">{user.phone || "—"}</TableCell>
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
                                <Chip color={user.isActive ? "success" : "danger"} size="sm" variant="flat">
                                    {user.isActive ? "Activo" : "Inactivo"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEditRole(user)} title="Editar">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    {user.isActive && user.role !== "ADMIN" && (
                                        <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(user.id)} title="Desactivar">
                                            <UserX className="h-4 w-4" />
                                        </Button>
                                    )}
                                    {!user.isActive && (
                                        <Button size="sm" color="success" variant="light" isIconOnly onPress={() => setReactivateId(user.id)} title="Reactivar">
                                            <UserCheck className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </DataTable>

            {/* Paginación */}
            {totalPages > 1 && (
                <div className="flex justify-center">
                    <Pagination
                        showControls
                        total={totalPages}
                        page={page}
                        onChange={setPage}
                        size="sm"
                    />
                </div>
            )}

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
                            <SelectItem key="VENUE_ADMIN" textValue="Admin de Complejo">Admin de Complejo</SelectItem>
                            <SelectItem key="ADMIN" textValue="Admin General">Admin General</SelectItem>
                        </Select>
                        {createForm.role === "VENUE_ADMIN" && (
                            <Select
                                label="Complejo asignado"
                                placeholder="Seleccionar complejo"
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

            {/* Edit User Modal */}
            <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside" placement="center">
                <ModalContent>
                    <ModalHeader className="flex items-center justify-between pr-10">
                        <span>Editar Usuario</span>
                    </ModalHeader>
                    <ModalBody className="gap-4">
                        {editUser && (
                            <div className="rounded-lg bg-default-50 px-4 py-3 text-sm">
                                <p className="font-semibold">{editUser.firstName} {editUser.lastName}</p>
                                <p className="text-default-500 text-xs mt-0.5">{editUser.email}</p>
                            </div>
                        )}

                        {/* Datos personales */}
                        <div className="grid grid-cols-2 gap-3">
                            <Input
                                label="Nombre"
                                variant="bordered"
                                value={editForm.firstName}
                                onValueChange={(v) => setEditForm({ ...editForm, firstName: v })}
                                isRequired
                            />
                            <Input
                                label="Apellido"
                                variant="bordered"
                                value={editForm.lastName}
                                onValueChange={(v) => setEditForm({ ...editForm, lastName: v })}
                                isRequired
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <DniInput
                                value={editForm.dni}
                                onChange={(v) => { setEditForm({ ...editForm, dni: v }); }}
                                excludeUserId={editUser?.id}
                                error={editDniError}
                                onError={setEditDniError}
                            />
                            <PhoneInput
                                value={editForm.phone}
                                onChange={(v) => setEditForm({ ...editForm, phone: v })}
                                countryCode={editPhoneCountryCode}
                                onCountryCodeChange={setEditPhoneCountryCode}
                                error={editPhoneError}
                                onError={setEditPhoneError}
                            />
                        </div>

                        {/* Rol */}
                        <Select
                            label="Rol"
                            variant="bordered"
                            selectedKeys={editRole ? new Set([editRole]) as any : new Set() as any}
                            onSelectionChange={(keys: any) => setEditRole(Array.from(keys)[0] as string || "")}
                        >
                            <SelectItem key="CLIENT" textValue="Cliente">Cliente</SelectItem>
                            <SelectItem key="VENUE_ADMIN" textValue="Admin de Complejo">Admin de Complejo</SelectItem>
                            <SelectItem key="ADMIN" textValue="Admin General">Admin General</SelectItem>
                        </Select>

                        {editRole === "VENUE_ADMIN" && (
                            <Select
                                label="Complejo asignado"
                                placeholder="Seleccionar complejo"
                                variant="bordered"
                                selectedKeys={editVenueId ? new Set([editVenueId]) as any : new Set() as any}
                                onSelectionChange={(keys: any) => setEditVenueId(Array.from(keys)[0] as string || "")}
                            >
                                {(venues || []).map((v) => (
                                    <SelectItem key={v.id} textValue={`${v.name} — ${v.city}`}>{v.name} — {v.city}</SelectItem>
                                ))}
                            </Select>
                        )}

                        {/* Zona peligrosa */}
                        {editUser?.role !== "ADMIN" && (
                            <div className="rounded-lg border border-danger-200 bg-danger-50 dark:bg-danger-500/10 px-4 py-3">
                                <p className="text-sm font-semibold text-danger mb-1">Zona peligrosa</p>
                                <p className="text-xs text-danger/70 mb-3">
                                    Eliminar el usuario borra permanentemente su cuenta y todos sus datos. Esta acción no se puede deshacer.
                                </p>
                                <Button
                                    size="sm"
                                    color="danger"
                                    variant="flat"
                                    startContent={<Trash2 className="h-3.5 w-3.5" />}
                                    onPress={() => setDeleteUserId(editUser!.id)}
                                    isLoading={deleteUserMutation.isPending}
                                >
                                    Eliminar usuario
                                </Button>
                            </div>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose}>Cancelar</Button>
                        <Button
                            color="primary"
                            onPress={handleSaveEdit}
                            isLoading={updateProfileMutation.isPending}
                            isDisabled={!editForm.firstName || !editForm.lastName || (editRole === "VENUE_ADMIN" && !editVenueId)}
                        >
                            Guardar cambios
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Confirm delete user */}
            <ConfirmModal
                isOpen={!!deleteUserId}
                onClose={() => setDeleteUserId(null)}
                onConfirm={() => { deleteUserMutation.mutate(deleteUserId!); }}
                title="Eliminar usuario"
                message={`¿Estás seguro que querés eliminar a ${editUser?.firstName} ${editUser?.lastName}? Esta acción borrará permanentemente su cuenta y todos sus datos. No se puede deshacer.`}
                confirmLabel="Sí, eliminar"
            />

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
