"use client";

import { Button, Card, CardBody, CardHeader, Divider, Input, Spinner, Textarea } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useFacilities, useFacility } from "@/hooks/use-facilities";
import { useCreateRecurringBooking } from "@/hooks/use-bookings";
import { AvailabilityPicker, type AvailabilitySelection, formatPrice } from "@/components/shared/availability-picker";
import { useToastStore } from "@/stores/toast-store";
import { ArrowLeft, Search, User, Check, CalendarDays } from "lucide-react";

interface FoundClient {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    dni?: string;
}

export default function NewManualBookingPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);

    // Solo instalaciones reservables (horario + tarifa activos)
    const { data: facilities } = useFacilities({ bookableOnly: "true" });
    const hasFacilities = (facilities || []).length > 0;

    const [facilityId, setFacilityId] = useState("");
    const [userId, setUserId] = useState("");
    const [notes, setNotes] = useState("");
    const [selection, setSelection] = useState<AvailabilitySelection | null>(null);
    const [mode, setMode] = useState<"single" | "recurring">("single");
    const [recurringResult, setRecurringResult] = useState<null | { createdCount: number; skippedCount: number; skipped: { date: string; reason: string }[] }>(null);

    const { data: selectedFacility } = useFacility(facilityId);
    const createRecurring = useCreateRecurringBooking();

    // Búsqueda de cliente por email/DNI
    const [clientSearchType, setClientSearchType] = useState<"email" | "dni">("email");
    const [clientSearchValue, setClientSearchValue] = useState("");
    const [foundClient, setFoundClient] = useState<FoundClient | null>(null);
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
            const client = await apiClient.get<FoundClient>("/users/lookup", params);
            setFoundClient(client);
            setUserId(client.id);
        } catch (err: any) {
            setClientLookupError(err?.message || "No se encontró un cliente con esos datos");
            setUserId("");
        } finally {
            setClientLookupLoading(false);
        }
    };

    const buildLocalIso = (date: Date, time: string) => {
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${mo}-${d}T${time}:00`;
    };

    const bookingMutation = useMutation({
        mutationFn: (data: { facilityId: string; userId: string; startDatetime: string; endDatetime: string; notes?: string }) =>
            apiClient.post("/bookings/manual", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bookings"] });
            addToast("Reserva creada correctamente");
            router.push("/dashboard/bookings");
        },
        onError: (error: any) => {
            const msg = error?.message || "No se pudo crear la reserva";
            addToast(Array.isArray(msg) ? msg[0] : msg);
        },
    });

    const handleSingleSubmit = () => {
        if (!facilityId || !userId || !selection) return;
        bookingMutation.mutate({
            facilityId,
            userId,
            startDatetime: buildLocalIso(selection.date, selection.startTime),
            endDatetime: buildLocalIso(selection.date, selection.endTime),
            notes: notes || undefined,
        });
    };

    const handleRecurringSubmit = () => {
        if (!facilityId || !userId || !selection) return;
        const startDate = buildLocalIso(selection.date, "00:00").split("T")[0];
        createRecurring.mutate(
            {
                facilityId,
                userId,
                dayOfWeek: selection.dayOfWeek,
                startTime: selection.startTime,
                endTime: selection.endTime,
                startDate,
                notes: notes || undefined,
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button isIconOnly variant="light" onPress={() => router.push("/dashboard/bookings")} aria-label="Volver">
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Nueva reserva manual</h1>
                    <p className="text-sm text-default-500">Crea una reserva a nombre de un cliente</p>
                </div>
            </div>

            {!hasFacilities ? (
                <Card className="border border-warning/40 bg-warning/10">
                    <CardBody className="p-6 text-center">
                        <p className="text-sm font-semibold text-warning-700">No hay instalaciones disponibles para reservar</p>
                        <p className="mt-1 text-sm text-default-600">
                            Para que una instalación aparezca aquí, debe tener configurado un <strong>horario</strong> y una <strong>tarifa</strong> activos.
                            Configúralos en las secciones <strong>Horarios</strong> y <strong>Precios</strong>.
                        </p>
                        <Button color="primary" variant="flat" className="mt-4 mx-auto" onPress={() => router.push("/dashboard/bookings")}>
                            Volver a reservas
                        </Button>
                    </CardBody>
                </Card>
            ) : recurringResult ? (
                <Card>
                    <CardBody className="p-6">
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
                        <Button color="primary" className="mt-4" onPress={() => router.push("/dashboard/bookings")}>
                            Ir a reservas
                        </Button>
                    </CardBody>
                </Card>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
                    {/* Columna izquierda: configuración */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="pb-0"><h2 className="text-base font-semibold">1. Instalación y cliente</h2></CardHeader>
                            <CardBody className="gap-4">
                                <Select
                                    label="Instalación"
                                    placeholder="Seleccionar"
                                    variant="bordered"
                                    selectedKeys={facilityId ? [facilityId] : []}
                                    onSelectionChange={(keys: any) => {
                                        setFacilityId(Array.from(keys)[0] as string || "");
                                        setSelection(null);
                                    }}
                                >
                                    {(facilities || []).map((f) => (<SelectItem key={f.id}>{f.name}</SelectItem>))}
                                </Select>

                                <div>
                                    <p className="mb-2 text-sm font-medium">Cliente</p>
                                    <div className="flex gap-2">
                                        <Select
                                            aria-label="Buscar por"
                                            variant="bordered"
                                            size="sm"
                                            className="max-w-[110px]"
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
                                        <Button size="sm" color="primary" variant="flat" isLoading={clientLookupLoading} onPress={handleClientLookup} startContent={!clientLookupLoading && <Search className="h-4 w-4" />}>
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
                                    {clientLookupError && <p className="mt-2 text-sm text-danger">{clientLookupError}</p>}
                                </div>
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHeader className="pb-0"><h2 className="text-base font-semibold">Tipo de reserva</h2></CardHeader>
                            <CardBody className="gap-4">
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMode("single")}
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${mode === "single" ? "border-primary bg-primary/10 text-primary" : "border-divider hover:border-primary"}`}
                                    >
                                        Reserva única
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode("recurring")}
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${mode === "recurring" ? "border-primary bg-primary/10 text-primary" : "border-divider hover:border-primary"}`}
                                    >
                                        Turno fijo
                                    </button>
                                </div>
                                {mode === "recurring" && (
                                    <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-default-600">
                                        Se reservarán las próximas <strong>4</strong> fechas de ese día. Las no disponibles se omiten y se informan.
                                    </p>
                                )}
                                <Textarea label="Notas (opcional)" variant="bordered" value={notes} onValueChange={setNotes} minRows={2} />
                            </CardBody>
                        </Card>

                        {/* Resumen + acción */}
                        <Card>
                            <CardBody className="gap-3">
                                {selection ? (
                                    <div className="space-y-1 text-sm">
                                        <p className="font-semibold text-default-700">Resumen</p>
                                        <p className="text-default-600">
                                            📅 {mode === "recurring"
                                                ? `Todos los ${selection.date.toLocaleDateString("es-AR", { weekday: "long" })}`
                                                : selection.date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                                        </p>
                                        <p className="text-xl font-bold text-success">${formatPrice(selection.price)} ARS {mode === "recurring" && <span className="text-xs font-normal text-default-400">por fecha</span>}</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-default-400">Selecciona día y hora en el panel de la derecha.</p>
                                )}
                                <Divider />
                                {mode === "single" ? (
                                    <Button color="primary" size="lg" startContent={<Check className="h-4 w-4" />} isLoading={bookingMutation.isPending} isDisabled={!userId || !selection} onPress={handleSingleSubmit}>
                                        Crear reserva {selection ? `· $${formatPrice(selection.price)} ARS` : ""}
                                    </Button>
                                ) : (
                                    <Button color="primary" size="lg" startContent={<CalendarDays className="h-4 w-4" />} isLoading={createRecurring.isPending} isDisabled={!userId || !selection} onPress={handleRecurringSubmit}>
                                        Crear turno fijo (4 fechas)
                                    </Button>
                                )}
                                {!userId && <p className="text-xs text-default-400">Busca y selecciona un cliente para continuar.</p>}
                            </CardBody>
                        </Card>
                    </div>

                    {/* Columna derecha: disponibilidad */}
                    <Card>
                        <CardHeader className="pb-0">
                            <h2 className="text-base font-semibold">2. Disponibilidad</h2>
                        </CardHeader>
                        <CardBody>
                            {!facilityId ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <CalendarDays className="h-10 w-10 text-default-200" />
                                    <p className="mt-3 text-sm text-default-500">Selecciona una instalación para ver los horarios disponibles</p>
                                </div>
                            ) : !selectedFacility ? (
                                <div className="flex justify-center py-16"><Spinner size="lg" /></div>
                            ) : (
                                <AvailabilityPicker
                                    key={facilityId}
                                    facility={selectedFacility}
                                    onChange={setSelection}
                                    dayLabel={mode === "recurring" ? "1. Elige el día de la semana" : "1. Elige el día"}
                                />
                            )}
                        </CardBody>
                    </Card>
                </div>
            )}
        </div>
    );
}
