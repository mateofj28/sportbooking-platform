"use client";

import { useState } from "react";
import { Input, Spinner } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useFacilities } from "@/hooks/use-facilities";
import { useDebounce } from "@/hooks/use-debounce";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { FacilityCard } from "@/components/cards/facility-card";
import { Search } from "lucide-react";
import type { Sport } from "@/types";

export default function FacilitiesPage() {
    const [search, setSearch] = useState("");
    const [sportId, setSportId] = useState("");
    const debouncedSearch = useDebounce(search, 400);

    const { data: sports } = useQuery({
        queryKey: ["sports"],
        queryFn: () => apiClient.get<Sport[]>("/sports"),
    });

    const { data: facilities, isLoading } = useFacilities({
        search: debouncedSearch || undefined,
        sportId: sportId || undefined,
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
                        selectedKeys={sportId ? [sportId] : []}
                        onSelectionChange={(keys: any) => {
                            const selected = Array.from(keys)[0] as string;
                            setSportId(selected || "");
                        }}
                        className="max-w-xs"
                        variant="bordered"
                    >
                        {(sports || []).map((sport) => (
                            <SelectItem key={sport.id}>{sport.name}</SelectItem>
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
