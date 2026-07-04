import { Injectable, NotFoundException } from '@nestjs/common';
import { VenuesRepository } from './venues.repository';
import { CreateVenueDto, UpdateVenueDto } from './dto/create-venue.dto';

@Injectable()
export class VenuesService {
    constructor(private readonly venuesRepository: VenuesRepository) { }

    async findAll() {
        return this.venuesRepository.findAll();
    }

    async findById(id: string) {
        const venue = await this.venuesRepository.findById(id);
        if (!venue) {
            throw new NotFoundException('Venue not found');
        }
        return venue;
    }

    async create(dto: CreateVenueDto) {
        return this.venuesRepository.create(dto);
    }

    async update(id: string, dto: UpdateVenueDto) {
        await this.findById(id);
        return this.venuesRepository.update(id, dto);
    }

    async deactivate(id: string) {
        await this.findById(id);
        return this.venuesRepository.deactivate(id);
    }
}
