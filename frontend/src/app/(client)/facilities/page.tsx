"use client";

import { Suspense, useState } from "react";
import { Input, Spinner } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useFacilities } from "@/hooks/use-facilities";
import { useDebounce } from "@/hooks/use-debounce";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { FacilityCard } from "@/components/cards/facility-card";
import { Search } from "lucide-react";
import type { Sport, Venue } from "@/types";

function FacilitiesContent() {
    const searchParams = useSearchParams();
    const [search, setSearch] = useState(() => searchParams.get("search") || "");
    const [sportId, setSportId] = useState(() => searchParams.get("sportId") || "");
    const [venueId, setVenueId] = useState(() => searchParams.get("venueId") || "");
    const debouncedSearch = useDebounce(search, 400);

    const { data: sports } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });

    const { data: venues } = useQuery({
        queryKey: ["venues"],
        queryFn: () => apiClient.get<Venue[]>("/venues"),
    });

    const { data: facilities, isLoading } = useFacilities({
        search: debouncedSearch || undefined,
        sportId: sportId || undefined,
        venueId: venueId || undefined,
        bookableOnly: "true",
    });

    return (
        <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
                <h1 className="text-3xl font-bold">Instalaciones Deportivas</h1>
                <p className="mt-2 text-default-500">
                    Encuentra y reserva la cancha perfecta para tu deporte
                </p>

                {/* Filters */}
                <div className="mt-6 flex flex-col gap-4 sm:flex-row">
                    <Input
                        placeholder="Buscar instalación..."
                        value={search}
                        onValueChange={setSearch}
                        startContent={<Search className="h-4 w-4 text-default-400" />}
                        className="max-w-xs"
                        variant="bordered"
                    />
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
                    <Select
                        placeholder="Filtrar por sede"
                        selectedKeys={[venueId || "__all__"]}
                        onSelectionChange={(keys: any) => {
                            const selected = Array.from(keys)[0] as string;
                            setVenueId(selected === "__all__" ? "" : (selected || ""));
                        }}
                        className="max-w-xs"
                        variant="bordered"
                    >
                        {[
                            { id: "__all__", name: "Todos los complejos" },
                            ...(venues || []),
                        ].map((v) => (
                            <SelectItem key={v.id}>{v.name}</SelectItem>
                        ))}
                    </Select>
                </div>

                {/* Facility List */}
                <div className="mt-8">
                    {isLoading ? (
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
                                No se encontraron instalaciones
                            </p>
                            <p className="text-sm text-default-400">
                                Intenta con otros filtros
                            </p>
                        </div>
                    )}
                </div>
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
