"use client";

import {
  Button, Chip, Spinner, Card, CardBody, CardHeader, Divider,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Clock } from "lucide-react";
import { useState } from "react";
import type { Facility, Schedule } from "@/types";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function AdminSchedulesPage() {
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [form, setForm] = useState({ dayOfWeek: "0", openTime: "08:00", closeTime: "22:00" });

  const { data: facilities } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => apiClient.get<Facility[]>("/facilities"),
  });

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["schedules", selectedFacility],
    queryFn: () => apiClient.get<Schedule[]>(`/facilities/${selectedFacility}/schedules`),
    enabled: !!selectedFacility,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/facilities/${selectedFacility}/schedules`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["schedules", selectedFacility] }); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedules", selectedFacility] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración de Horarios</h1>
        <p className="text-sm text-default-500 mt-1">Define los horarios de apertura de cada instalación</p>
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
              <Clock className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Horarios configurados</h2>
            </div>
            <Button size="sm" color="primary" startContent={<Plus className="h-3 w-3" />} onPress={onOpen}>
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
                      <span className="text-sm font-medium">{s.openTime} - {s.closeTime}</span>
                    </div>
                    <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteMutation.mutate(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-default-500 text-center py-4">No hay horarios configurados</p>
            )}
          </CardBody>
        </Card>
      )}

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>Agregar Horario</ModalHeader>
          <ModalBody className="gap-4">
            <Select
              label="Día de la semana"
              variant="bordered"
              selectedKeys={[form.dayOfWeek]}
              onSelectionChange={(keys: any) => setForm({ ...form, dayOfWeek: Array.from(keys)[0] as string })}
            >
              {DAYS.map((day, i) => (
                <SelectItem key={i.toString()}>{day}</SelectItem>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Hora apertura" type="time" variant="bordered" value={form.openTime} onValueChange={(v) => setForm({ ...form, openTime: v })} />
              <Input label="Hora cierre" type="time" variant="bordered" value={form.closeTime} onValueChange={(v) => setForm({ ...form, closeTime: v })} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button color="primary" onPress={() => createMutation.mutate({ dayOfWeek: parseInt(form.dayOfWeek), openTime: form.openTime, closeTime: form.closeTime })} isLoading={createMutation.isPending}>Crear</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
