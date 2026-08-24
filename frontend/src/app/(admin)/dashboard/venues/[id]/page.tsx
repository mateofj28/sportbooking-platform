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
              <Card key={facility.id} className="border border-divider">
                <CardBody className="p-4 gap-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-sm">{facility.name}</h3>
                    <Chip size="sm" color="primary" variant="flat">{facility.sport.name}</Chip>
                  </div>

                  {facility.description && (
                    <p className="text-xs text-default-500 line-clamp-2">{facility.description}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {facility.surfaceType && (
                      <Chip size="sm" variant="bordered">{facility.surfaceType}</Chip>
                    )}
                    {facility.isIndoor && (
                      <Chip size="sm" variant="bordered" color="secondary">Indoor</Chip>
                    )}
                    {facility.capacity && (
                      <Chip size="sm" variant="bordered" startContent={<Users className="h-3 w-3" />}>
                        {facility.capacity}
                      </Chip>
                    )}
                    <Chip size="sm" variant="bordered" startContent={<Clock className="h-3 w-3" />}>
                      {facility.minBookingDuration} min
                    </Chip>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-divider mt-1">
                    <Chip size="sm" color={facility.isActive ? "success" : "danger"} variant="dot">
                      {facility.isActive ? "Activa" : "Inactiva"}
                    </Chip>
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
