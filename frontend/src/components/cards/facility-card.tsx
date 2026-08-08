"use client";

import { Card, CardBody, CardFooter, Chip, Button, Link } from "@heroui/react";
import { MapPin, Users, Clock } from "lucide-react";
import type { Facility } from "@/types";

const SPORT_IMAGES: Record<string, string> = {
    futbol: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=600&h=300&fit=crop",
    tenis: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=600&h=300&fit=crop",
    padel: "https://images.unsplash.com/photo-1612534847738-b3af3b9545f4?w=600&h=300&fit=crop",
    basquetbol: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&h=300&fit=crop",
    voleibol: "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=600&h=300&fit=crop",
};

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1461896836934-bd900bb65104?w=600&h=300&fit=crop";

function getSportImage(sportSlug: string): string {
    const key = sportSlug.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return SPORT_IMAGES[key] || DEFAULT_IMAGE;
}

interface FacilityCardProps {
    facility: Facility;
}

export function FacilityCard({ facility }: FacilityCardProps) {
    const lowestPrice = facility.pricing && facility.pricing.length > 0
        ? Math.min(...facility.pricing.map((p) => Number(p.pricePerHour)))
        : null;

    const imageUrl = facility.imageUrl || getSportImage(facility.sport.slug || facility.sport.name);

    return (
      <Card className="w-full overflow-hidden" isPressable as={Link} href={`/facilities/${facility.id}`}>
          {/* Image */}
          <div className="relative h-40 w-full overflow-hidden">
              <img
                  src={imageUrl}
                  alt={facility.name}
                  className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute top-2 right-2">
                  <Chip color="primary" variant="solid" size="sm" className="shadow-md">
                      {facility.sport.name}
                  </Chip>
              </div>
              {lowestPrice !== null && (
                  <div className="absolute bottom-2 left-2">
                      <span className="rounded-md bg-black/60 px-2 py-1 text-xs font-bold text-white">
                          Desde ${lowestPrice}/hr
                      </span>
                  </div>
              )}
          </div>

          <CardBody className="p-4">
              <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                      <h3 className="truncate text-base font-semibold">{facility.name}</h3>
                      <div className="mt-1 flex items-center gap-1 text-xs text-default-500">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                              {facility.venue.name} — {facility.venue.city}
                          </span>
                      </div>
                  </div>
              </div>

              {facility.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-default-500">
                      {facility.description}
                  </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
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
                      {facility.minBookingDuration}-{facility.maxBookingDuration} min
                  </Chip>
              </div>
          </CardBody>

          <CardFooter className="justify-between border-t border-divider px-4 py-2.5">
              <span className="text-xs text-default-400">{facility.venue.city}</span>
              <Button size="sm" color="primary" variant="flat">
                  Ver disponibilidad
              </Button>
          </CardFooter>
      </Card>
  );
}
