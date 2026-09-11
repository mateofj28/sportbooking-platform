"use client";

import { Suspense, useMemo, useState } from "react";
import { Card, CardBody, CardFooter, Input, Spinner, Button } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useFacilities } from "@/hooks/use-facilities";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { FacilityCard } from "@/components/cards/facility-card";
import { Search, MapPin, ArrowLeft, Building2 } from "lucide-react";
import type { Sport, Venue } from "@/types";

const VENUE_IMAGE = "https://images.unsplash.com/photo-1461896836934-bd900bb65104?w=600&h=300&fit=crop";

function FacilitiesContent() {
    const searchParams = useSearchParams();
    // Nivel 2: complejo seleccionado (por estado o por query param)
    const [venueId, setVenueId] = useState(() => searchParams.get("venueId") || "");
    // Buscador de complejos (nivel 1)
    const [venueSearch, setVenueSearch] = useState("");
    // Filtro por deporte (nivel 2)
    const [sportId, setSportId] = useState(() => searchParams.get("sportId") || "");

    const { data: venues, isLoading: venuesLoading } = useQuery({
        queryKey: ["venues"],
        queryFn: () => apiClient.get<Venue[]>("/venues"),
    });

    const { data: sports } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });

    const selectedVenue = useMemo(
        () => venues?.find((v) => v.id === venueId),
        [venues, venueId],
    );

    // Complejos filtrados por el buscador (nivel 1)
    const filteredVenues = useMemo(() => {
        const list = venues || [];
        const q = venueSearch.trim().toLowerCase();
        if (!q) return list;
        return list.filter(
            (v) =>
                v.name.toLowerCase().includes(q) ||
                v.city?.toLowerCase().includes(q),
        );
    }, [venues, venueSearch]);

    // Canchas del complejo seleccionado (nivel 2)
    const { data: facilities, isLoading: facilitiesLoading } = useFacilities({
        venueId: venueId || undefined,
        sportId: sportId || undefined,
        bookableOnly: "true",
    });

    const handleSelectVenue = (id: string) => {
        setVenueId(id);
        setSportId("");
    };

    const handleBack = () => {
        setVenueId("");
        setSportId("");
    };

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
                {!venueId ? (
                    <>
                        {/* NIVEL 1: listado de complejos */}
                        <h1 className="text-3xl font-bold">Complejos Deportivos</h1>
                        <p className="mt-2 text-default-500">
                            Elige un complejo para ver sus canchas disponibles
                        </p>

                        <div className="mt-6">
                            <Input
                                placeholder="Buscar complejo por nombre o ciudad..."
                                value={venueSearch}
                                onValueChange={setVenueSearch}
                                startContent={<Search className="h-4 w-4 text-default-400" />}
                                className="max-w-md"
                                variant="bordered"
                                isClearable
                                onClear={() => setVenueSearch("")}
                            />
                        </div>

                        <div className="mt-8">
                            {venuesLoading ? (
                                <div className="flex justify-center py-12">
                                    <Spinner size="lg" />
                                </div>
                            ) : filteredVenues.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {filteredVenues.map((venue) => (
                                        <Card
                                            key={venue.id}
                                            isPressable
                                            onPress={() => handleSelectVenue(venue.id)}
                                            className="w-full overflow-hidden"
                                        >
                                            <div className="relative h-40 w-full overflow-hidden">
                                                <img
                                                    src={venue.imageUrl || VENUE_IMAGE}
                                                    alt={venue.name}
                                                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                            </div>
                                            <CardBody className="p-4">
                                                <h3 className="truncate text-base font-semibold">{venue.name}</h3>
                                                <div className="mt-1 flex items-center gap-1 text-xs text-default-500">
                                                    <MapPin className="h-3 w-3 flex-shrink-0" />
                                                    <span className="truncate">
                                                        {venue.address ? `${venue.address} — ` : ""}{venue.city}
                                                    </span>
                                                </div>
                                                {venue.description && (
                                                    <p className="mt-2 line-clamp-2 text-xs text-default-500">
                                                        {venue.description}
                                                    </p>
                                                )}
                                            </CardBody>
                                            <CardFooter className="justify-between border-t border-divider px-4 py-2.5">
                                                <span className="text-xs text-default-400">{venue.city}</span>
                                                <Button size="sm" color="primary" variant="flat">
                                                    Ver canchas
                                                </Button>
                                            </CardFooter>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 text-center">
                                    <Building2 className="mx-auto h-10 w-10 text-default-200" />
                                    <p className="mt-3 text-lg text-default-500">
                                        No se encontraron complejos
                                    </p>
                                    <p className="text-sm text-default-400">
                                        Intenta con otro nombre
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {/* NIVEL 2: canchas del complejo seleccionado */}
                        <Button
                            variant="light"
                            size="sm"
                            startContent={<ArrowLeft className="h-4 w-4" />}
                            onPress={handleBack}
                            className="mb-4"
                        >
                            Volver a complejos
                        </Button>

                        <h1 className="text-3xl font-bold">
                            {selectedVenue?.name || "Instalaciones"}
                        </h1>
                        {selectedVenue && (
                            <p className="mt-2 flex items-center gap-1 text-default-500">
                                <MapPin className="h-4 w-4" />
                                {selectedVenue.address ? `${selectedVenue.address} — ` : ""}{selectedVenue.city}
                            </p>
                        )}

                        {/* Filtro por deporte */}
                        <div className="mt-6">
                                <Select
                                    placeholder="Filtrar por deporte"
                                    selectedKeys={[sportId || "__all__"]}
                                    onSelectionChange={(keys: any) => {
                                        const selected = Array.from(keys)[0] as string;
                                        setSportId(selected === "__all__" ? "" : (selected || ""));
                                    }}
                                    className="max-w-xs"
                                    variant="bordered"
                                >
                                    {[
                                        { id: "__all__", name: "Todos los deportes" },
                                        ...(sports || []),
                                    ].map((sport) => (
                                        <SelectItem key={sport.id}>{sport.name}</SelectItem>
                                    ))}
                                </Select>
                            </div>

                            <div className="mt-8">
                                {facilitiesLoading ? (
                                    <div className="flex justify-center py-12">
                                        <Spinner size="lg" />
                                    </div>
                                ) : facilities && facilities.length > 0 ? (
                                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {facilities.map((facility) => (
                                            <FacilityCard key={facility.id} facility={facility} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 text-center">
                                        <p className="text-lg text-default-500">
                                                    Este complejo no tiene canchas disponibles
                                                </p>
                                                <p className="text-sm text-default-400">
                                            {sportId ? "Prueba con otro deporte" : "Vuelve más tarde"}
                                        </p>
                                    </div>
                                )}
                            </div>
                    </>
                )}
            </main>
            <Footer />
        </div>
    );
}

export default function FacilitiesPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">
                    <Spinner size="lg" />
                </div>
            }
        >
            <FacilitiesContent />
        </Suspense>
    );
}
