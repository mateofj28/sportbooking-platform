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
} from "@heroui/react";
import { useBookings, useConfirmBooking, useCancelBooking } from "@/hooks/use-bookings";
import { CheckCircle, XCircle } from "lucide-react";
import type { BookingStatus } from "@/types";

const STATUS_MAP: Record<BookingStatus, { label: string; color: "warning" | "success" | "danger" | "default" }> = {
    PENDING: { label: "Pendiente", color: "warning" },
    CONFIRMED: { label: "Confirmada", color: "success" },
    CANCELLED: { label: "Cancelada", color: "danger" },
    COMPLETED: { label: "Completada", color: "default" },
};

export default function AdminBookingsPage() {
    const { data: bookings, isLoading } = useBookings();
    const confirmBooking = useConfirmBooking();
    const cancelBooking = useCancelBooking();

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
            <div>
                <h1 className="text-2xl font-bold">Gestión de Reservas</h1>
                <p className="text-sm text-default-500 mt-1">Confirma, cancela y gestiona las reservas</p>
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
        </div>
    );
}
