"use client";

import {
    Button, Chip, Spinner, Card, CardBody,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
    Input, Textarea, useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useConfirmBooking, useCancelBooking } from "@/hooks/use-bookings";
import { useFacilities } from "@/hooks/use-facilities";
import { apiClient } from "@/lib/api-client";
import { CheckCircle, XCircle, Plus, Calendar, Clock, MapPin, User, DollarSign } from "lucide-react";
import { useState } from "react";
import { useToastStore } from "@/stores/toast-store";
import type { Booking, BookingStatus, User as UserType, PaginatedResult } from "@/types";

const STATUS_MAP: Record<BookingStatus, { label: string; color: "warning" | "success" | "danger" | "default" }> = {
    PENDING: { label: "Pendiente", color: "warning" },
    CONFIRMED: { label: "Confirmada", color: "success" },
    CANCELLED: { label: "Cancelada", color: "danger" },
    COMPLETED: { label: "Completada", color: "default" },
};

export default function AdminBookingsPage() {
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
    const [page, setPage] = useState(1);

    const { data: bookingsData, isLoading } = useQuery({
        queryKey: ["bookings", page],
      queryFn: () => apiClient.get<{ data: Booking[]; meta: { total: number; page: number; totalPages: number } }>("/bookings", { page: String(page), limit: "12" }),
  });
    const bookings = bookingsData?.data;
    const meta = bookingsData?.meta;

    const confirmBooking = useConfirmBooking();
    const cancelBooking = useCancelBooking();
    const { isOpen, onOpen, onClose } = useDisclosure();

    const { data: facilities } = useFacilities();
    const { data: usersData } = useQuery({
        queryKey: ["users"],
      queryFn: () => apiClient.get<PaginatedResult<UserType>>("/users"),
  });

    const [manualForm, setManualForm] = useState({
      facilityId: "", userId: "", date: "", startTime: "", endTime: "", notes: "",
  });

    const manualBookingMutation = useMutation({
        mutationFn: (data: { facilityId: string; userId: string; startDatetime: string; endDatetime: string; notes?: string }) =>
            apiClient.post("/bookings/manual", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
            onClose();
            setManualForm({ facilityId: "", userId: "", date: "", startTime: "", endTime: "", notes: "" });
            addToast("Reserva creada correctamente");
        },
    });

    const handleManualSubmit = () => {
      manualBookingMutation.mutate({
          facilityId: manualForm.facilityId,
          userId: manualForm.userId,
        startDatetime: `${manualForm.date}T${manualForm.startTime}:00`,
        endDatetime: `${manualForm.date}T${manualForm.endTime}:00`,
        notes: manualForm.notes || undefined,
    });
  };

    const formatDate = (d: string) => new Date(d).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    const formatTime = (d: string) => new Date(d).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    if (isLoading) {
      return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
  }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Gestión de Reservas</h1>
                    <p className="text-sm text-default-500 mt-1">Confirma, cancela y gestiona las reservas</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={onOpen}>
                    Reserva Manual
                </Button>
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
                                <span className="font-semibold text-success">${booking.totalPrice} {booking.currency}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        {(booking.status === "PENDING" || booking.status === "CONFIRMED") && (
                            <div className="flex gap-2 pt-2 border-t border-divider mt-1">
                                {booking.status === "PENDING" && (
                                    <Button
                                        size="sm"
                                        color="success"
                                        variant="flat"
                                        className="flex-1"
                                        startContent={<CheckCircle className="h-3.5 w-3.5" />}
                                        onPress={() => confirmBooking.mutate(booking.id, { onSuccess: () => { addToast("Reserva confirmada"); queryClient.invalidateQueries({ queryKey: ["bookings"] }); } })}
                                    >
                                        Confirmar
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    color="danger"
                                    variant="flat"
                                    className={booking.status === "PENDING" ? "flex-1" : "w-full"}
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
          <Modal isOpen={isOpen} onClose={onClose} size="2xl">
              <ModalContent>
                  <ModalHeader>Reserva Manual</ModalHeader>
                  <ModalBody className="gap-4">
                      <Select label="Instalación" placeholder="Seleccionar" variant="bordered" selectedKeys={manualForm.facilityId ? [manualForm.facilityId] : []} onSelectionChange={(keys: any) => setManualForm({ ...manualForm, facilityId: Array.from(keys)[0] as string || "" })}>
                          {(facilities || []).map((f) => (<SelectItem key={f.id}>{f.name}</SelectItem>))}
                      </Select>
                      <Select label="Usuario" placeholder="Seleccionar" variant="bordered" selectedKeys={manualForm.userId ? [manualForm.userId] : []} onSelectionChange={(keys: any) => setManualForm({ ...manualForm, userId: Array.from(keys)[0] as string || "" })}>
                          {(usersData?.data || []).map((u) => (<SelectItem key={u.id}>{u.firstName} {u.lastName} ({u.email})</SelectItem>))}
                      </Select>
                      <Input label="Fecha" type="date" variant="bordered" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} />
                      <div className="grid grid-cols-2 gap-4">
                          <Input label="Inicio" type="time" variant="bordered" value={manualForm.startTime} onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })} />
                          <Input label="Fin" type="time" variant="bordered" value={manualForm.endTime} onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })} />
                      </div>
                      <Textarea label="Notas (opcional)" variant="bordered" value={manualForm.notes} onValueChange={(v) => setManualForm({ ...manualForm, notes: v })} />
                  </ModalBody>
                  <ModalFooter>
                      <Button variant="light" onPress={onClose}>Cancelar</Button>
                      <Button color="primary" onPress={handleManualSubmit} isLoading={manualBookingMutation.isPending}>Crear Reserva</Button>
                  </ModalFooter>
              </ModalContent>
          </Modal>
      </div>
  );
}
