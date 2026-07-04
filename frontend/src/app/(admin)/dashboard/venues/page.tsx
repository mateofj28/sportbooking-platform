"use client";

import {
  Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Textarea, useDisclosure,
} from "@heroui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Venue } from "@/types";

export default function AdminVenuesPage() {
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [form, setForm] = useState({ name: "", slug: "", address: "", city: "", country: "", description: "" });

  const { data: venues, isLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: () => apiClient.get<Venue[]>("/venues"),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post("/venues", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/venues/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["venues"] }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sedes</h1>
          <p className="text-sm text-default-500 mt-1">Gestiona los complejos deportivos</p>
        </div>
        <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => { setForm({ name: "", slug: "", address: "", city: "", country: "Argentina", description: "" }); onOpen(); }}>
          Nueva Sede
        </Button>
      </div>

      <Table aria-label="Sedes">
        <TableHeader>
          <TableColumn>NOMBRE</TableColumn>
          <TableColumn>DIRECCIÓN</TableColumn>
          <TableColumn>CIUDAD</TableColumn>
          <TableColumn>ESTADO</TableColumn>
          <TableColumn>ACCIONES</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No hay sedes">
          {(venues || []).map((venue) => (
            <TableRow key={venue.id}>
              <TableCell className="font-medium">{venue.name}</TableCell>
              <TableCell>{venue.address}</TableCell>
              <TableCell>{venue.city}</TableCell>
              <TableCell>
                <Chip color={venue.isActive ? "success" : "danger"} size="sm" variant="dot">
                  {venue.isActive ? "Activa" : "Inactiva"}
                </Chip>
              </TableCell>
              <TableCell>
                <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteMutation.mutate(venue.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
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
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button color="primary" onPress={() => createMutation.mutate(form)} isLoading={createMutation.isPending}>Crear</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
