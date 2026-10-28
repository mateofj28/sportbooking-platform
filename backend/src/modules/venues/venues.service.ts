import { Injectable, NotFoundException } from '@nestjs/common';
import { VenuesRepository } from './venues.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateVenueDto, UpdateVenueDto } from './dto/create-venue.dto';

@Injectable()
export class VenuesService {
    constructor(
        private readonly venuesRepository: VenuesRepository,
        private readonly notificationsService: NotificationsService,
    ) { }

    async findAll() {
        return this.venuesRepository.findAll();
    }

    async findById(id: string) {
        const venue = await this.venuesRepository.findById(id);
        if (!venue) {
            throw new NotFoundException('Sede no encontrada');
        }
        return venue;
    }

    async create(dto: CreateVenueDto) {
        const venue = await this.venuesRepository.create(dto);
        void this.notificationsService.notifyVenueOrFacilityCreated({
            label: `Se dio de alta el complejo "${(venue as any)?.name ?? dto.name}".`,
        });
        return venue;
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
