import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsRepository } from './bookings.repository';

@Module({
    controllers: [BookingsController],
    providers: [BookingsService, BookingsRepository],
    exports: [BookingsService],
})
export class BookingsModule { }
