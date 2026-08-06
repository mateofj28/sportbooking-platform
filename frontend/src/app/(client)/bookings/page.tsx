"use client";

import {
    Card,
    CardBody,
    Chip,
    Button,
    Spinner,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Textarea,
    useDisclosure,
} from "@heroui/react";
import { useBookings, useCancelBooking } from "@/hooks/use-bookings";
import { useAuthStore } from "@/stores/auth-store";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Calendar, MapPin, Clock, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Booking, BookingStatus } from "@/types";

const STATUS_MAP: Record<BookingStatus, { label: string; color: "warning" | "success" | "danger" | "default" }> = {
    PENDING: { label: "Pendiente", color: "warning" },
    CONFIRMED: { label: "Confirmada", color: "success" },
    CANCELLED: { label: "Cancelada", color: "danger" },
    COMPLETED: { label: "Completada", color: "default" },
};

const FILTER_TABS: { key: "ALL" | BookingStatus; label: string }[] = [
    { key: "ALL", label: "Todas" },
    { key: "PENDING", label: "Pendientes" },
    { key: "CONFIRMED", label: "Confirmadas" },
    { key: "CANCELLED", label: "Canceladas" },
    { key: "COMPLETED", label: "Completadas" },
];

export default function BookingsPage() {
    const { isAuthenticated, isHydrated } = useAuthStore();
    const router = useRouter();
    const [activeFilter, setActiveFilter] = useState<"ALL" | BookingStatus>("ALL");

    useEffect(() => {
        if (isHydrated && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isHydrated, isAuthenticated, router]);

    const { data: bookingsResponse, isLoading } = useBookings();
    const bookings = bookingsResponse?.data;
    const cancelBooking = useCancelBooking();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [cancelReason, setCancelReason] = useState("");

    if (!isHydrated) return <div className="flex min-h-screen items-center justify-center"><Spinner size="lg" /></div>;
    if (!isAuthenticated) return null;

    const filteredBookings = bookings?.filter((b) =>
        activeFilter === "ALL" ? true : b.status === activeFilter
    ) || [];

    const handleCancelClick = (booking: Booking) => {
        setSelectedBooking(booking);
        onOpen();
    };

    const handleConfirmCancel = () => {
        if (!selectedBooking) return;
        cancelBooking.mutate(
            { id: selectedBooking.id, reason: cancelReason },
            { onSuccess: () => { onClose(); setCancelReason(""); } }
        );
    };

    const formatDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString("es-AR", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

    const formatTime = (dateStr: string) =>
        new Date(dateStr).toLocaleTimeString("es-AR", {
            hour: "2-digit", minute: "2-digit",
        });

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
                <h1 className="text-3xl font-bold">Mis Reservas</h1>
              <p className="mt-2 text-default-500">Gestiona todas tus reservas deportivas</p>

              {/* Filter tabs */}
              <div className="mt-6 flex flex-wrap gap-2">
                  {FILTER_TABS.map((tab) => {
                      const count = tab.key === "ALL"
                          ? bookings?.length || 0
                          : bookings?.filter((b) => b.status === tab.key).length || 0;
                      return (
                          <button
                              key={tab.key}
                              onClick={() => setActiveFilter(tab.key)}
                              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${activeFilter === tab.key
                                      ? "bg-primary text-white shadow-sm"
                                      : "bg-default-100 text-default-600 hover:bg-default-200"
                                  }`}
                          >
                              {tab.label}
                              {count > 0 && (
                                  <span className={`rounded-full px-1.5 text-xs font-bold ${activeFilter === tab.key ? "bg-white/20" : "bg-default-200"
                                      }`}>
                                      {count}
                                  </span>
                              )}
                          </button>
                      );
                  })}
              </div>

              <div className="mt-6 space-y-4">
                  {isLoading ? (
                      <div className="flex justify-center py-12">
                          <Spinner size="lg" />
                      </div>
                  ) : filteredBookings.length > 0 ? (
                      filteredBookings.map((booking) => {
                          const status = STATUS_MAP[booking.status];
                          return (
                              <Card key={booking.id}>
                                  <CardBody className="flex-row items-center justify-between gap-4 p-4">
                                      <div className="flex-1">
                                          <div className="flex items-center gap-3">
                                  <h3 className="font-semibold">{booking.facility.name}</h3>
                                  <Chip color={status.color} size="sm" variant="flat">
                                      {status.label}
                                  </Chip>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-4 text-sm text-default-500">
                                  <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {formatDate(booking.startDatetime)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatTime(booking.startDatetime)} — {formatTime(booking.endDatetime)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {booking.facility.venue.name}
                                  </span>
                              </div>
                              <p className="mt-1 text-sm font-medium text-success">
                                  ${booking.totalPrice} {booking.currency}
                              </p>
                          </div>
                            {(booking.status === "PENDING" || booking.status === "CONFIRMED") && (
                                <Button
                                    color="danger"
                                    variant="light"
                                    size="sm"
                                    startContent={<X className="h-4 w-4" />}
                                    onPress={() => handleCancelClick(booking)}
                                >
                                    Cancelar
                                </Button>
                            )}
                        </CardBody>
                    </Card>
                );
            })
                      ) : (
                          <div className="py-12 text-center">
                              <Calendar className="mx-auto h-12 w-12 text-default-300" />
                              <p className="mt-4 text-lg text-default-500">
                                      {activeFilter === "ALL" ? "No tienes reservas aún" : `No hay reservas ${FILTER_TABS.find(t => t.key === activeFilter)?.label.toLowerCase()}`}
                                  </p>
                                  {activeFilter === "ALL" && (
                                      <Button color="primary" variant="flat" className="mt-4" as="a" href="/facilities">
                                          Explorar instalaciones
                                      </Button>
                                  )}
                      </div>
                  )}
              </div>
          </main>
          <Footer />

          <Modal isOpen={isOpen} onClose={onClose}>
              <ModalContent>
                  <ModalHeader>Cancelar Reserva</ModalHeader>
                  <ModalBody>
                      <p className="text-default-600">¿Estás seguro que deseas cancelar esta reserva?</p>
                      <Textarea
                          label="Motivo (opcional)"
                          placeholder="¿Por qué cancelas?"
                          variant="bordered"
                          value={cancelReason}
                          onValueChange={setCancelReason}
                      />
                  </ModalBody>
                  <ModalFooter>
                      <Button variant="light" onPress={onClose}>Volver</Button>
                      <Button color="danger" onPress={handleConfirmCancel} isLoading={cancelBooking.isPending}>
                          Confirmar Cancelación
                      </Button>
                  </ModalFooter>
              </ModalContent>
          </Modal>
      </div>
  );
}
