import { Module } from '@nestjs/common';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { VenuesRepository } from './venues.repository';

@Module({
    controllers: [VenuesController],
    providers: [VenuesService, VenuesRepository],
    exports: [VenuesService],
})
export class VenuesModule { }
