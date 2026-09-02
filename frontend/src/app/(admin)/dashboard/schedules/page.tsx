"use client";

import {
  Button, Chip, Spinner, Card, CardBody, CardHeader, Divider,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Clock, Pencil } from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { VenueFacilityPicker } from "@/components/shared/venue-facility-picker";
import type { Schedule } from "@/types";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Opciones de hora cada 30 min en formato 12h (AM/PM)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  const value = `${hours.toString().padStart(2, "0")}:${minutes}`;
  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours < 12 ? "AM" : "PM";
  return { value, label: `${h12}:${minutes} ${ampm}` };
});

/** Convierte "08:00" -> "8:00 AM" */
function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function AdminSchedulesPage() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [form, setForm] = useState({ days: [] as number[], openTime: "08:00", closeTime: "22:00" });
  const [editForm, setEditForm] = useState({ id: "", dayOfWeek: "0", openTime: "08:00", closeTime: "22:00" });
  const [isCreating, setIsCreating] = useState(false);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["schedules", selectedFacility],
    queryFn: () => apiClient.get<Schedule[]>(`/facilities/${selectedFacility}/schedules`),
    enabled: !!selectedFacility,
  });

  // (creación en lote más abajo con handleCreate)
  // Alternar un día en la selección múltiple
  const toggleDay = (day: number) =>
    setForm((f) => ({ ...f, days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day] }));

  const setDays = (days: number[]) => setForm((f) => ({ ...f, days }));

  // Crear horarios para todos los días seleccionados
  const handleCreate = async () => {
    if (form.days.length === 0) {
      addToast("Selecciona al menos un día");
      return;
    }
    setIsCreating(true);
    const created: number[] = [];
    const skipped: string[] = [];
    for (const day of form.days) {
      try {
        await apiClient.post(`/facilities/${selectedFacility}/schedules`, {
          dayOfWeek: day,
          openTime: form.openTime,
          closeTime: form.closeTime,
        });
        created.push(day);
      } catch (error: any) {
        const msg = error?.message || "error";
        skipped.push(`${DAYS[day]}`);
      }
    }
    setIsCreating(false);
    queryClient.invalidateQueries({ queryKey: ["schedules", selectedFacility] });
    onClose();
    if (created.length > 0) {
      addToast(`${created.length} horario${created.length !== 1 ? "s" : ""} creado${created.length !== 1 ? "s" : ""}`);
    }
    if (skipped.length > 0) {
      addToast(`No se crearon (ya existían o solapan): ${skipped.join(", ")}`);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/schedules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["schedules", selectedFacility] }); addToast("Item eliminado correctamente"); },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; dayOfWeek: number; openTime: string; closeTime: string }) =>
      apiClient.patch(`/schedules/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["schedules", selectedFacility] }); onEditClose(); addToast("Horario actualizado correctamente"); },
    onError: (error: any) => {
      const msg = error?.message || error?.response?.data?.message || "No se pudo actualizar el horario";
      addToast(Array.isArray(msg) ? msg[0] : msg);
    },
  });

  const handleEdit = (s: Schedule) => {
    setEditForm({ id: s.id, dayOfWeek: String(s.dayOfWeek), openTime: s.openTime, closeTime: s.closeTime });
    onEditOpen();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración de Horarios</h1>
        <p className="text-sm text-default-500 mt-1">Define los horarios de apertura de cada instalación</p>
      </div>

      <VenueFacilityPicker
        selectedFacilityId={selectedFacility}
        onFacilityChange={setSelectedFacility}
        className="max-w-2xl"
      />

      {selectedFacility && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Horarios configurados</h2>
            </div>
            <Button size="sm" color="primary" startContent={<Plus className="h-3 w-3" />} onPress={() => { setForm({ days: [], openTime: "08:00", closeTime: "22:00" }); onOpen(); }}>
              Agregar
            </Button>
          </CardHeader>
          <Divider />
          <CardBody>
            {isLoading ? (
              <Spinner />
            ) : schedules && schedules.length > 0 ? (
              <div className="space-y-2">
                {schedules.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-default-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Chip size="sm" variant="flat" color="primary">{DAYS[s.dayOfWeek]}</Chip>
                      <span className="text-sm font-medium">{formatTime12h(s.openTime)} - {formatTime12h(s.closeTime)}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-default-500 text-center py-4">No hay horarios configurados</p>
            )}
          </CardBody>
        </Card>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalContent>
          <ModalHeader>Agregar Horario</ModalHeader>
          <ModalBody className="gap-4">
            {/* Selección de días */}
            <div>
              <p className="text-xs text-default-500 mb-2">Días de la semana</p>
              {/* Atajos rápidos */}
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={() => setDays([0, 1, 2, 3, 4])} className="rounded-full border border-divider px-3 py-1 text-xs hover:border-primary hover:text-primary transition-colors">Lun a Vie</button>
                <button type="button" onClick={() => setDays([5, 6])} className="rounded-full border border-divider px-3 py-1 text-xs hover:border-primary hover:text-primary transition-colors">Fin de semana</button>
                <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="rounded-full border border-divider px-3 py-1 text-xs hover:border-primary hover:text-primary transition-colors">Todos</button>
                <button type="button" onClick={() => setDays([])} className="rounded-full border border-divider px-3 py-1 text-xs hover:border-danger hover:text-danger transition-colors">Limpiar</button>
              </div>
              {/* Botones por día */}
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day, i) => {
                  const active = form.days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-divider hover:border-primary"
                        }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Hora apertura"
                variant="bordered"
                selectedKeys={form.openTime ? [form.openTime] : []}
                onSelectionChange={(keys: any) => setForm({ ...form, openTime: Array.from(keys)[0] as string || "08:00" })}
              >
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t.value}>{t.label}</SelectItem>
                ))}
              </Select>
              <Select
                label="Hora cierre"
                variant="bordered"
                selectedKeys={form.closeTime ? [form.closeTime] : []}
                onSelectionChange={(keys: any) => setForm({ ...form, closeTime: Array.from(keys)[0] as string || "22:00" })}
              >
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t.value}>{t.label}</SelectItem>
                ))}
              </Select>
            </div>

            {form.days.length > 0 && (
              <p className="text-xs text-default-500">
                Se crearán {form.days.length} horario{form.days.length !== 1 ? "s" : ""} de {formatTime12h(form.openTime)} a {formatTime12h(form.closeTime)}
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button color="primary" onPress={handleCreate} isLoading={isCreating} isDisabled={form.days.length === 0}>Crear</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={onEditClose}>
        <ModalContent>
          <ModalHeader>Editar Horario</ModalHeader>
          <ModalBody className="gap-4">
            <Select
              label="Día de la semana"
              variant="bordered"
              selectedKeys={[editForm.dayOfWeek]}
              onSelectionChange={(keys: any) => setEditForm({ ...editForm, dayOfWeek: Array.from(keys)[0] as string })}
            >
              {DAYS.map((day, i) => (
                <SelectItem key={i.toString()}>{day}</SelectItem>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Hora apertura"
                variant="bordered"
                selectedKeys={editForm.openTime ? [editForm.openTime] : []}
                onSelectionChange={(keys: any) => setEditForm({ ...editForm, openTime: Array.from(keys)[0] as string || "08:00" })}
              >
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t.value}>{t.label}</SelectItem>
                ))}
              </Select>
              <Select
                label="Hora cierre"
                variant="bordered"
                selectedKeys={editForm.closeTime ? [editForm.closeTime] : []}
                onSelectionChange={(keys: any) => setEditForm({ ...editForm, closeTime: Array.from(keys)[0] as string || "22:00" })}
              >
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t.value}>{t.label}</SelectItem>
                ))}
              </Select>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onEditClose}>Cancelar</Button>
            <Button color="primary" onPress={() => editMutation.mutate({ id: editForm.id, dayOfWeek: parseInt(editForm.dayOfWeek), openTime: editForm.openTime, closeTime: editForm.closeTime })} isLoading={editMutation.isPending}>Guardar</Button>
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
