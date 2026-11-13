"use client";
import { toAppError } from '@/lib/error-messages'

import {
  Button, Chip, Spinner, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Textarea, useDisclosure, Link,
} from "@heroui/react";
import { DataTable } from "@/components/shared/data-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { camelize } from "@/lib/supabase-helpers";
import { useAllVenues } from "@/hooks/use-venues";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { useFacilities } from "@/hooks/use-facilities";
import { MunicipalityFields } from "@/components/shared/municipality-fields";
import { useLocalityIndex } from "@/components/shared/locality-picker";
import { PROVINCES } from "@/lib/ar-provinces";
import { ImageUpload } from "@/components/shared/image-upload";
import type { Venue } from "@/types";

const COUNTRY = "Argentina";

// Servicios/amenidades que puede ofrecer una sede
const AMENITIES = [
  { key: "Vestuarios", emoji: "🚪" },
  { key: "Duchas", emoji: "🚿" },
  { key: "Baños", emoji: "🚻" },
  { key: "WiFi", emoji: "📶" },
  { key: "Estacionamiento", emoji: "🅿️" },
  { key: "Parrilla", emoji: "🔥" },
  { key: "Buffet", emoji: "🍔" },
  { key: "Iluminación nocturna", emoji: "💡" },
  { key: "Alquiler de pecheras", emoji: "🎽" },
  { key: "Cafetería", emoji: "☕" },
  { key: "Tribunas", emoji: "🪑" },
  { key: "Aire acondicionado", emoji: "❄️" },
  { key: "Kiosco", emoji: "🏪" },
  { key: "Seguridad", emoji: "🛡️" },
  { key: "Accesible", emoji: "♿" },
];

export default function AdminVenuesPage() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  // Ubicación = provincia (ISO) + municipio del catálogo. La base completa city/state desde
  // locality_code (trigger venue_fill_municipality, migración 041).
  const [form, setForm] = useState({ name: "", slug: "", address: "", provinceCode: "", localityCode: "", description: "", amenities: [] as string[], imageUrl: "" });
  const [editForm, setEditForm] = useState({ id: "", name: "", address: "", provinceCode: "", localityCode: "", description: "", amenities: [] as string[], imageUrl: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const toggleCreateAmenity = (a: string) =>
    setForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }));
  const toggleEditAmenity = (a: string) =>
    setEditForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }));

  const { data: venues, isLoading } = useAllVenues();
  const { data: facilities } = useFacilities();

  // Catálogo de municipios (mismo de la publicidad), para ubicar los complejos existentes
  const { data: localityIndex } = useLocalityIndex();

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
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from("venues").insert({
        name: data.name,
        slug: data.slug,
        address: data.address,
        locality_code: data.localityCode || null,
        country: COUNTRY,
        description: data.description || null,
        amenities: data.amenities,
        image_url: data.imageUrl || null,
      });
      if (error) throw toAppError(error);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); onClose(); addToast("Complejo creado correctamente"); },
    onError: (error: any) => { addToast(error?.message || "No se pudo crear el complejo"); },
  });
  const editMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const { error } = await supabase.from("venues").update({
        name: data.name,
        address: data.address,
        locality_code: data.localityCode || null,
        country: COUNTRY,
        description: data.description || null,
        amenities: data.amenities,
        image_url: data.imageUrl || null,
      }).eq("id", data.id);
      if (error) throw toAppError(error);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); onEditClose(); addToast("Complejo actualizado"); },
    onError: (error: any) => { addToast(error?.message || "No se pudo actualizar el complejo"); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("venues").delete().eq("id", id);
      if (error) throw toAppError(error);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); addToast("Complejo eliminado"); },
  });

  const handleEdit = (venue: Venue) => {
    // Provincia: la del municipio guardado; si todavía no tiene, la que coincide por nombre
    const loc = venue.localityCode ? localityIndex?.get(venue.localityCode) : undefined;
    const provinceCode = loc?.province ?? PROVINCES.find((p) => p.name === venue.state)?.code ?? "";
    setEditForm({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      provinceCode,
      localityCode: venue.localityCode ?? "",
      description: venue.description || "",
      amenities: venue.amenities || [],
      imageUrl: venue.imageUrl || "",
    });
    onEditOpen();
  };

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Complejos</h1><p className="text-sm text-default-500 mt-1">Gestiona los complejos deportivos</p></div>
        <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => { setForm({ name: "", slug: "", address: "", provinceCode: "", localityCode: "", description: "", amenities: [], imageUrl: "" }); onOpen(); }}>Nuevo Complejo</Button>
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <Input
          placeholder="Buscar por nombre o municipio..."
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

      <DataTable aria-label="Complejos">
        <TableHeader>
          <TableColumn>NOMBRE</TableColumn><TableColumn>DIRECCIÓN</TableColumn><TableColumn>MUNICIPIO</TableColumn><TableColumn>INSTALACIONES</TableColumn><TableColumn>ESTADO</TableColumn><TableColumn>ACCIONES</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No hay complejos">
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
              <TableCell><Chip color={v.isActive ? "success" : "danger"} size="sm" variant="flat">{v.isActive ? "Activa" : "Inactiva"}</Chip></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEdit(v)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(v.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>

      <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside" placement="center">
        <ModalContent>
          <ModalHeader>Nuevo Complejo</ModalHeader>
          <ModalBody className="gap-4">
            <Input label="Nombre" variant="bordered" value={form.name} onValueChange={(v) => setForm({ ...form, name: v, slug: v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })} />
            <Input label="Dirección" variant="bordered" value={form.address} onValueChange={(v) => setForm({ ...form, address: v })} />
            <MunicipalityFields
              isRequired
              value={{ provinceCode: form.provinceCode, localityCode: form.localityCode }}
              onChange={(v) => setForm({ ...form, ...v })}
            />
            <Textarea label="Descripción" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
            <ImageUpload value={form.imageUrl} onChange={(url) => setForm({ ...form, imageUrl: url })} />
            <div>
              <p className="text-xs text-default-500 mb-2">Servicios disponibles</p>
              <div className="flex flex-wrap gap-2">
                {AMENITIES.map((a) => {
                  const active = form.amenities.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => toggleCreateAmenity(a.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${active ? "border-primary bg-primary/10 text-primary" : "border-divider text-default-600 hover:border-primary"}`}
                    >
                      {a.emoji} {a.key}
                    </button>
                  );
                })}
              </div>
            </div>
          </ModalBody>
          <ModalFooter><Button variant="light" onPress={onClose}>Cancelar</Button><Button color="primary" onPress={() => createMutation.mutate(form)} isLoading={createMutation.isPending} isDisabled={!form.name || !form.localityCode}>Crear</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isEditOpen} onClose={onEditClose} size="2xl" scrollBehavior="inside" placement="center">
        <ModalContent>
          <ModalHeader>Editar Complejo</ModalHeader>
          <ModalBody className="gap-4">
            <Input label="Nombre" variant="bordered" value={editForm.name} onValueChange={(v) => setEditForm({ ...editForm, name: v })} />
            <Input label="Dirección" variant="bordered" value={editForm.address} onValueChange={(v) => setEditForm({ ...editForm, address: v })} />
            <MunicipalityFields
              isRequired
              value={{ provinceCode: editForm.provinceCode, localityCode: editForm.localityCode }}
              onChange={(v) => setEditForm({ ...editForm, ...v })}
            />
            <Textarea label="Descripción" variant="bordered" value={editForm.description} onValueChange={(v) => setEditForm({ ...editForm, description: v })} />
            <ImageUpload value={editForm.imageUrl} onChange={(url) => setEditForm({ ...editForm, imageUrl: url })} />
            <div>
              <p className="text-xs text-default-500 mb-2">Servicios disponibles</p>
              <div className="flex flex-wrap gap-2">
                {AMENITIES.map((a) => {
                  const active = editForm.amenities.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => toggleEditAmenity(a.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${active ? "border-primary bg-primary/10 text-primary" : "border-divider text-default-600 hover:border-primary"}`}
                    >
                      {a.emoji} {a.key}
                    </button>
                  );
                })}
              </div>
            </div>
          </ModalBody>
          <ModalFooter><Button variant="light" onPress={onEditClose}>Cancelar</Button><Button color="primary" onPress={() => editMutation.mutate(editForm)} isLoading={editMutation.isPending} isDisabled={!editForm.name || !editForm.localityCode}>Guardar</Button></ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }} title="Eliminar complejo" message="¿Estás seguro? Esta acción no se puede deshacer." confirmLabel="Eliminar" />
    </div>
  );
}
