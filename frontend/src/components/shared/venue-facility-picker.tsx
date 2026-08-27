"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";
import { useMemo, useState } from "react";
import type { Facility, Venue } from "@/types";

interface VenueFacilityPickerProps {
  selectedFacilityId: string;
  onFacilityChange: (facilityId: string) => void;
  className?: string;
}

export function VenueFacilityPicker({ selectedFacilityId, onFacilityChange, className }: VenueFacilityPickerProps) {
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => apiClient.get<Venue[]>("/venues"),
  });

  const { data: facilities } = useQuery({
    queryKey: ["facilities"],
    queryFn: () => apiClient.get<Facility[]>("/facilities"),
  });

  // Filter facilities by selected venue
  const filteredFacilities = useMemo(() => {
    if (!facilities) return [];
    if (!selectedVenueId) return facilities;
    return facilities.filter((f) => f.venue.id === selectedVenueId);
  }, [facilities, selectedVenueId]);

  // When venue changes, reset facility if it doesn't belong to the new venue
  const handleVenueChange = (venueId: string | null) => {
    const newVenueId = venueId || "";
    setSelectedVenueId(newVenueId);

    // Clear facility selection if current doesn't belong to new venue
    if (selectedFacilityId && newVenueId) {
      const current = facilities?.find((f) => f.id === selectedFacilityId);
      if (current && current.venue.id !== newVenueId) {
        onFacilityChange("");
      }
    }
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className || ""}`}>
      <Autocomplete
        label="Sede"
        placeholder="Buscar sede..."
        variant="bordered"
        defaultItems={venues || []}
        selectedKey={selectedVenueId || null}
        onSelectionChange={(key) => handleVenueChange(key as string | null)}
        allowsCustomValue={false}
      >
        {(venue) => (
          <AutocompleteItem key={venue.id} textValue={`${venue.name} — ${venue.city}`}>
            <div>
              <p className="text-sm font-medium">{venue.name}</p>
              <p className="text-xs text-default-400">{venue.city}</p>
            </div>
          </AutocompleteItem>
        )}
      </Autocomplete>

      <Autocomplete
        label="Instalación"
        placeholder="Buscar instalación..."
        variant="bordered"
        defaultItems={filteredFacilities}
        selectedKey={selectedFacilityId || null}
        onSelectionChange={(key) => onFacilityChange((key as string) || "")}
        allowsCustomValue={false}
        isDisabled={!!(selectedVenueId && filteredFacilities.length === 0)}
      >
        {(facility) => (
          <AutocompleteItem key={facility.id} textValue={`${facility.name} — ${facility.sport.name}`}>
            <div>
              <p className="text-sm font-medium">{facility.name}</p>
              <p className="text-xs text-default-400">{facility.sport.name} • {facility.venue.name}</p>
            </div>
          </AutocompleteItem>
        )}
      </Autocomplete>
    </div>
  );
}
