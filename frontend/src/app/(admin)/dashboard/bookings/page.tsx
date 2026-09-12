"use client";

import {
    Button, Chip, Spinner, Card, CardBody,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
    Input, Textarea, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCancelBooking, useCreateRecurringBooking } from "@/hooks/use-bookings";
import { useFacilities, useFacility } from "@/hooks/use-facilities";
import { AvailabilityPicker, type AvailabilitySelection, formatPrice } from "@/components/shared/availability-picker";
import { apiClient } from "@/lib/api-client";
import { XCircle, Plus, Calendar, Clock, MapPin, User, DollarSign, Search } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useToastStore } from "@/stores/toast-store";
import type { Booking, BookingStatus } from "@/types";

const STATUS_MAP: Record<BookingStatus, { label: string; color: "warning" | "success" | "danger" | "default" }> = {
    PENDING: { label: "Pendiente", color: "warning" },
    CONFIRMED: { label: "Confirmada", color: "success" },
    CANCELLED: { label: "Cancelada", color: "danger" },
    COMPLETED: { label: "Completada", color: "default" },
};

const STATUS_FILTERS: { key: "ALL" | BookingStatus; label: string; color: "primary" | "warning" | "success" | "danger" | "default" }[] = [
    { key: "ALL", label: "Todas", color: "primary" },
    { key: "CONFIRMED", label: "Confirmadas", color: "success" },
    { key: "COMPLETED", label: "Completadas", color: "default" },
    { key: "CANCELLED", label: "Canceladas", color: "danger" },
];

const PER_PAGE = 12;

export default function AdminBookingsPage() {
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
    const [page, setPage] = useState(1);

    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"ALL" | BookingStatus>("ALL");

    const { data: bookingsData, isLoading } = useQuery({
        queryKey: ["bookings"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: { total: number; page: number; totalPages: number } }>("/bookings", { limit: "500" }),
    });
    const allBookings = bookingsData?.data;

    // Apply filters (client-side over all bookings)
    const filteredBookings = useMemo(() => {
        let result = allBookings || [];
        if (statusFilter !== "ALL") {
            result = result.filter((b) => b.status === statusFilter);
        }
        if (search) {
            const q = search.toLowerCase();
            result = result.filter((b) =>
                b.facility?.name?.toLowerCase().includes(q) ||
                b.facility?.venue?.name?.toLowerCase().includes(q)
            );
        }
        return result;
    }, [allBookings, statusFilter, search]);

    // Count per status for badges
    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { ALL: (allBookings || []).length };
        (allBookings || []).forEach((b) => { counts[b.status] = (counts[b.status] || 0) + 1; });
        return counts;
    }, [allBookings]);

    // Client-side pagination over filtered results
    const totalPages = Math.max(1, Math.ceil(filteredBookings.length / PER_PAGE));
    const bookings = filteredBookings.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const meta = { total: filteredBookings.length, page, totalPages };

    // Reset to page 1 when filters change
    useEffect(() => { setPage(1); }, [search, statusFilter]);

    const cancelBooking = useCancelBooking();
    const { isOpen, onOpen, onClose } = useDisclosure();

    // Solo instalaciones reservables: con horario activo Y tarifa activa
    const { data: facilities } = useFacilities({ bookableOnly: "true" });

    // Reserva manual: instalación, cliente, selección de disponibilidad, notas
    const [manualFacilityId, setManualFacilityId] = useState("");
    const [manualUserId, setManualUserId] = useState("");
    const [manualNotes, setManualNotes] = useState("");
    const [selection, setSelection] = useState<AvailabilitySelection | null>(null);
    const [manualMode, setManualMode] = useState<"single" | "recurring">("single");
    const [recurringResult, setRecurringResult] = useState<null | { createdCount: number; skippedCount: number; skipped: { date: string; reason: string }[] }>(null);

    // Cargar la instalación seleccionada con horarios/precios para el picker
    const { data: selectedFacility } = useFacility(manualFacilityId);
    const createRecurring = useCreateRecurringBooking();

    // Búsqueda puntual de cliente por email o DNI (no se lista a todos los usuarios)
    const [clientSearchType, setClientSearchType] = useState<"email" | "dni">("email");
    const [clientSearchValue, setClientSearchValue] = useState("");
    const [foundClient, setFoundClient] = useState<{ id: string; firstName: string; lastName: string; email: string; dni?: string } | null>(null);
    const [clientLookupError, setClientLookupError] = useState("");
    const [clientLookupLoading, setClientLookupLoading] = useState(false);

    const handleClientLookup = async () => {
        const value = clientSearchValue.trim();
        if (!value) return;
        setClientLookupLoading(true);
        setClientLookupError("");
        setFoundClient(null);
        try {
            const params: Record<string, string> = clientSearchType === "email" ? { email: value } : { dni: value };
            const client = await apiClient.get<{ id: string; firstName: string; lastName: string; email: string; dni?: string }>("/users/lookup", params);
            setFoundClient(client);
            setManualUserId(client.id);
        } catch (err: any) {
            setClientLookupError(err?.message || "No se encontró un cliente con esos datos");
            setManualUserId("");
        } finally {
            setClientLookupLoading(false);
        }
    };

    const resetManualForm = () => {
        setManualFacilityId("");
        setManualUserId("");
        setManualNotes("");
        setSelection(null);
        setManualMode("single");
        setRecurringResult(null);
        setClientSearchValue("");
        setFoundClient(null);
        setClientLookupError("");
    };

    // Construye un ISO local (AR) a partir de la fecha seleccionada + hora "HH:mm"
    const buildLocalIso = (date: Date, time: string) => {
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${mo}-${d}T${time}:00`;
    };

    const manualBookingMutation = useMutation({
        mutationFn: (data: { facilityId: string; userId: string; startDatetime: string; endDatetime: string; notes?: string }) =>
            apiClient.post("/bookings/manual", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
            onClose();
            resetManualForm();
            addToast("Reserva creada correctamente");
        },
        onError: (error: any) => {
            const msg = error?.message || "No se pudo crear la reserva";
            addToast(Array.isArray(msg) ? msg[0] : msg);
        },
    });

    const handleManualSubmit = () => {
        if (!manualFacilityId || !manualUserId || !selection) return;
        manualBookingMutation.mutate({
            facilityId: manualFacilityId,
            userId: manualUserId,
            startDatetime: buildLocalIso(selection.date, selection.startTime),
            endDatetime: buildLocalIso(selection.date, selection.endTime),
            notes: manualNotes || undefined,
        });
    };

    const handleManualRecurringSubmit = () => {
        if (!manualFacilityId || !manualUserId || !selection) return;
        const startDate = buildLocalIso(selection.date, "00:00").split("T")[0];
        createRecurring.mutate(
            {
                facilityId: manualFacilityId,
                userId: manualUserId,
                dayOfWeek: selection.dayOfWeek,
                startTime: selection.startTime,
                endTime: selection.endTime,
                startDate,
                notes: manualNotes || undefined,
            },
            {
                onSuccess: (res) => {
                    setRecurringResult({ createdCount: res.createdCount, skippedCount: res.skippedCount, skipped: res.skipped });
                    queryClient.invalidateQueries({ queryKey: ["bookings"] });
                    addToast(`Turno fijo creado: ${res.createdCount} reserva(s)`);
                },
            }
        );
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        let h = d.getHours();
        const m = d.getMinutes();
        const ampm = h < 12 ? "a. m." : "p. m.";
        h = h % 12; if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
    };

    const hasFacilities = (facilities || []).length > 0;

    if (isLoading) {
      return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
  }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Gestión de Reservas</h1>
                    <p className="text-sm text-default-500 mt-1">Gestiona y cancela las reservas</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={onOpen}>
                    Reserva Manual
                </Button>
            </div>

            {/* Filters */}
            <div className="space-y-3">
                <Input
                    placeholder="Buscar por nombre de cancha o sede..."
                    variant="bordered"
                    size="sm"
                    value={search}
                    onValueChange={setSearch}
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    isClearable
                    onClear={() => setSearch("")}
                    className="max-w-md"
                />
                <div className="flex flex-wrap gap-2">
                    {STATUS_FILTERS.map((f) => (
                        <Chip
                            key={f.key}
                            color={statusFilter === f.key ? f.color : "default"}
                            variant={statusFilter === f.key ? "solid" : "bordered"}
                            className="cursor-pointer"
                            onClick={() => setStatusFilter(f.key)}
                        >
                            {f.label} ({statusCounts[f.key] || 0})
                        </Chip>
                    ))}
                </div>
            </div>

          {/* Booking Cards Grid */}
          {bookings && bookings.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {bookings.map((booking) => {
                      const status = STATUS_MAP[booking.status];
                      return (
                <Card key={booking.id} className="border border-divider">
                    <CardBody className="p-4 gap-3">
                        {/* Header: Facility + Status */}
                        <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold truncate">{booking.facility.name}</h3>
                                <p className="text-xs text-default-400 flex items-center gap-1 mt-0.5">
                                    <MapPin className="h-3 w-3" />
                                    {booking.facility.venue?.name}
                                </p>
                            </div>
                            <Chip color={status.color} size="sm" variant="flat">
                                {status.label}
                            </Chip>
                        </div>

                        {/* Info grid */}
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-default-600">
                                <User className="h-3.5 w-3.5 text-default-400" />
                                <span>{booking.user.firstName} {booking.user.lastName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-default-600">
                                <Calendar className="h-3.5 w-3.5 text-default-400" />
                                <span>{formatDate(booking.startDatetime)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-default-600">
                                <Clock className="h-3.5 w-3.5 text-default-400" />
                                <span>{formatTime(booking.startDatetime)} — {formatTime(booking.endDatetime)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <DollarSign className="h-3.5 w-3.5 text-success" />
                                          <span className="font-semibold text-success">{Math.round(Number(booking.totalPrice)).toLocaleString("en-US")} ARS</span>
                            </div>
                        </div>

                        {/* Actions */}
                                  {booking.status === "CONFIRMED" && (
                                      <div className="flex gap-2 pt-2 border-t border-divider mt-1">
                                <Button
                                    size="sm"
                                    color="danger"
                                    variant="flat"
                                              className="w-full"
                                    startContent={<XCircle className="h-3.5 w-3.5" />}
                                    onPress={() => cancelBooking.mutate({ id: booking.id }, { onSuccess: () => { addToast("Reserva cancelada"); queryClient.invalidateQueries({ queryKey: ["bookings"] }); } })}
                                >
                                    Cancelar
                                </Button>
                            </div>
                          )}
                      </CardBody>
                  </Card>
              );
          })}
              </div>
          ) : (
              <div className="py-12 text-center">
                  <Calendar className="mx-auto h-12 w-12 text-default-200" />
                  <p className="mt-4 text-default-500">No hay reservas</p>
              </div>
          )}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-default-500">Página {meta.page} de {meta.totalPages} ({meta.total} reservas)</p>
                  <div className="flex gap-2">
                      <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => setPage((p) => p - 1)}>Anterior</Button>
                      <Button size="sm" variant="flat" isDisabled={page >= meta.totalPages} onPress={() => setPage((p) => p + 1)}>Siguiente</Button>
                  </div>
              </div>
          )}

          {/* Manual Booking Modal */}
            <Modal isOpen={isOpen} onClose={() => { onClose(); resetManualForm(); }} size="2xl">
              <ModalContent>
                  <ModalHeader>Reserva Manual</ModalHeader>
                  <ModalBody className="gap-4">
                        {(facilities || []).length === 0 ? (
                            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-center">
                                <p className="text-sm font-semibold text-warning-700">
                                    No hay instalaciones disponibles para reservar
                                </p>
                                <p className="mt-1 text-sm text-default-600">
                                    Para que una instalación aparezca aquí, debe tener configurado
                                    un <strong>horario</strong> y una <strong>tarifa</strong> activos.
                                    Configúralos en las secciones <strong>Horarios</strong> y <strong>Precios</strong>.
                                </p>
                            </div>
                        ) : (
                                <Select
                                    label="Instalación"
                                    placeholder="Seleccionar"
                                    variant="bordered"
                                    selectedKeys={manualFacilityId ? [manualFacilityId] : []}
                                    onSelectionChange={(keys: any) => {
                                        setManualFacilityId(Array.from(keys)[0] as string || "");
                                        setSelection(null);
                                        setRecurringResult(null);
                                    }}
                                >
                                    {(facilities || []).map((f) => (<SelectItem key={f.id}>{f.name}</SelectItem>))}
                                </Select>
                        )}
                        {hasFacilities && (
                            <>
                        {/* Búsqueda de cliente por email o DNI (sin listar a todos) */}
                        <div className="rounded-lg border border-divider p-3">
                            <p className="mb-2 text-sm font-medium">Cliente</p>
                            <div className="flex gap-2">
                                <Select
                                    aria-label="Buscar por"
                                    variant="bordered"
                                    size="sm"
                                    className="max-w-[120px]"
                                    selectedKeys={[clientSearchType]}
                                    onSelectionChange={(keys: any) => {
                                        setClientSearchType((Array.from(keys)[0] as "email" | "dni") || "email");
                                        setFoundClient(null);
                                        setClientLookupError("");
                                    }}
                                >
                                    <SelectItem key="email">Email</SelectItem>
                                    <SelectItem key="dni">DNI</SelectItem>
                                </Select>
                                <Input
                                    aria-label="Valor de búsqueda"
                                    variant="bordered"
                                    size="sm"
                                    placeholder={clientSearchType === "email" ? "cliente@email.com" : "Número de DNI"}
                                    value={clientSearchValue}
                                    onValueChange={setClientSearchValue}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleClientLookup(); } }}
                                />
                                <Button
                                    size="sm"
                                    color="primary"
                                    variant="flat"
                                    isLoading={clientLookupLoading}
                                    onPress={handleClientLookup}
                                    startContent={!clientLookupLoading && <Search className="h-4 w-4" />}
                                >
                                    Buscar
                                </Button>
                            </div>
                            {foundClient && (
                                <div className="mt-2 flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm">
                                    <User className="h-4 w-4 text-success" />
                                    <span className="font-medium">{foundClient.firstName} {foundClient.lastName}</span>
                                    <span className="text-default-500">· {foundClient.email}</span>
                                </div>
                            )}
                            {clientLookupError && (
                                <p className="mt-2 text-sm text-danger">{clientLookupError}</p>
                            )}
                        </div>
                        {/* Toggle: reserva única / turno fijo */}
                        {manualFacilityId && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setManualMode("single"); setRecurringResult(null); }}
                                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${manualMode === "single" ? "border-primary bg-primary/10 text-primary" : "border-divider hover:border-primary"}`}
                                >
                                    Reserva única
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setManualMode("recurring"); setRecurringResult(null); }}
                                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${manualMode === "recurring" ? "border-primary bg-primary/10 text-primary" : "border-divider hover:border-primary"}`}
                                >
                                    Turno fijo (semanal)
                                </button>
                            </div>
                        )}

                        {/* Selector de disponibilidad (mismo flujo que el cliente) */}
                        {manualFacilityId && selectedFacility && !recurringResult && (
                            <AvailabilityPicker
                                key={manualFacilityId}
                                facility={selectedFacility}
                                onChange={setSelection}
                                dayLabel={manualMode === "recurring" ? "1. Elige el día de la semana" : "1. Elige el día"}
                            />
                        )}

                        {manualMode === "recurring" && selection && !recurringResult && (
                            <div className="rounded-lg bg-primary/5 px-4 py-3 text-sm text-default-600">
                                Se reservarán las próximas <strong>4</strong> fechas de ese día. Las que no estén disponibles se omitirán y te avisaremos cuáles.
                            </div>
                        )}

                        {/* Resultado del turno fijo */}
                        {recurringResult && (
                            <div className="rounded-lg bg-success/10 p-4">
                                <p className="text-sm font-semibold text-success">
                                    Turno fijo creado: {recurringResult.createdCount} reserva{recurringResult.createdCount !== 1 ? "s" : ""} confirmada{recurringResult.createdCount !== 1 ? "s" : ""}.
                                </p>
                                {recurringResult.skippedCount > 0 && (
                                    <div className="mt-2">
                                        <p className="text-xs text-default-600">{recurringResult.skippedCount} fecha(s) no se pudo reservar:</p>
                                        <ul className="mt-1 space-y-0.5">
                                            {recurringResult.skipped.map((s) => (
                                                <li key={s.date} className="text-xs text-default-500">• {s.date}: {s.reason}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {!recurringResult && (
                            <Textarea label="Notas (opcional)" variant="bordered" value={manualNotes} onValueChange={setManualNotes} />
                        )}
                            </>
                        )}
                  </ModalBody>
                  <ModalFooter>
                        {!hasFacilities ? (
                            <Button color="primary" onPress={() => { onClose(); resetManualForm(); }}>Cerrar</Button>
                        ) : recurringResult ? (
                            <Button color="primary" onPress={() => { onClose(); resetManualForm(); }}>Listo</Button>
                        ) : (
                            <>
                                <Button variant="light" onPress={() => { onClose(); resetManualForm(); }}>Cancelar</Button>
                                {manualMode === "single" ? (
                                    <Button
                                        color="primary"
                                        onPress={handleManualSubmit}
                                        isLoading={manualBookingMutation.isPending}
                                        isDisabled={!manualUserId || !selection}
                                    >
                                        Crear Reserva {selection ? `· $${formatPrice(selection.price)} ARS` : ""}
                                    </Button>
                                ) : (
                                    <Button
                                        color="primary"
                                        onPress={handleManualRecurringSubmit}
                                        isLoading={createRecurring.isPending}
                                        isDisabled={!manualUserId || !selection}
                                    >
                                        Crear turno fijo (4 fechas)
                                    </Button>
                                )}
                            </>
                        )}
                  </ModalFooter>
              </ModalContent>
          </Modal>
      </div>
  );
}
