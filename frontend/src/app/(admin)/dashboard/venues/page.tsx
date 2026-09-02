"use client";

import {
  Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Textarea, useDisclosure, Link,
} from "@heroui/react";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { useFacilities } from "@/hooks/use-facilities";
import { fetchProvinces, fetchLocalities } from "@/lib/argentina-locations";
import type { Venue } from "@/types";

const COUNTRY = "Argentina";

export default function AdminVenuesPage() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  // province = id de Georef (para buscar localidades); provinceName = nombre (para guardar)
  const [form, setForm] = useState({ name: "", slug: "", address: "", province: "", provinceName: "", city: "", description: "" });
  const [editForm, setEditForm] = useState({ id: "", name: "", address: "", province: "", provinceName: "", city: "", description: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: venues, isLoading } = useQuery({ queryKey: ["venues"], queryFn: () => apiClient.get<Venue[]>("/venues") });
  const { data: facilities } = useFacilities();

  // Provincias (API Georef). Se cargan una vez y se cachean.
  const { data: provinces } = useQuery({
    queryKey: ["ar-provinces"],
    queryFn: fetchProvinces,
    staleTime: 1000 * 60 * 60 * 24, // 24h
  });

  // Localidades según la provincia del formulario de creación
  const { data: createLocalities, isFetching: loadingCreateLoc } = useQuery({
    queryKey: ["ar-localities", form.province],
    queryFn: () => fetchLocalities(form.province),
    enabled: !!form.province,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // Localidades según la provincia del formulario de edición
  const { data: editLocalities, isFetching: loadingEditLoc } = useQuery({
    queryKey: ["ar-localities", editForm.province],
    queryFn: () => fetchLocalities(editForm.province),
    enabled: !!editForm.province,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const [search, setSearch] = useState("");

  const filteredVenues = useMemo(() => {
    if (!venues) return [];
    if (!search) return venues;
    const q = search.toLowerCase();
    return venues.filter((v) =>
      v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q)
    );
  }, [venues, search]);

  // Count facilities per venue
  const facilitiesCountByVenue = (facilities || []).reduce((acc, f) => {
    acc[f.venueId] = (acc[f.venueId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiClient.post("/venues", {
      name: data.name,
      slug: data.slug,
      address: data.address,
      state: data.provinceName,
      city: data.city,
      country: COUNTRY,
      description: data.description || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); onClose(); addToast("Sede creada correctamente"); },
  });
  const editMutation = useMutation({
    mutationFn: (data: typeof editForm) => apiClient.patch(`/venues/${data.id}`, {
      name: data.name,
      address: data.address,
      state: data.provinceName,
      city: data.city,
      country: COUNTRY,
      description: data.description || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); onEditClose(); addToast("Sede actualizada"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/venues/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); addToast("Sede eliminada"); },
  });

  const handleEdit = (venue: Venue) => {
    const prov = (provinces || []).find((p) => p.nombre === venue.state);
    setEditForm({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      province: prov?.id || "",
      provinceName: venue.state || "",
      city: venue.city,
      description: venue.description || "",
    });
    onEditOpen();
  };

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sedes</h1><p className="text-sm text-default-500 mt-1">Gestiona los complejos deportivos</p></div>
        <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => { setForm({ name: "", slug: "", address: "", province: "", provinceName: "", city: "", description: "" }); onOpen(); }}>Nueva Sede</Button>
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <Input
          placeholder="Buscar por nombre o ciudad..."
          variant="bordered"
          size="sm"
          value={search}
          onValueChange={setSearch}
          startContent={<Search className="h-4 w-4 text-default-400" />}
          isClearable
          onClear={() => setSearch("")}
          className="max-w-md"
        />
        {search && (
          <span className="text-xs text-default-500">
            {filteredVenues.length} resultado{filteredVenues.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <Table aria-label="Sedes">
        <TableHeader>
          <TableColumn>NOMBRE</TableColumn><TableColumn>DIRECCIÓN</TableColumn><TableColumn>CIUDAD</TableColumn><TableColumn>INSTALACIONES</TableColumn><TableColumn>ESTADO</TableColumn><TableColumn>ACCIONES</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No hay sedes">
          {filteredVenues.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="font-medium"><Link href={`/dashboard/venues/${v.id}`} className="hover:text-primary transition-colors">{v.name}</Link></TableCell>
              <TableCell>{v.address}</TableCell>
              <TableCell>{v.city}</TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={facilitiesCountByVenue[v.id] ? "primary" : "default"}>
                  {facilitiesCountByVenue[v.id] || 0}
                </Chip>
              </TableCell>
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
            <Input label="Dirección" variant="bordered" value={form.address} onValueChange={(v) => setForm({ ...form, address: v })} />
            <div className="grid grid-cols-2 gap-4">
              <Autocomplete
                label="Provincia"
                placeholder="Buscar provincia..."
                variant="bordered"
                selectedKey={form.province || null}
                onSelectionChange={(key) => {
                  const id = (key as string) || "";
                  const name = (provinces || []).find((p) => p.id === id)?.nombre || "";
                  setForm({ ...form, province: id, provinceName: name, city: "" });
                }}
              >
                {(provinces || []).map((p) => (
                  <AutocompleteItem key={p.id}>{p.nombre}</AutocompleteItem>
                ))}
              </Autocomplete>
              <Autocomplete
                label="Localidad"
                placeholder={form.province ? "Buscar localidad..." : "Elige una provincia primero"}
                variant="bordered"
                isDisabled={!form.province}
                isLoading={loadingCreateLoc}
                selectedKey={form.city || null}
                onSelectionChange={(key) => setForm({ ...form, city: (key as string) || "" })}
              >
                {(createLocalities || []).map((c) => (
                  <AutocompleteItem key={c.nombre}>{c.nombre}</AutocompleteItem>
                ))}
              </Autocomplete>
            </div>
            <Textarea label="Descripción" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
          </ModalBody>
          <ModalFooter><Button variant="light" onPress={onClose}>Cancelar</Button><Button color="primary" onPress={() => createMutation.mutate(form)} isLoading={createMutation.isPending} isDisabled={!form.name || !form.province || !form.city}>Crear</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isEditOpen} onClose={onEditClose} size="2xl">
        <ModalContent>
          <ModalHeader>Editar Sede</ModalHeader>
          <ModalBody className="gap-4">
            <Input label="Nombre" variant="bordered" value={editForm.name} onValueChange={(v) => setEditForm({ ...editForm, name: v })} />
            <Input label="Dirección" variant="bordered" value={editForm.address} onValueChange={(v) => setEditForm({ ...editForm, address: v })} />
            <div className="grid grid-cols-2 gap-4">
              <Autocomplete
                label="Provincia"
                placeholder="Buscar provincia..."
                variant="bordered"
                selectedKey={editForm.province || null}
                onSelectionChange={(key) => {
                  const id = (key as string) || "";
                  const name = (provinces || []).find((p) => p.id === id)?.nombre || "";
                  setEditForm({ ...editForm, province: id, provinceName: name, city: "" });
                }}
              >
                {(provinces || []).map((p) => (
                  <AutocompleteItem key={p.id}>{p.nombre}</AutocompleteItem>
                ))}
              </Autocomplete>
              <Autocomplete
                label="Localidad"
                placeholder={editForm.province ? "Buscar localidad..." : "Elige una provincia primero"}
                variant="bordered"
                isDisabled={!editForm.province}
                isLoading={loadingEditLoc}
                selectedKey={editForm.city || null}
                onSelectionChange={(key) => setEditForm({ ...editForm, city: (key as string) || "" })}
              >
                {(editLocalities || []).map((c) => (
                  <AutocompleteItem key={c.nombre}>{c.nombre}</AutocompleteItem>
                ))}
              </Autocomplete>
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
