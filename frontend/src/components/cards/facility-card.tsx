"use client";

import { Card, CardBody, CardFooter, Chip, Button, Link } from "@heroui/react";
import { MapPin, Users, Clock, DollarSign } from "lucide-react";
import type { Facility } from "@/types";

interface FacilityCardProps {
    facility: Facility;
}

export function FacilityCard({ facility }: FacilityCardProps) {
    // Get lowest price to show "desde $X"
    const lowestPrice = facility.pricing && facility.pricing.length > 0
        ? Math.min(...facility.pricing.map((p) => Number(p.pricePerHour)))
        : null;

    return (
      <Card
          className="w-full overflow-hidden"
          isPressable
          as={Link}
          href={`/facilities/${facility.id}`}
      >
          {/* Image */}
          {facility.imageUrl ? (
              <div className="relative h-40 w-full overflow-hidden">
                  <img
                      src={facility.imageUrl}
                      alt={facility.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute top-2 right-2">
                      <Chip color="primary" variant="solid" size="sm" className="shadow">
                          {facility.sport.name}
                      </Chip>
                  </div>
              </div>
          ) : (
              <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary-50 to-secondary-50">
                  <span className="text-4xl">🏟️</span>
                  <div className="absolute top-2 right-2">
                          <Chip color="primary" variant="flat" size="sm">
                              {facility.sport.name}
                          </Chip>
                      </div>
              </div>
          )}

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
                  {lowestPrice !== null && (
                      <div className="flex-shrink-0 text-right">
                          <p className="text-xs text-default-400">desde</p>
                          <p className="text-sm font-bold text-success">${lowestPrice}/hr</p>
                      </div>
                  )}
              </div>

              {facility.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-default-500">
                      {facility.description}
                  </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                  {facility.surfaceType && (
                      <Chip size="sm" variant="bordered">
                          {facility.surfaceType}
                      </Chip>
                  )}
                  {facility.isIndoor && (
                      <Chip size="sm" variant="bordered" color="secondary">
                          Indoor
                      </Chip>
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
