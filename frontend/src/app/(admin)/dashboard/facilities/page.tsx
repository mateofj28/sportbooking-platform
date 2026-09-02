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
import { useFacilities } from "@/hooks/use-facilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { Select, SelectItem } from "@heroui/select";
import { ConfirmModal } from "@/components/shared/confirm-modal";
import { useToastStore } from "@/stores/toast-store";
import type { Sport, Venue } from "@/types";

const SURFACE_TYPES = [
    "Césped sintético",
    "Césped natural",
    "Arcilla",
    "Cemento",
    "Madera",
    "Caucho",
    "Vidrio/Cristal",
    "Parquet",
    "Tartán",
];

// Servicios/amenidades que puede ofrecer una instalación
const AMENITIES = [
    { key: "Vestuarios", emoji: "🚪" },
    { key: "Duchas", emoji: "🚿" },
    { key: "Baños", emoji: "🚻" },
    { key: "WiFi", emoji: "📶" },
    { key: "Estacionamiento", emoji: "🅿️" },
    { key: "Parrilla", emoji: "🔥" },
    { key: "Buffet", emoji: "🍔" },
    { key: "Iluminación nocturna", emoji: "💡" },
    { key: "Alquiler de equipos", emoji: "🎽" },
    { key: "Cafetería", emoji: "☕" },
    { key: "Tribunas", emoji: "🪑" },
    { key: "Aire acondicionado", emoji: "❄️" },
    { key: "Kiosco", emoji: "🏪" },
    { key: "Seguridad", emoji: "🛡️" },
    { key: "Accesible", emoji: "♿" },
];

// Duraciones recomendadas por deporte (slug → opciones en minutos)
const DURATION_BY_SPORT: Record<string, { min: number; max: number; options: number[] }> = {
    futbol: { min: 60, max: 60, options: [60] },
    tenis: { min: 60, max: 90, options: [60, 90] },
    padel: { min: 60, max: 90, options: [60, 90] },
    basquetbol: { min: 60, max: 90, options: [60, 90] },
    voleibol: { min: 60, max: 90, options: [60, 90] },
};

const DEFAULT_DURATION = { min: 60, max: 120, options: [60, 90, 120] };

// Superficie sugerida por deporte (debe coincidir con SURFACE_TYPES)
const SURFACE_BY_SPORT: Record<string, string> = {
    futbol: "Césped natural",
    tenis: "Arcilla",
    padel: "Césped sintético",
    basquetbol: "Cemento",
    voleibol: "Madera",
    yoga: "Parquet",
};

/** Normaliza el nombre del deporte a una clave (sin acentos, minúsculas) */
function sportKey(name?: string): string {
    return (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function AdminFacilitiesPage() {
    const queryClient = useQueryClient();
    const addToast = useToastStore((s) => s.addToast);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const { data: facilities, isLoading } = useFacilities();
    const { data: sports } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });
    const { data: venues } = useQuery({
        queryKey: ["venues"],
        queryFn: () => apiClient.get<Venue[]>("/venues"),
    });

    // Filters
    const [searchName, setSearchName] = useState("");
    const [filterSport, setFilterSport] = useState("");
    const [filterVenue, setFilterVenue] = useState("");
    const [filterSurface, setFilterSurface] = useState("");

    const filteredFacilities = useMemo(() => {
        if (!facilities) return [];
        return facilities.filter((f) => {
            if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
            if (filterSport && f.sport.id !== filterSport) return false;
            if (filterVenue && f.venue.id !== filterVenue) return false;
            if (filterSurface && f.surfaceType?.toLowerCase() !== filterSurface.toLowerCase()) return false;
            return true;
        });
    }, [facilities, searchName, filterSport, filterVenue, filterSurface]);

    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
    const [form, setForm] = useState({
        name: "",
        description: "",
        venueId: "",
        sportId: "",
        surfaceType: "",
        isIndoor: false,
        amenities: [] as string[],
        minBookingDuration: "60",
        maxBookingDuration: "120",
    });
    const [editForm, setEditForm] = useState({
        id: "",
        name: "",
        description: "",
        surfaceType: "",
        isIndoor: false,
        amenities: [] as string[],
        minBookingDuration: "60",
        maxBookingDuration: "120",
    });

    const toggleCreateAmenity = (a: string) =>
        setForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }));
    const toggleEditAmenity = (a: string) =>
        setEditForm((f) => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a] }));

    const createMutation = useMutation({
        mutationFn: (data: any) => apiClient.post("/facilities", data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
            onClose();
            addToast("Item creado correctamente");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiClient.delete(`/facilities/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
            addToast("Item eliminado correctamente");
        },
    });

    const editMutation = useMutation({
        mutationFn: ({ id, ...data }: { id: string; name: string; description: string; surfaceType: string; isIndoor: boolean; amenities: string[]; minBookingDuration: number; maxBookingDuration: number }) =>
            apiClient.patch(`/facilities/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["facilities"] });
            onEditClose();
            addToast("Item actualizado correctamente");
        },
    });

    const handleEdit = (facility: any) => {
        setEditForm({
            id: facility.id,
            name: facility.name,
            description: facility.description || "",
            surfaceType: facility.surfaceType || "",
            isIndoor: !!facility.isIndoor,
            amenities: facility.amenities || [],
            minBookingDuration: String(facility.minBookingDuration),
            maxBookingDuration: String(facility.maxBookingDuration),
        });
        onEditOpen();
    };

    const handleEditSubmit = () => {
        editMutation.mutate({
            id: editForm.id,
            name: editForm.name,
            description: editForm.description,
            surfaceType: editForm.surfaceType,
            isIndoor: editForm.isIndoor,
            amenities: editForm.amenities,
            minBookingDuration: parseInt(editForm.minBookingDuration),
            maxBookingDuration: parseInt(editForm.maxBookingDuration),
        });
    };

    const handleCreate = () => {
        const defaultSport = sports?.[0];
        const key = defaultSport ? sportKey(defaultSport.name) : "";
        const durations = DURATION_BY_SPORT[key] || DEFAULT_DURATION;
        setForm({
            name: "",
            description: "",
            venueId: venues?.[0]?.id || "",
            sportId: defaultSport?.id || "",
            surfaceType: SURFACE_BY_SPORT[key] || "",
            isIndoor: false,
            amenities: [],
            minBookingDuration: String(durations.min),
            maxBookingDuration: String(durations.max),
        });
        onOpen();
    };

    const handleSubmit = () => {
        // La capacidad se deriva de la cantidad de jugadores del deporte seleccionado
        const selectedSport = sports?.find((s) => s.id === form.sportId);
        const capacity = selectedSport?.maxPlayers ?? undefined;
        createMutation.mutate({
            ...form,
            capacity,
            minBookingDuration: parseInt(form.minBookingDuration),
            maxBookingDuration: parseInt(form.maxBookingDuration),
        });
    };

    // Get unique surface types from existing facilities for the filter
    const availableSurfaces = useMemo(() => {
        if (!facilities) return [];
        const surfaces = new Set(facilities.map((f) => f.surfaceType).filter(Boolean));
        return Array.from(surfaces) as string[];
    }, [facilities]);

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
                    <h1 className="text-2xl font-bold">Instalaciones</h1>
                    <p className="text-sm text-default-500 mt-1">Gestiona las canchas y campos</p>
                </div>
                <Button color="primary" startContent={<Plus className="h-4 w-4" />} onPress={handleCreate}>
                    Nueva Instalación
                </Button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Input
                    placeholder="Buscar por nombre..."
                    variant="bordered"
                    size="sm"
                    value={searchName}
                    onValueChange={setSearchName}
                    startContent={<Search className="h-4 w-4 text-default-400" />}
                    isClearable
                    onClear={() => setSearchName("")}
                />
                <Select
                    placeholder="Filtrar por deporte"
                    variant="bordered"
                    size="sm"
                    selectedKeys={filterSport ? [filterSport] : []}
                    onSelectionChange={(keys: any) => setFilterSport(Array.from(keys)[0] as string || "")}
                >
                    {(sports || []).map((s) => (
                        <SelectItem key={s.id}>{s.name}</SelectItem>
                    ))}
                </Select>
                <Select
                    placeholder="Filtrar por sede"
                    variant="bordered"
                    size="sm"
                    selectedKeys={filterVenue ? [filterVenue] : []}
                    onSelectionChange={(keys: any) => setFilterVenue(Array.from(keys)[0] as string || "")}
                >
                    {(venues || []).map((v) => (
                        <SelectItem key={v.id}>{v.name}</SelectItem>
                    ))}
                </Select>
                <Select
                    placeholder="Filtrar por superficie"
                    variant="bordered"
                    size="sm"
                    selectedKeys={filterSurface ? [filterSurface] : []}
                    onSelectionChange={(keys: any) => setFilterSurface(Array.from(keys)[0] as string || "")}
                >
                    {availableSurfaces.map((s) => (
                        <SelectItem key={s}>{s}</SelectItem>
                    ))}
                </Select>
            </div>

            {/* Active filters indicator */}
            {(searchName || filterSport || filterVenue || filterSurface) && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-default-500">
                        {filteredFacilities.length} resultado{filteredFacilities.length !== 1 ? "s" : ""}
                    </span>
                    <Button size="sm" variant="light" color="danger" onPress={() => { setSearchName(""); setFilterSport(""); setFilterVenue(""); setFilterSurface(""); }}>
                        Limpiar filtros
                    </Button>
                </div>
            )}

            <Table aria-label="Instalaciones">
                <TableHeader>
                    <TableColumn>NOMBRE</TableColumn>
                    <TableColumn>DEPORTE</TableColumn>
                    <TableColumn>SEDE</TableColumn>
                    <TableColumn>SUPERFICIE</TableColumn>
                    <TableColumn>ESTADO</TableColumn>
                    <TableColumn>ACCIONES</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No hay instalaciones que coincidan con los filtros">
                    {filteredFacilities.map((facility) => (
                        <TableRow key={facility.id}>
                            <TableCell className="font-medium">{facility.name}</TableCell>
                            <TableCell>
                                <Chip color="primary" size="sm" variant="flat">
                                    {facility.sport.name}
                                </Chip>
                            </TableCell>
                            <TableCell>{facility.venue.name}</TableCell>
                            <TableCell>{facility.surfaceType || "-"}</TableCell>
                            <TableCell>
                                <Chip color={facility.isActive ? "success" : "danger"} size="sm" variant="dot">
                                    {facility.isActive ? "Activa" : "Inactiva"}
                                </Chip>
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        color="primary"
                                        variant="light"
                                        isIconOnly
                                        onPress={() => handleEdit(facility)}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        color="danger"
                                        variant="light"
                                        isIconOnly
                                        onPress={() => setDeleteId(facility.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <Modal isOpen={isOpen} onClose={onClose} size="2xl">
                <ModalContent>
                    <ModalHeader>Nueva Instalación</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input label="Nombre" placeholder="Ej: Cancha de Fútbol 5 - A" variant="bordered" value={form.name} onValueChange={(v) => setForm({ ...form, name: v })} />
                        <div className="grid grid-cols-2 gap-4">
                            <Select
                                label="Sede"
                                placeholder="Seleccionar sede"
                                variant="bordered"
                                selectedKeys={form.venueId ? new Set([form.venueId]) as any : new Set() as any}
                                onSelectionChange={(keys: any) => setForm({ ...form, venueId: Array.from(keys)[0] as string || "" })}
                            >
                                {(venues || []).map((v) => (
                                    <SelectItem key={v.id} textValue={`${v.name} — ${v.city}`}>{v.name} — {v.city}</SelectItem>
                                ))}
                            </Select>
                            <Select
                                label="Deporte"
                                placeholder="Seleccionar deporte"
                                variant="bordered"
                                selectedKeys={form.sportId ? new Set([form.sportId]) as any : new Set() as any}
                                onSelectionChange={(keys: any) => {
                                    const sportId = Array.from(keys)[0] as string || "";
                                    const sport = sports?.find((s) => s.id === sportId);
                                    const key = sport ? sportKey(sport.name) : "";
                                    const durations = sport ? (DURATION_BY_SPORT[key] || DEFAULT_DURATION) : DEFAULT_DURATION;
                                    const surface = SURFACE_BY_SPORT[key] || form.surfaceType;
                                    setForm({ ...form, sportId, surfaceType: surface, minBookingDuration: String(durations.min), maxBookingDuration: String(durations.max) });
                                }}
                            >
                                {(sports || []).map((s) => (
                                    <SelectItem key={s.id}>{s.name}</SelectItem>
                                ))}
                            </Select>
                        </div>
                        {/* Capacidad derivada del deporte */}
                        {(() => {
                            const sport = sports?.find((s) => s.id === form.sportId);
                            if (!sport) return null;
                            return (
                                <div className="rounded-lg bg-default-100 px-3 py-2 text-sm">
                                    <span className="text-default-500">Capacidad (según deporte): </span>
                                    <span className="font-semibold">
                                        {sport.maxPlayers != null ? `${sport.maxPlayers} jugadores` : "No definida para este deporte"}
                                    </span>
                                </div>
                            );
                        })()}
                        <Textarea label="Descripción" placeholder="Descripción breve de la instalación" variant="bordered" value={form.description} onValueChange={(v) => setForm({ ...form, description: v })} />
                        <Select
                            label="Tipo de superficie"
                            placeholder="Seleccionar superficie"
                            variant="bordered"
                            selectedKeys={form.surfaceType ? new Set([form.surfaceType]) as any : new Set() as any}
                            onSelectionChange={(keys: any) => setForm({ ...form, surfaceType: Array.from(keys)[0] as string || "" })}
                        >
                            {SURFACE_TYPES.map((s) => (
                                <SelectItem key={s}>{s}</SelectItem>
                            ))}
                        </Select>
                        {/* Ubicación: Indoor / Exterior */}
                        <div>
                            <p className="text-xs text-default-500 mb-2">Ubicación</p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, isIndoor: false })}
                                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${!form.isIndoor
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-divider hover:border-primary"
                                        }`}
                                >
                                    ☀️ Exterior
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm({ ...form, isIndoor: true })}
                                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${form.isIndoor
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-divider hover:border-primary"
                                        }`}
                                >
                                    🏠 Indoor
                                </button>
                            </div>
                        </div>
                        {/* Duration - auto-calculated from sport */}
                        <div>
                            <p className="text-xs text-default-500 mb-2">Duración de reserva (según deporte seleccionado)</p>
                            <div className="flex gap-2">
                                {(() => {
                                    const sport = sports?.find((s) => s.id === form.sportId);
                                    const durations = sport ? (DURATION_BY_SPORT[sportKey(sport.name)] || DEFAULT_DURATION) : DEFAULT_DURATION;
                                    return durations.options.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setForm({ ...form, minBookingDuration: String(d), maxBookingDuration: String(d) })}
                                            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${form.minBookingDuration === String(d)
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-divider hover:border-primary"
                                                }`}
                                        >
                                            {d} min
                                        </button>
                                    ));
                                })()}
                            </div>
                        </div>
                        {/* Amenidades / servicios */}
                        <div>
                            <p className="text-xs text-default-500 mb-2">Servicios disponibles</p>
                            <div className="flex flex-wrap gap-2">
                                {AMENITIES.map((a) => {
                                    const active = form.amenities.includes(a.key);
                                    return (
                                        <button
                                            key={a.key}
                                            type="button"
                                            onClick={() => toggleCreateAmenity(a.key)}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${active
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-divider text-default-600 hover:border-primary"
                                                }`}
                                        >
                                            {a.emoji} {a.key}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onClose}>Cancelar</Button>
                        <Button color="primary" onPress={handleSubmit} isLoading={createMutation.isPending}>Crear</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal isOpen={isEditOpen} onClose={onEditClose} size="2xl">
                <ModalContent>
                    <ModalHeader>Editar Instalación</ModalHeader>
                    <ModalBody className="gap-4">
                        <Input label="Nombre" variant="bordered" value={editForm.name} onValueChange={(v) => setEditForm({ ...editForm, name: v })} />
                        <Textarea label="Descripción" variant="bordered" value={editForm.description} onValueChange={(v) => setEditForm({ ...editForm, description: v })} />
                        <Select
                            label="Tipo de superficie"
                            placeholder="Seleccionar superficie"
                            variant="bordered"
                            selectedKeys={editForm.surfaceType ? new Set([editForm.surfaceType]) as any : new Set() as any}
                            onSelectionChange={(keys: any) => setEditForm({ ...editForm, surfaceType: Array.from(keys)[0] as string || "" })}
                        >
                            {SURFACE_TYPES.map((s) => (
                                <SelectItem key={s} textValue={s}>{s}</SelectItem>
                            ))}
                        </Select>
                        {/* Ubicación: Indoor / Exterior */}
                        <div>
                            <p className="text-xs text-default-500 mb-2">Ubicación</p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, isIndoor: false })}
                                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${!editForm.isIndoor
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-divider hover:border-primary"
                                        }`}
                                >
                                    ☀️ Exterior
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditForm({ ...editForm, isIndoor: true })}
                                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${editForm.isIndoor
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-divider hover:border-primary"
                                        }`}
                                >
                                    🏠 Indoor
                                </button>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-default-500 mb-2">Duración de reserva</p>
                            <div className="flex gap-2">
                                {DEFAULT_DURATION.options.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setEditForm({ ...editForm, minBookingDuration: String(d), maxBookingDuration: String(d) })}
                                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${editForm.minBookingDuration === String(d)
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-divider hover:border-primary"
                                            }`}
                                    >
                                        {d} min
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Amenidades / servicios */}
                        <div>
                            <p className="text-xs text-default-500 mb-2">Servicios disponibles</p>
                            <div className="flex flex-wrap gap-2">
                                {AMENITIES.map((a) => {
                                    const active = editForm.amenities.includes(a.key);
                                    return (
                                        <button
                                            key={a.key}
                                            type="button"
                                            onClick={() => toggleEditAmenity(a.key)}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${active
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-divider text-default-600 hover:border-primary"
                                                }`}
                                        >
                                            {a.emoji} {a.key}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="light" onPress={onEditClose}>Cancelar</Button>
                        <Button color="primary" onPress={handleEditSubmit} isLoading={editMutation.isPending}>Guardar</Button>
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
