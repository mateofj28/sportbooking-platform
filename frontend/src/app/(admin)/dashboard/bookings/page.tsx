"use client";

import { Button, Chip, Spinner, Card, CardBody, Input } from "@heroui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCancelBooking } from "@/hooks/use-bookings";
import { apiClient } from "@/lib/api-client";
import { XCircle, Plus, Calendar, Clock, MapPin, User, DollarSign, Search } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
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
    const router = useRouter();
    const [page, setPage] = useState(1);

    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"ALL" | BookingStatus>("ALL");

    const { data: bookingsData, isLoading } = useQuery({
        queryKey: ["bookings"],
        queryFn: () => apiClient.get<{ data: Booking[]; meta: { total: number; page: number; totalPages: number } }>("/bookings", { limit: "500" }),
    });
    const allBookings = bookingsData?.data;

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

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { ALL: (allBookings || []).length };
        (allBookings || []).forEach((b) => { counts[b.status] = (counts[b.status] || 0) + 1; });
        return counts;
    }, [allBookings]);

    const totalPages = Math.max(1, Math.ceil(filteredBookings.length / PER_PAGE));
    const bookings = filteredBookings.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const meta = { total: filteredBookings.length, page, totalPages };

    useEffect(() => { setPage(1); }, [search, statusFilter]);

    const cancelBooking = useCancelBooking();

    const formatDate = (d: string) => new Date(d).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        let h = d.getHours();
        const m = d.getMinutes();
        const ampm = h < 12 ? "a. m." : "p. m.";
        h = h % 12; if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
    };

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
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={() => router.push("/dashboard/bookings/nueva")}>
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
        </div>
    );
}
