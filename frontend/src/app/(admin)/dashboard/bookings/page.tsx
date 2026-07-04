"use client";

import {
    Button,
    Chip,
    Spinner,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Input,
    Textarea,
    useDisclosure,
} from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBookings, useConfirmBooking, useCancelBooking } from "@/hooks/use-bookings";
import { useFacilities } from "@/hooks/use-facilities";
import { apiClient } from "@/lib/api-client";
import { CheckCircle, XCircle, Plus } from "lucide-react";
import { useState } from "react";
import type { BookingStatus, User, PaginatedResult } from "@/types";

const STATUS_MAP: Record<BookingStatus, { label: string; color: "warning" | "success" | "danger" | "default" }> = {
    PENDING: { label: "Pendiente", color: "warning" },
    CONFIRMED: { label: "Confirmada", color: "success" },
    CANCELLED: { label: "Cancelada", color: "danger" },
    COMPLETED: { label: "Completada", color: "default" },
};

export default function AdminBookingsPage() {
    const queryClient = useQueryClient();
    const { data: bookings, isLoading } = useBookings();
    const confirmBooking = useConfirmBooking();
    const cancelBooking = useCancelBooking();
    const { isOpen, onOpen, onClose } = useDisclosure();

    const { data: facilities } = useFacilities();
    const { data: usersData } = useQuery({
        queryKey: ["users"],
        queryFn: () => apiClient.get<PaginatedResult<User>>("/users"),
    });

    const [manualForm, setManualForm] = useState({
        facilityId: "",
        userId: "",
        date: "",
        startTime: "",
        endTime: "",
        notes: "",
    });

    const manualBookingMutation = useMutation({
        mutationFn: (data: { facilityId: string; userId: string; startDatetime: string; endDatetime: string; notes?: string }) =>
            apiClient.post("/bookings/manual", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
            onClose();
            setManualForm({ facilityId: "", userId: "", date: "", startTime: "", endTime: "", notes: "" });
        },
    });

    const handleManualSubmit = () => {
        const startDatetime = `${manualForm.date}T${manualForm.startTime}:00`;
        const endDatetime = `${manualForm.date}T${manualForm.endTime}:00`;
        manualBookingMutation.mutate({
            facilityId: manualForm.facilityId,
            userId: manualForm.userId,
            startDatetime,
            endDatetime,
            notes: manualForm.notes || undefined,
        });
    };

    const formatDateTime = (dateStr: string) =>
        new Date(dateStr).toLocaleString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
            </div>
        );
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

            <Table aria-label="Reservas">
                <TableHeader>
                    <TableColumn>INSTALACIÓN</TableColumn>
                    <TableColumn>USUARIO</TableColumn>
                    <TableColumn>FECHA/HORA</TableColumn>
                    <TableColumn>PRECIO</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay reservas">
                    {(bookings || []).map((booking) => {
                        const status = STATUS_MAP[booking.status];
                        return (
                            <TableRow key={booking.id}>
                                <TableCell className="font-medium">{booking.facility.name}</TableCell>
                                <TableCell>
                                    {booking.user.firstName} {booking.user.lastName}
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm">
                                        <p>{formatDateTime(booking.startDatetime)}</p>
                                        <p className="text-default-400">
                                            a {formatDateTime(booking.endDatetime)}
                                        </p>
                                    </div>
                                </TableCell>
                                <TableCell className="font-semibold">
                                    ${booking.totalPrice} {booking.currency}
                                </TableCell>
                                <TableCell>
                                    <Chip color={status.color} size="sm" variant="flat">
                                        {status.label}
                                    </Chip>
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-1">
                                        {booking.status === "PENDING" && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    color="success"
                                                    variant="flat"
                                                    isIconOnly
                                                    onPress={() => confirmBooking.mutate(booking.id)}
                                                >
                                                    <CheckCircle className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    color="danger"
                                                    variant="flat"
                                                    isIconOnly
                                                    onPress={() => cancelBooking.mutate({ id: booking.id })}
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </>
                                        )}
                                        {booking.status === "CONFIRMED" && (
                                            <Button
                                                size="sm"
                                                color="danger"
                                                variant="flat"
                                                isIconOnly
                                                onPress={() => cancelBooking.mutate({ id: booking.id })}
                                            >
                                                <XCircle className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            <Modal isOpen={isOpen} onClose={onClose} size="2xl">
                <ModalContent>
                    <ModalHeader>Reserva Manual</ModalHeader>
                    <ModalBody className="gap-4">
                        <Select
                            label="Instalación"
                            placeholder="Seleccionar instalación"
                            variant="bordered"
                            selectedKeys={manualForm.facilityId ? [manualForm.facilityId] : []}
                            onSelectionChange={(keys: any) => {
                                const selected = Array.from(keys)[0] as string;
                                setManualForm({ ...manualForm, facilityId: selected || "" });
                            }}
                        >
                            {(facilities || []).map((f) => (
                                <SelectItem key={f.id}>{f.name}</SelectItem>
                            ))}
                        </Select>
                        <Select
                            label="Usuario"
                            placeholder="Seleccionar usuario"
                            variant="bordered"
                            selectedKeys={manualForm.userId ? [manualForm.userId] : []}
                            onSelectionChange={(keys: any) => {
                                const selected = Array.from(keys)[0] as string;
                                setManualForm({ ...manualForm, userId: selected || "" });
                            }}
                        >
                            {(usersData?.data || []).map((u) => (
                                <SelectItem key={u.id}>{u.firstName} {u.lastName} ({u.email})</SelectItem>
                            ))}
                        </Select>
                        <Input
                            label="Fecha"
                            type="date"
                            variant="bordered"
                            value={manualForm.date}
                            onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                label="Hora inicio"
                                type="time"
                                variant="bordered"
                                value={manualForm.startTime}
                                onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })}
                            />
                            <Input
                                label="Hora fin"
                                type="time"
                                variant="bordered"
                                value={manualForm.endTime}
                                onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })}
                            />
                        </div>
                        <Textarea
                            label="Notas"
                            placeholder="Notas adicionales (opcional)"
                            variant="bordered"
                            value={manualForm.notes}
                            onValueChange={(v) => setManualForm({ ...manualForm, notes: v })}
                        />
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
