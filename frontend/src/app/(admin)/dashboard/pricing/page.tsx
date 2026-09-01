"use client";

import {
  Button, Chip, Spinner, Card, CardBody, CardHeader, Divider,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, DollarSign, Percent } from "lucide-react";
import { useState, useMemo } from "react";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { VenueFacilityPicker } from "@/components/shared/venue-facility-picker";
import type { Pricing } from "@/types";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Generate time options every 30 minutes from 00:00 to 23:30
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  const value = `${hours.toString().padStart(2, "0")}:${minutes}`;
  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours < 12 ? "AM" : "PM";
  const label = `${h12}:${minutes} ${ampm}`;
  return { value, label };
});

// Profit percentage options: 0, 10, 20, ..., 100
const PROFIT_OPTIONS = Array.from({ length: 11 }, (_, i) => i * 10);

/** Format a number with thousand separators (dots) */
function formatThousands(value: string): string {
  const num = value.replace(/\./g, "").replace(/[^0-9]/g, "");
  if (!num) return "";
  return Number(num).toLocaleString("es-AR", { useGrouping: true });
}

/** Parse formatted price string back to a raw number */
function parsePriceValue(formatted: string): number {
  const raw = formatted.replace(/\./g, "").replace(/,/g, ".");
  return Number(raw) || 0;
}

export default function AdminPricingPage() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [form, setForm] = useState({
    startTime: "08:00",
    endTime: "22:00",
    pricePerHour: "25.000",
    profitPercent: "10",
    dayOfWeek: "",
  });

  const { data: pricing, isLoading } = useQuery({
    queryKey: ["pricing", selectedFacility],
    queryFn: () => apiClient.get<Pricing[]>(`/facilities/${selectedFacility}/pricing`),
    enabled: !!selectedFacility,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiClient.post(`/facilities/${selectedFacility}/pricing`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pricing", selectedFacility] }); onClose(); addToast("Tarifa creada correctamente"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/pricing/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pricing", selectedFacility] }); addToast("Tarifa eliminada correctamente"); },
  });

  // Calculate final price
  const finalPrice = useMemo(() => {
    const base = parsePriceValue(form.pricePerHour);
    const percent = Number(form.profitPercent) || 0;
    return base + (base * percent / 100);
  }, [form.pricePerHour, form.profitPercent]);

  const handlePriceChange = (value: string) => {
    setForm({ ...form, pricePerHour: formatThousands(value) });
  };

  const handleOpenModal = () => {
    setForm({ startTime: "08:00", endTime: "22:00", pricePerHour: "25.000", profitPercent: "10", dayOfWeek: "" });
    onOpen();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración de Precios</h1>
        <p className="text-sm text-default-500 mt-1">Define las tarifas por franja horaria</p>
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
              <DollarSign className="h-4 w-4 text-success" />
              <h2 className="text-lg font-semibold">Tarifas configuradas</h2>
            </div>
            <Button size="sm" color="primary" startContent={<Plus className="h-3 w-3" />} onPress={handleOpenModal}>
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
                      <Chip size="sm" color="success" variant="flat">
                        ${Number(p.pricePerHour).toLocaleString("es-AR")}/hr
                      </Chip>
                      {p.profitPercent != null && (
                        <Chip size="sm" color="warning" variant="flat">
                          +{p.profitPercent}% empresa
                        </Chip>
                      )}
                    </div>
                    <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(p.id)}>
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

            <Input
              label="Precio por hora (ARS)"
              variant="bordered"
              value={form.pricePerHour}
              onValueChange={handlePriceChange}
              startContent={<span className="text-default-400 text-sm">$</span>}
              classNames={{ input: "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" }}
            />

            <Select
              label="Porcentaje de ganancia empresa (%)"
              variant="bordered"
              startContent={<Percent className="h-4 w-4 text-default-400" />}
              selectedKeys={form.profitPercent ? [form.profitPercent] : []}
              onSelectionChange={(keys: any) => setForm({ ...form, profitPercent: Array.from(keys)[0] as string || "0" })}
            >
              {PROFIT_OPTIONS.map((p) => (
                <SelectItem key={String(p)} textValue={`${p}%`}>{p}%</SelectItem>
              ))}
            </Select>

            <div className="rounded-lg bg-default-100 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-default-500">Precio base</span>
                <span>${form.pricePerHour || "0"}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-default-500">Ganancia empresa ({form.profitPercent || 0}%)</span>
                <span>+${formatThousands(String(Math.round(parsePriceValue(form.pricePerHour) * (Number(form.profitPercent) || 0) / 100)))}</span>
              </div>
              <Divider className="my-2" />
              <div className="flex items-center justify-between font-semibold">
                <span>Precio final / hora</span>
                <span className="text-success">${formatThousands(String(Math.round(finalPrice)))}</span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button color="primary" onPress={() => createMutation.mutate({
              startTime: form.startTime,
              endTime: form.endTime,
              pricePerHour: parsePriceValue(form.pricePerHour),
              profitPercent: Number(form.profitPercent) || 0,
              ...(form.dayOfWeek ? { dayOfWeek: parseInt(form.dayOfWeek) } : {}),
            })} isLoading={createMutation.isPending}>Crear</Button>
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
