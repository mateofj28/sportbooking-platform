"use client";

import {
  Button, Chip, Spinner, Card, CardBody, CardHeader, Divider, Input, Textarea,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Ban } from "lucide-react";
import { useState } from "react";
import type { Facility } from "@/types";

interface BlockedSlot {
  id: string;
  facilityId: string;
  startDatetime: string;
  endDatetime: string;
  reason?: string;
}

export default function AdminBlockedSlotsPage() {
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [form, setForm] = useState({ date: "", startTime: "08:00", endTime: "22:00", reason: "" });

  const { data: facilities } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => apiClient.get<Facility[]>("/facilities"),
  });

  const { data: blockedSlots, isLoading } = useQuery({
    queryKey: ["blocked-slots", selectedFacility],
    queryFn: () => apiClient.get<BlockedSlot[]>(`/facilities/${selectedFacility}/blocked-slots`),
    enabled: !!selectedFacility,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/facilities/${selectedFacility}/blocked-slots`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["blocked-slots", selectedFacility] }); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/blocked-slots/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["blocked-slots", selectedFacility] }),
  });

  const formatDT = (dt: string) => new Date(dt).toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bloqueo de Horarios</h1>
        <p className="text-sm text-default-500 mt-1">Bloquea horarios por mantenimiento, eventos u otras razones</p>
      </div>

      <Select
        label="Selecciona una instalación"
        variant="bordered"
        selectedKeys={selectedFacility ? [selectedFacility] : []}
        onSelectionChange={(keys: any) => setSelectedFacility(Array.from(keys)[0] as string || "")}
        className="max-w-md"
      >
        {(facilities || []).map((f) => (
          <SelectItem key={f.id}>{f.name} — {f.sport.name}</SelectItem>
        ))}
      </Select>

      {selectedFacility && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-danger" />
              <h2 className="text-lg font-semibold">Bloqueos activos</h2>
            </div>
            <Button size="sm" color="danger" variant="flat" startContent={<Plus className="h-3 w-3" />} onPress={onOpen}>
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
                    <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteMutation.mutate(slot.id)}>
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
            <Input label="Fecha" type="date" variant="bordered" value={form.date} onValueChange={(v) => setForm({ ...form, date: v })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Desde" type="time" variant="bordered" value={form.startTime} onValueChange={(v) => setForm({ ...form, startTime: v })} />
              <Input label="Hasta" type="time" variant="bordered" value={form.endTime} onValueChange={(v) => setForm({ ...form, endTime: v })} />
            </div>
            <Textarea label="Motivo (opcional)" variant="bordered" value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })} placeholder="Ej: Mantenimiento de cancha" />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button color="danger" onPress={() => createMutation.mutate({
              startDatetime: `${form.date}T${form.startTime}:00.000Z`,
              endDatetime: `${form.date}T${form.endTime}:00.000Z`,
              reason: form.reason || undefined,
            })} isLoading={createMutation.isPending}>Bloquear</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
