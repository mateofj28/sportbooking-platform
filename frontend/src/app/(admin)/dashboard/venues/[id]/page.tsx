"use client";

import { use } from "react";
import { Card, CardBody, Chip, Spinner, Button, Link } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ArrowLeft, MapPin, Clock, Users, Trophy } from "lucide-react";
import type { Venue, Facility } from "@/types";

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

  const facilities = (allFacilities || []).filter((f) => f.venueId === id);

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
          <h2 className="text-lg font-bold">Instalaciones ({facilities.length})</h2>
          <Button as={Link} href="/dashboard/facilities" size="sm" color="primary" variant="flat">
            Gestionar instalaciones
          </Button>
        </div>

        {facilities.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.map((facility) => (
              <Card key={facility.id} className="border border-divider overflow-hidden hover:shadow-lg transition-shadow">
                {/* Colored header bar */}
                <div className="flex items-center justify-between bg-primary/5 px-4 py-2.5 border-b border-divider">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                      <Trophy className="h-3.5 w-3.5 text-primary" />
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
