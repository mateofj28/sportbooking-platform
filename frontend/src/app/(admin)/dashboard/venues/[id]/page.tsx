"use client";

import { use, useState, useMemo } from "react";
import { Card, CardBody, Chip, Spinner, Button, Link, Input } from "@heroui/react";
import { Select, SelectItem } from "@heroui/select";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ArrowLeft, MapPin, Search, Trophy } from "lucide-react";
import type { Venue, Facility } from "@/types";

/** Devuelve el emoji correspondiente al deporte (por nombre normalizado) */
function getSportEmoji(sportName?: string): string {
  const key = (sportName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const map: Record<string, string> = {
    futbol: "⚽",
    "futbol sala": "⚽",
    futsal: "⚽",
    tenis: "🎾",
    "tenis de mesa": "🏓",
    "ping pong": "🏓",
    pingpong: "🏓",
    padel: "🎾",
    padle: "🎾",
    basquetbol: "🏀",
    baloncesto: "🏀",
    voleibol: "🏐",
    volleyball: "🏐",
    voley: "🏐",
    yoga: "🧘",
    natacion: "🏊",
    boxeo: "🥊",
    golf: "⛳",
    rugby: "🏉",
    beisbol: "⚾",
    hockey: "🏒",
    ciclismo: "🚴",
    running: "🏃",
    gimnasio: "🏋️",
    crossfit: "🏋️",
  };
  return map[key] || "🏆";
}

export default function VenueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: venue, isLoading: loadingVenue } = useQuery({
    queryKey: ["venue", id],
    queryFn: () => apiClient.get<Venue>(`/venues/${id}`),
  });

  const { data: allFacilities, isLoading: loadingFacilities } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => apiClient.get<Facility[]>("/facilities"),
  });

  const venueFacilities = useMemo(
    () => (allFacilities || []).filter((f) => f.venueId === id),
    [allFacilities, id]
  );

  // Filters
  const [search, setSearch] = useState("");
  const [filterSport, setFilterSport] = useState("");
  const [filterSurface, setFilterSurface] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  // Unique sports and surfaces from this venue's facilities
  const sportOptions = useMemo(() => {
    const map = new Map<string, string>();
    venueFacilities.forEach((f) => map.set(f.sport.id, f.sport.name));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [venueFacilities]);

  const surfaceOptions = useMemo(() => {
    const set = new Set(venueFacilities.map((f) => f.surfaceType).filter(Boolean));
    return Array.from(set) as string[];
  }, [venueFacilities]);

  const facilities = useMemo(() => {
    return venueFacilities.filter((f) => {
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterSport && f.sport.id !== filterSport) return false;
      if (filterSurface && f.surfaceType?.toLowerCase() !== filterSurface.toLowerCase()) return false;
      if (filterLocation === "indoor" && !f.isIndoor) return false;
      if (filterLocation === "exterior" && f.isIndoor) return false;
      return true;
    });
  }, [venueFacilities, search, filterSport, filterSurface, filterLocation]);

  const hasActiveFilters = !!(search || filterSport || filterSurface || filterLocation);

  if (loadingVenue || loadingFacilities) {
    return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;
  }

  if (!venue) {
    return <div className="py-12 text-center text-default-500">Sede no encontrada</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Button as={Link} href="/dashboard/venues" variant="light" size="sm" startContent={<ArrowLeft className="h-4 w-4" />} className="mb-3">
          Volver a Sedes
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{venue.name}</h1>
            <p className="text-sm text-default-500 flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5" />
              {venue.address}, {venue.city}, {venue.country}
            </p>
            {venue.description && (
              <p className="text-sm text-default-500 mt-2">{venue.description}</p>
            )}
          </div>
          <Chip color={venue.isActive ? "success" : "danger"} variant="flat">
            {venue.isActive ? "Activa" : "Inactiva"}
          </Chip>
        </div>
      </div>

      {/* Installations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            Instalaciones ({hasActiveFilters ? `${facilities.length} de ${venueFacilities.length}` : venueFacilities.length})
          </h2>
          <Button as={Link} href="/dashboard/facilities" size="sm" color="primary" variant="flat">
            Gestionar instalaciones
          </Button>
        </div>

        {/* Filters */}
        {venueFacilities.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Input
              placeholder="Buscar por nombre..."
              variant="bordered"
              size="sm"
              value={search}
              onValueChange={setSearch}
              startContent={<Search className="h-4 w-4 text-default-400" />}
              isClearable
              onClear={() => setSearch("")}
            />
            <Select
              placeholder="Deporte"
              variant="bordered"
              size="sm"
              selectedKeys={filterSport ? [filterSport] : []}
              onSelectionChange={(keys: any) => setFilterSport(Array.from(keys)[0] as string || "")}
            >
              {sportOptions.map((s) => (
                <SelectItem key={s.id}>{s.name}</SelectItem>
              ))}
            </Select>
            <Select
              placeholder="Superficie"
              variant="bordered"
              size="sm"
              selectedKeys={filterSurface ? [filterSurface] : []}
              onSelectionChange={(keys: any) => setFilterSurface(Array.from(keys)[0] as string || "")}
            >
              {surfaceOptions.map((s) => (
                <SelectItem key={s}>{s}</SelectItem>
              ))}
            </Select>
            <Select
              placeholder="Ubicación"
              variant="bordered"
              size="sm"
              selectedKeys={filterLocation ? [filterLocation] : []}
              onSelectionChange={(keys: any) => setFilterLocation(Array.from(keys)[0] as string || "")}
            >
              <SelectItem key="indoor">Indoor</SelectItem>
              <SelectItem key="exterior">Exterior</SelectItem>
            </Select>
          </div>
        )}

        {hasActiveFilters && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-default-500">{facilities.length} resultado{facilities.length !== 1 ? "s" : ""}</span>
            <Button size="sm" variant="light" color="danger" onPress={() => { setSearch(""); setFilterSport(""); setFilterSurface(""); setFilterLocation(""); }}>
              Limpiar filtros
            </Button>
          </div>
        )}

        {facilities.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.map((facility) => (
              <Card key={facility.id} className="border border-divider overflow-hidden hover:shadow-lg transition-shadow">
                {/* Colored header bar */}
                <div className="flex items-center justify-between bg-primary/5 px-4 py-2.5 border-b border-divider">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-base leading-none">
                      <span aria-hidden>{getSportEmoji(facility.sport.name)}</span>
                    </div>
                    <span className="text-xs font-semibold text-primary">{facility.sport.name}</span>
                  </div>
                  <Chip size="sm" color={facility.isActive ? "success" : "danger"} variant="dot" className="text-[10px]">
                    {facility.isActive ? "Activa" : "Inactiva"}
                  </Chip>
                </div>

                <CardBody className="p-4 gap-3">
                  {/* Name + description */}
                  <div>
                    <h3 className="font-bold text-base">{facility.name}</h3>
                    {facility.description && (
                      <p className="text-xs text-default-500 mt-1 line-clamp-2">{facility.description}</p>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 py-2">
                    <div className="text-center rounded-lg bg-default-50 py-2">
                      <p className="text-xs text-default-400">Superficie</p>
                      <p className="text-[11px] font-semibold mt-0.5">{facility.surfaceType || "—"}</p>
                    </div>
                    <div className="text-center rounded-lg bg-default-50 py-2">
                      <p className="text-xs text-default-400">Capacidad</p>
                      <p className="text-[11px] font-semibold mt-0.5">{facility.capacity ? `${facility.capacity} jug.` : "—"}</p>
                    </div>
                    <div className="text-center rounded-lg bg-default-50 py-2">
                      <p className="text-xs text-default-400">Duración</p>
                      <p className="text-[11px] font-semibold mt-0.5">{facility.minBookingDuration} min</p>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {facility.isIndoor && (
                      <Chip size="sm" variant="flat" color="secondary" className="text-[10px]">🏠 Indoor</Chip>
                    )}
                    {!facility.isIndoor && (
                      <Chip size="sm" variant="flat" color="warning" className="text-[10px]">☀️ Exterior</Chip>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : hasActiveFilters ? (
          <Card className="border border-divider">
            <CardBody className="flex flex-col items-center py-10">
              <Trophy className="h-10 w-10 text-default-200" />
              <p className="mt-3 text-sm text-default-500">No hay instalaciones que coincidan con los filtros</p>
            </CardBody>
          </Card>
        ) : (
          <Card className="border border-divider">
            <CardBody className="flex flex-col items-center py-10">
              <Trophy className="h-10 w-10 text-default-200" />
              <p className="mt-3 text-sm text-default-500">Esta sede no tiene instalaciones aún</p>
              <Button as={Link} href="/dashboard/facilities" size="sm" color="primary" variant="flat" className="mt-3">
                Crear instalación
              </Button>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
