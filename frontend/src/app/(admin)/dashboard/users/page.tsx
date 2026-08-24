"use client";

import {
    Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { UserX, Pencil } from "lucide-react";
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
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [editUser, setEditUser] = useState<User | null>(null);
    const [editRole, setEditRole] = useState("");
    const [editVenueId, setEditVenueId] = useState("");

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

    const updateRoleMutation = useMutation({
        mutationFn: ({ id, role, venueId }: { id: string; role: string; venueId?: string }) =>
            apiClient.patch(`/users/${id}`, { role, venueId: venueId || null }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            onClose();
            addToast("Rol actualizado correctamente");
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

    if (isLoading) {
      return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
  }

    const users = data?.data || [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Usuarios</h1>
                <p className="text-sm text-default-500 mt-1">Gestiona los usuarios de la plataforma</p>
            </div>

          <Table aria-label="Usuarios">
              <TableHeader>
                  <TableColumn>NOMBRE</TableColumn>
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
                      </div>
                  </TableCell>
              </TableRow>
          ))}
              </TableBody>
          </Table>

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

          <ConfirmModal
              isOpen={!!deleteId}
              onClose={() => setDeleteId(null)}
              onConfirm={() => { deactivateMutation.mutate(deleteId!); setDeleteId(null); }}
              title="Desactivar usuario"
              message="¿Estás seguro? El usuario no podrá acceder al sistema."
              confirmLabel="Desactivar"
          />
      </div>
  );
}
