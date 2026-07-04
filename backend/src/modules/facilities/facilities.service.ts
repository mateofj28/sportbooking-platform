import { Injectable, NotFoundException } from '@nestjs/common';
import { FacilitiesRepository } from './facilities.repository';
import { CreateFacilityDto, UpdateFacilityDto } from './dto/create-facility.dto';

@Injectable()
export class FacilitiesService {
    constructor(private readonly facilitiesRepository: FacilitiesRepository) { }

    async findAll(filters: {
        sportId?: string;
        venueId?: string;
        isIndoor?: boolean;
        search?: string;
    }) {
        return this.facilitiesRepository.findAll(filters);
    }

    async findById(id: string) {
        const facility = await this.facilitiesRepository.findById(id);
        if (!facility) {
            throw new NotFoundException('Facility not found');
        }
        return facility;
    }

    async create(dto: CreateFacilityDto) {
        return this.facilitiesRepository.create(dto);
    }

    async update(id: string, dto: UpdateFacilityDto) {
        await this.findById(id);
        return this.facilitiesRepository.update(id, dto);
    }

    async deactivate(id: string) {
        await this.findById(id);
        return this.facilitiesRepository.deactivate(id);
    }
}
