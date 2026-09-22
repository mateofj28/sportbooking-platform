import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsRepository } from './bookings.repository';
import { BookingsCronService } from './bookings-cron.service';

@Module({
    controllers: [BookingsController],
    providers: [BookingsService, BookingsRepository, BookingsCronService],
    exports: [BookingsService],
})
export class BookingsModule { }
