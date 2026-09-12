"use client";

import {
  Button, Chip, Spinner, Card, CardBody, CardHeader, Divider,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, DollarSign, Percent, Pencil } from "lucide-react";
import { useState, useMemo } from "react";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import { useAuthStore } from "@/stores/auth-store";
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

/**
 * Sanitiza el porcentaje de ganancia: acepta coma o punto (normaliza a punto),
 * permite decimales, y limita el valor entre 0 y 100.
 */
function sanitizeProfitPercent(input: string): string {
  // Reemplaza coma por punto y elimina cualquier cosa que no sea dígito o punto
  let v = input.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  // Permite solo un punto decimal
  const parts = v.split(".");
  if (parts.length > 2) {
    v = parts[0] + "." + parts.slice(1).join("");
  }
  // Limita a 100 (si es entero mayor a 100)
  if (v !== "" && v !== ".") {
    const num = Number(v);
    if (!isNaN(num) && num > 100) v = "100";
  }
  return v;
}

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

/** Convierte "08:00" -> "8:00 AM" */
function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function AdminPricingPage() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { user } = useAuthStore();
  const isVenueAdmin = user?.role === "VENUE_ADMIN";
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [form, setForm] = useState({
    startTime: "08:00",
    endTime: "22:00",
    pricePerHour: "25.000",
    profitPercent: "10",
    days: [] as number[],
    allDays: false,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "",
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

  // Al elegir un día específico, se desactiva "todos los días"
  const toggleDay = (day: number) =>
    setForm((f) => ({
      ...f,
      allDays: false,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  // Atajos: fijan días específicos y desactivan "todos"
  const setDays = (days: number[]) => setForm((f) => ({ ...f, days, allDays: false }));
  // "Todos los días": opción exclusiva -> una sola tarifa sin dayOfWeek
  const setAllDays = () => setForm((f) => ({ ...f, allDays: true, days: [] }));

  // Validez de la selección: o "todos los días" o al menos un día específico
  const hasDaySelection = form.allDays || form.days.length > 0;

  const handleCreate = async () => {
    if (!hasDaySelection) {
      addToast("Selecciona 'Todos los días' o al menos un día");
      return;
    }
    setIsCreating(true);
    const payloadBase = {
      startTime: form.startTime,
      endTime: form.endTime,
      pricePerHour: parsePriceValue(form.pricePerHour),
      profitPercent: Number(form.profitPercent) || 0,
    };
    // allDays => una sola tarifa sin dayOfWeek. Si no, una tarifa por cada día específico.
    const targets: (number | null)[] = form.allDays ? [null] : form.days;
    const created: string[] = [];
    const skipped: string[] = [];
    for (const day of targets) {
      try {
        await apiClient.post(`/facilities/${selectedFacility}/pricing`, {
          ...payloadBase,
          ...(day !== null ? { dayOfWeek: day } : {}),
        });
        created.push(day !== null ? DAYS[day] : "Todos los días");
      } catch {
        skipped.push(day !== null ? DAYS[day] : "Todos los días");
      }
    }
    setIsCreating(false);
    queryClient.invalidateQueries({ queryKey: ["pricing", selectedFacility] });
    onClose();
    if (created.length > 0) addToast(`${created.length} tarifa${created.length !== 1 ? "s" : ""} creada${created.length !== 1 ? "s" : ""}`);
    if (skipped.length > 0) addToast(`No se crearon (ya existían o solapan): ${skipped.join(", ")}`);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/pricing/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pricing", selectedFacility] }); addToast("Tarifa eliminada correctamente"); },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiClient.patch(`/pricing/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pricing", selectedFacility] }); onEditClose(); addToast("Tarifa actualizada correctamente"); },
    onError: (error: any) => {
      const msg = error?.message || error?.response?.data?.message || "No se pudo actualizar la tarifa";
      addToast(Array.isArray(msg) ? msg[0] : msg);
    },
  });

  const handleEdit = (p: Pricing) => {
    setEditForm({
      id: p.id,
      startTime: p.startTime,
      endTime: p.endTime,
      pricePerHour: formatThousands(String(Math.round(Number(p.pricePerHour)))),
      profitPercent: p.profitPercent != null ? String(p.profitPercent) : "0",
      dayOfWeek: p.dayOfWeek != null ? String(p.dayOfWeek) : "",
    });
    onEditOpen();
  };

  // Calculate final price
  const finalPrice = useMemo(() => {
    const base = parsePriceValue(form.pricePerHour);
    const percent = Number(form.profitPercent) || 0;
    return base + (base * percent / 100);
  }, [form.pricePerHour, form.profitPercent]);

  // Precio final del formulario de edición
  const editFinalPrice = useMemo(() => {
    const base = parsePriceValue(editForm.pricePerHour);
    const percent = Number(editForm.profitPercent) || 0;
    return base + (base * percent / 100);
  }, [editForm.pricePerHour, editForm.profitPercent]);

  const handlePriceChange = (value: string) => {
    setForm({ ...form, pricePerHour: formatThousands(value) });
  };

  const handleOpenModal = () => {
    setForm({ startTime: "08:00", endTime: "22:00", pricePerHour: "25.000", profitPercent: "10", days: [], allDays: false });
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
                      <span className="text-sm">{formatTime12h(p.startTime)} - {formatTime12h(p.endTime)}</span>
                      <Chip size="sm" color="success" variant="flat">
                        ${Number(p.pricePerHour).toLocaleString("es-AR")}/hr
                      </Chip>
                      {p.profitPercent != null && (
                        <Chip size="sm" color="warning" variant="flat">
                          +{p.profitPercent}% empresa
                        </Chip>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" color="primary" variant="light" isIconOnly onPress={() => handleEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => setDeleteId(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-default-500 text-center py-4">No hay precios configurados</p>
            )}
          </CardBody>
        </Card>
      )}

      <Modal isOpen={isOpen} onClose={onClose} size="3xl">
        <ModalContent>
          <ModalHeader>Agregar Tarifa</ModalHeader>
          <ModalBody className="gap-5">
            {/* Días de la semana */}
            <div>
              <p className="text-xs text-default-500 mb-2">¿Para qué días aplica esta tarifa?</p>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={setAllDays}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${form.allDays ? "border-secondary bg-secondary/10 text-secondary" : "border-divider hover:border-secondary hover:text-secondary"}`}
                >
                  Todos los días
                </button>
                <button type="button" onClick={() => setDays([0, 1, 2, 3, 4])} className="rounded-full border border-divider px-3 py-1 text-xs hover:border-primary hover:text-primary transition-colors">Lun a Vie</button>
                <button type="button" onClick={() => setDays([5, 6])} className="rounded-full border border-divider px-3 py-1 text-xs hover:border-primary hover:text-primary transition-colors">Fin de semana</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day, i) => {
                  const active = !form.allDays && form.days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${active ? "border-primary bg-primary/10 text-primary" : "border-divider hover:border-primary"} ${form.allDays ? "opacity-40" : ""}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dos columnas: izquierda inputs, derecha resumen */}
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Desde"
                    variant="bordered"
                    selectedKeys={form.startTime ? [form.startTime] : []}
                    onSelectionChange={(keys: any) => setForm({ ...form, startTime: Array.from(keys)[0] as string || "08:00" })}
                  >
                    {TIME_OPTIONS.map((t) => (<SelectItem key={t.value}>{t.label}</SelectItem>))}
                  </Select>
                  <Select
                    label="Hasta"
                    variant="bordered"
                    selectedKeys={form.endTime ? [form.endTime] : []}
                    onSelectionChange={(keys: any) => setForm({ ...form, endTime: Array.from(keys)[0] as string || "22:00" })}
                  >
                    {TIME_OPTIONS.map((t) => (<SelectItem key={t.value}>{t.label}</SelectItem>))}
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

                <Input
                  label="Porcentaje de ganancia empresa (%)"
                  variant="bordered"
                  inputMode="decimal"
                  placeholder="Ej: 6.6"
                  startContent={<Percent className="h-4 w-4 text-default-400" />}
                  value={form.profitPercent}
                  onValueChange={(v) => setForm({ ...form, profitPercent: sanitizeProfitPercent(v) })}
                  isReadOnly={isVenueAdmin}
                  description={isVenueAdmin ? "Definido por la administración general" : "Valor entre 1 y 100. Acepta decimales"}
                />
              </div>

              {/* Resumen de precio */}
              <div className="rounded-lg bg-default-100 p-4 flex flex-col justify-center">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-default-500">Precio base</span>
                  <span>${form.pricePerHour || "0"}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-default-500">Ganancia empresa ({form.profitPercent || 0}%)</span>
                  <span>+${formatThousands(String(Math.round(parsePriceValue(form.pricePerHour) * (Number(form.profitPercent) || 0) / 100)))}</span>
                </div>
                <Divider className="my-3" />
                <div className="flex items-center justify-between font-semibold text-base">
                  <span>Precio final / hora</span>
                  <span className="text-success">${formatThousands(String(Math.round(finalPrice)))}</span>
                </div>
                {form.allDays && (
                  <p className="text-xs text-default-400 mt-3">Se creará 1 tarifa para todos los días</p>
                )}
                {!form.allDays && form.days.length > 0 && (
                  <p className="text-xs text-default-400 mt-3">Se crearán {form.days.length} tarifa{form.days.length !== 1 ? "s" : ""} (una por día seleccionado)</p>
                )}
                {!hasDaySelection && (
                  <p className="text-xs text-warning mt-3">Selecciona &quot;Todos los días&quot; o al menos un día para poder crear la tarifa</p>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>Cancelar</Button>
            <Button
              color="primary"
              isDisabled={!hasDaySelection || !(Number(form.profitPercent) >= 1 && Number(form.profitPercent) <= 100)}
              onPress={handleCreate}
              isLoading={isCreating}
            >
              Crear
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size="3xl">
        <ModalContent>
          <ModalHeader>Editar Tarifa</ModalHeader>
          <ModalBody className="gap-5">
            {/* Día (selección única) */}
            <div>
              <p className="text-xs text-default-500 mb-2">Día (vacío = todos los días)</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, dayOfWeek: "" })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${editForm.dayOfWeek === "" ? "border-secondary bg-secondary/10 text-secondary" : "border-divider hover:border-primary"}`}
                >
                  Todos
                </button>
                {DAYS.map((day, i) => {
                  const active = editForm.dayOfWeek === String(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, dayOfWeek: String(i) })}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${active ? "border-primary bg-primary/10 text-primary" : "border-divider hover:border-primary"}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dos columnas */}
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Desde"
                    variant="bordered"
                    selectedKeys={editForm.startTime ? [editForm.startTime] : []}
                    onSelectionChange={(keys: any) => setEditForm({ ...editForm, startTime: Array.from(keys)[0] as string || "08:00" })}
                  >
                    {TIME_OPTIONS.map((t) => (<SelectItem key={t.value}>{t.label}</SelectItem>))}
                  </Select>
                  <Select
                    label="Hasta"
                    variant="bordered"
                    selectedKeys={editForm.endTime ? [editForm.endTime] : []}
                    onSelectionChange={(keys: any) => setEditForm({ ...editForm, endTime: Array.from(keys)[0] as string || "22:00" })}
                  >
                    {TIME_OPTIONS.map((t) => (<SelectItem key={t.value}>{t.label}</SelectItem>))}
                  </Select>
                </div>

                <Input
                  label="Precio por hora (ARS)"
                  variant="bordered"
                  value={editForm.pricePerHour}
                  onValueChange={(v) => setEditForm({ ...editForm, pricePerHour: formatThousands(v) })}
                  startContent={<span className="text-default-400 text-sm">$</span>}
                  classNames={{ input: "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" }}
                />

                <Input
                  label="Porcentaje de ganancia empresa (%)"
                  variant="bordered"
                  inputMode="decimal"
                  placeholder="Ej: 6.6"
                  startContent={<Percent className="h-4 w-4 text-default-400" />}
                  value={editForm.profitPercent}
                  onValueChange={(v) => setEditForm({ ...editForm, profitPercent: sanitizeProfitPercent(v) })}
                  isReadOnly={isVenueAdmin}
                  description={isVenueAdmin ? "Definido por la administración general" : "Valor entre 1 y 100. Acepta decimales"}
                />
              </div>

              <div className="rounded-lg bg-default-100 p-4 flex flex-col justify-center">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-default-500">Precio base</span>
                  <span>${editForm.pricePerHour || "0"}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-default-500">Ganancia empresa ({editForm.profitPercent || 0}%)</span>
                  <span>+${formatThousands(String(Math.round(parsePriceValue(editForm.pricePerHour) * (Number(editForm.profitPercent) || 0) / 100)))}</span>
                </div>
                <Divider className="my-3" />
                <div className="flex items-center justify-between font-semibold text-base">
                  <span>Precio final / hora</span>
                  <span className="text-success">${formatThousands(String(Math.round(editFinalPrice)))}</span>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onEditClose}>Cancelar</Button>
            <Button
              color="primary"
              isDisabled={!(Number(editForm.profitPercent) >= 1 && Number(editForm.profitPercent) <= 100)}
              onPress={() => editMutation.mutate({
                id: editForm.id,
                startTime: editForm.startTime,
                endTime: editForm.endTime,
                pricePerHour: parsePriceValue(editForm.pricePerHour),
                profitPercent: Number(editForm.profitPercent) || 0,
                dayOfWeek: editForm.dayOfWeek === "" ? null : parseInt(editForm.dayOfWeek),
              })}
              isLoading={editMutation.isPending}
            >
              Guardar
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
