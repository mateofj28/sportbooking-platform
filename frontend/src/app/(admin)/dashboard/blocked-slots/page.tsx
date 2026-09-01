"use client";

import {
  Button, Chip, Spinner, Card, CardBody, CardHeader, Divider, Textarea,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, DatePicker,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { today, getLocalTimeZone } from "@internationalized/date";

// Tipo mínimo para una fecha del DatePicker (year/month/day)
type CalDate = { year: number; month: number; day: number };
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Ban } from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { VenueFacilityPicker } from "@/components/shared/venue-facility-picker";

interface BlockedSlot {
  id: string;
  facilityId: string;
  startDatetime: string;
  endDatetime: string;
  reason?: string;
}

// Opciones de hora cada 30 min en formato 12h (AM/PM)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  const value = `${hours.toString().padStart(2, "0")}:${minutes}`;
  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours < 12 ? "AM" : "PM";
  return { value, label: `${h12}:${minutes} ${ampm}` };
});

/** Convierte una fecha del calendario a string YYYY-MM-DD */
function calendarDateToISO(d: CalDate | null): string {
  if (!d) return "";
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

export default function AdminBlockedSlotsPage() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [dateValue, setDateValue] = useState<CalDate | null>(null);
  const [form, setForm] = useState({ startTime: "08:00", endTime: "22:00", reason: "" });

  const { data: blockedSlots, isLoading } = useQuery({
    queryKey: ["blocked-slots", selectedFacility],
    queryFn: () => apiClient.get<BlockedSlot[]>(`/facilities/${selectedFacility}/blocked-slots`),
    enabled: !!selectedFacility,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/facilities/${selectedFacility}/blocked-slots`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["blocked-slots", selectedFacility] }); onClose(); addToast("Item creado correctamente"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/blocked-slots/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["blocked-slots", selectedFacility] }); addToast("Item eliminado correctamente"); },
  });

  const formatDT = (dt: string) => new Date(dt).toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bloqueo de Horarios</h1>
        <p className="text-sm text-default-500 mt-1">Bloquea horarios por mantenimiento, eventos u otras razones</p>
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
              <Ban className="h-4 w-4 text-danger" />
              <h2 className="text-lg font-semibold">Bloqueos activos</h2>
            </div>
            <Button size="sm" color="danger" variant="flat" startContent={<Plus className="h-3 w-3" />} onPress={() => { setDateValue(today(getLocalTimeZone())); setForm({ startTime: "08:00", endTime: "22:00", reason: "" }); onOpen(); }}>
              Bloquear horario
            </Button>
          </CardHeader>
          <Divider />
          <CardBody>
            {isLoading ? (
              <Spinner />
            ) : blockedSlots && blockedSlots.length > 0 ? (
              <div className="space-y-2">
                {blockedSlots.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between rounded-lg bg-danger-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{formatDT(slot.startDatetime)} → {formatDT(slot.endDatetime)}</p>
                      {slot.reason && <p className="text-xs text-default-500 mt-0.5">{slot.reason}</p>}
                    </div>
                    <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(slot.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-default-500 text-center py-4">No hay bloqueos activos</p>
            )}
          </CardBody>
        </Card>
      )}

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>Bloquear Horario</ModalHeader>
          <ModalBody className="gap-4">
            <DatePicker
              label="Fecha"
              variant="bordered"
              value={dateValue as any}
              onChange={(v: any) => setDateValue(v)}
              minValue={today(getLocalTimeZone()) as any}
              showMonthAndYearPickers
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Desde"
                variant="bordered"
                selectedKeys={form.startTime ? [form.startTime] : []}
                onSelectionChange={(keys: any) => setForm({ ...form, startTime: Array.from(keys)[0] as string || "08:00" })}
              >
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t.value}>{t.label}</SelectItem>
                ))}
              </Select>
              <Select
                label="Hasta"
                variant="bordered"
                selectedKeys={form.endTime ? [form.endTime] : []}
                onSelectionChange={(keys: any) => setForm({ ...form, endTime: Array.from(keys)[0] as string || "22:00" })}
              >
                {TIME_OPTIONS.map((t) => (
                  <SelectItem key={t.value}>{t.label}</SelectItem>
                ))}
              </Select>
            </div>
            <Textarea label="Motivo (opcional)" variant="bordered" value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })} placeholder="Ej: Mantenimiento de cancha" />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button
              color="danger"
              isDisabled={!dateValue}
              onPress={() => createMutation.mutate({
                startDatetime: `${calendarDateToISO(dateValue)}T${form.startTime}:00.000Z`,
                endDatetime: `${calendarDateToISO(dateValue)}T${form.endTime}:00.000Z`,
                reason: form.reason || undefined,
              })}
              isLoading={createMutation.isPending}
            >
              Bloquear
            </Button>
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
