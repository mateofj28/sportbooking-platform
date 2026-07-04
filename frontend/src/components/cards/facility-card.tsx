"use client";

import { Card, CardBody, CardFooter, Chip, Button, Link } from "@heroui/react";
import { MapPin, Users, Clock } from "lucide-react";
import type { Facility } from "@/types";

interface FacilityCardProps {
    facility: Facility;
}

export function FacilityCard({ facility }: FacilityCardProps) {
    return (
        <Card className="w-full" isPressable as={Link} href={`/facilities/${facility.id}`}>
            <CardBody className="p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold">{facility.name}</h3>
                        <div className="mt-1 flex items-center gap-1 text-sm text-default-500">
                            <MapPin className="h-3 w-3" />
                            <span>
                                {facility.venue.name} - {facility.venue.city}
                            </span>
                        </div>
                    </div>
                    <Chip color="primary" variant="flat" size="sm">
                        {facility.sport.name}
                    </Chip>
                </div>

                {facility.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-default-500">
                        {facility.description}
                    </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
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
                        <Chip
                            size="sm"
                            variant="bordered"
                            startContent={<Users className="h-3 w-3" />}
                        >
                            {facility.capacity}
                        </Chip>
                    )}
                    <Chip
                        size="sm"
                        variant="bordered"
                        startContent={<Clock className="h-3 w-3" />}
                    >
                        {facility.minBookingDuration}-{facility.maxBookingDuration} min
                    </Chip>
                </div>
            </CardBody>
            <CardFooter className="justify-end border-t border-divider px-4 py-3">
                <Button size="sm" color="primary" variant="flat">
                    Ver disponibilidad
                </Button>
            </CardFooter>
        </Card>
    );
}
