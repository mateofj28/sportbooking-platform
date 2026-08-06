"use client";

import {
  Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Textarea, useDisclosure,
} from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import type { Venue } from "@/types";

export default function AdminVenuesPage() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const [form, setForm] = useState({ name: "", slug: "", address: "", city: "", country: "", description: "" });
  const [editForm, setEditForm] = useState({ id: "", name: "", address: "", city: "", country: "", description: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: venues, isLoading } = useQuery({ queryKey: ["venues"], queryFn: () => apiClient.get<Venue[]>("/venues") });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post("/venues", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); onClose(); addToast("Sede creada correctamente"); },
  });
  const editMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiClient.patch(`/venues/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); onEditClose(); addToast("Sede actualizada"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/venues/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); addToast("Sede eliminada"); },
  });

  const handleEdit = (venue: Venue) => {
    setEditForm({ id: venue.id, name: venue.name, address: venue.address, city: venue.city, country: venue.country, description: venue.description || "" });
    onEditOpen();
  };

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sedes</h1><p className="text-sm text-default-500 mt-1">Gestiona los complejos deportivos</p></div>
        <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => { setForm({ name: "", slug: "", address: "", city: "", country: "Colombia", description: "" }); onOpen(); }}>Nueva Sede</Button>
      </div>

      <Table aria-label="Sedes">
        <TableHeader>
          <TableColumn>NOMBRE</TableColumn><TableColumn>DIRECCIÓN</TableColumn><TableColumn>CIUDAD</TableColumn><TableColumn>ESTADO</TableColumn><TableColumn>ACCIONES</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No hay sedes">
          {(venues || []).map((v) => (
            <TableRow key={v.id}>
              <TableCell className="font-medium">{v.name}</TableCell>
              <TableCell>{v.address}</TableCell>
              <TableCell>{v.city}</TableCell>
              <TableCell><Chip color={v.isActive ? "success" : "danger"} size="sm" variant="dot">{v.isActive ? "Activa" : "Inactiva"}</Chip></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEdit(v)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(v.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader>Nueva Sede</ModalHeader>
          <ModalBody className="gap-4">
            <Input label="Nombre" variant="bordered" value={form.name} onValueChange={(v) => setForm({ ...form, name: v, slug: v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })} />
            <Input label="Slug" variant="bordered" value={form.slug} onValueChange={(v) => setForm({ ...form, slug: v })} />
            <Input label="Dirección" variant="bordered" value={form.address} onValueChange={(v) => setForm({ ...form, address: v })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Ciudad" variant="bordered" value={form.city} onValueChange={(v) => setForm({ ...form, city: v })} />
              <Input label="País" variant="bordered" value={form.country} onValueChange={(v) => setForm({ ...form, country: v })} />
            </div>
            <Textarea label="Descripción" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
          </ModalBody>
          <ModalFooter><Button variant="light" onPress={onClose}>Cancelar</Button><Button color="primary" onPress={() => createMutation.mutate(form)} isLoading={createMutation.isPending}>Crear</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isEditOpen} onClose={onEditClose} size="2xl">
        <ModalContent>
          <ModalHeader>Editar Sede</ModalHeader>
          <ModalBody className="gap-4">
            <Input label="Nombre" variant="bordered" value={editForm.name} onValueChange={(v) => setEditForm({ ...editForm, name: v })} />
            <Input label="Dirección" variant="bordered" value={editForm.address} onValueChange={(v) => setEditForm({ ...editForm, address: v })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Ciudad" variant="bordered" value={editForm.city} onValueChange={(v) => setEditForm({ ...editForm, city: v })} />
              <Input label="País" variant="bordered" value={editForm.country} onValueChange={(v) => setEditForm({ ...editForm, country: v })} />
            </div>
            <Textarea label="Descripción" variant="bordered" value={editForm.description} onValueChange={(v) => setEditForm({ ...editForm, description: v })} />
          </ModalBody>
          <ModalFooter><Button variant="light" onPress={onEditClose}>Cancelar</Button><Button color="primary" onPress={() => editMutation.mutate(editForm)} isLoading={editMutation.isPending}>Guardar</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }} title="Eliminar sede" message="¿Estás seguro? Esta acción no se puede deshacer." confirmLabel="Eliminar" />
    </div>
  );
}
