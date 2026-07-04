import { Injectable, NotFoundException } from '@nestjs/common';
import { SportsRepository } from './sports.repository';
import { CreateSportDto, UpdateSportDto } from './dto/create-sport.dto';

@Injectable()
export class SportsService {
    constructor(private readonly sportsRepository: SportsRepository) { }

    async findAll() {
        return this.sportsRepository.findAll();
    }

    async findById(id: string) {
        const sport = await this.sportsRepository.findById(id);
        if (!sport) {
            throw new NotFoundException('Sport not found');
        }
        return sport;
    }

    async create(dto: CreateSportDto) {
        return this.sportsRepository.create(dto);
    }

    async update(id: string, dto: UpdateSportDto) {
        await this.findById(id);
        return this.sportsRepository.update(id, dto);
    }

    async deactivate(id: string) {
        await this.findById(id);
        return this.sportsRepository.deactivate(id);
    }
}
