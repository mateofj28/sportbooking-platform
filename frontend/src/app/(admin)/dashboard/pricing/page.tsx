"use client";

import {
  Button, Chip, Spinner, Card, CardBody, CardHeader, Divider,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { useState } from "react";
import type { Facility, Pricing } from "@/types";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function AdminPricingPage() {
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [form, setForm] = useState({ startTime: "08:00", endTime: "22:00", pricePerHour: "25", dayOfWeek: "" });

  const { data: facilities } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => apiClient.get<Facility[]>("/facilities"),
  });

  const { data: pricing, isLoading } = useQuery({
    queryKey: ["pricing", selectedFacility],
    queryFn: () => apiClient.get<Pricing[]>(`/facilities/${selectedFacility}/pricing`),
    enabled: !!selectedFacility,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/facilities/${selectedFacility}/pricing`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pricing", selectedFacility] }); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/pricing/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pricing", selectedFacility] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración de Precios</h1>
        <p className="text-sm text-default-500 mt-1">Define las tarifas por franja horaria</p>
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
              <DollarSign className="h-4 w-4 text-success" />
              <h2 className="text-lg font-semibold">Tarifas configuradas</h2>
            </div>
            <Button size="sm" color="primary" startContent={<Plus className="h-3 w-3" />} onPress={onOpen}>
              Agregar
            </Button>
          </CardHeader>
          <Divider />
          <CardBody>
            {isLoading ? (
              <Spinner />
            ) : pricing && pricing.length > 0 ? (
              <div className="space-y-2">
                {pricing.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-default-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.dayOfWeek != null && <Chip size="sm" variant="flat">{DAYS[p.dayOfWeek]}</Chip>}
                      {p.dayOfWeek == null && <Chip size="sm" variant="flat" color="secondary">Todos los días</Chip>}
                      <span className="text-sm">{p.startTime} - {p.endTime}</span>
                      <Chip size="sm" color="success" variant="flat">${p.pricePerHour}/hr</Chip>
                    </div>
                    <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteMutation.mutate(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-default-500 text-center py-4">No hay precios configurados</p>
            )}
          </CardBody>
        </Card>
      )}

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalContent>
          <ModalHeader>Agregar Tarifa</ModalHeader>
          <ModalBody className="gap-4">
            <Select
              label="Día (vacío = todos los días)"
              variant="bordered"
              selectedKeys={form.dayOfWeek ? [form.dayOfWeek] : []}
              onSelectionChange={(keys: any) => setForm({ ...form, dayOfWeek: Array.from(keys)[0] as string || "" })}
            >
              {DAYS.map((day, i) => (
                <SelectItem key={i.toString()}>{day}</SelectItem>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Desde" type="time" variant="bordered" value={form.startTime} onValueChange={(v) => setForm({ ...form, startTime: v })} />
              <Input label="Hasta" type="time" variant="bordered" value={form.endTime} onValueChange={(v) => setForm({ ...form, endTime: v })} />
            </div>
            <Input label="Precio por hora (USD)" type="number" variant="bordered" value={form.pricePerHour} onValueChange={(v) => setForm({ ...form, pricePerHour: v })} startContent={<DollarSign className="h-4 w-4 text-default-400" />} />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button color="primary" onPress={() => createMutation.mutate({
              startTime: form.startTime,
              endTime: form.endTime,
              pricePerHour: parseFloat(form.pricePerHour),
              ...(form.dayOfWeek ? { dayOfWeek: parseInt(form.dayOfWeek) } : {}),
            })} isLoading={createMutation.isPending}>Crear</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
