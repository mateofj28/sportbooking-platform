import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SportsModule } from './modules/sports/sports.module';
import { VenuesModule } from './modules/venues/venues.module';
import { FacilitiesModule } from './modules/facilities/facilities.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { BlockedSlotsModule } from './modules/blocked-slots/blocked-slots.module';
import appConfig from './config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    SportsModule,
    VenuesModule,
    FacilitiesModule,
    BookingsModule,
    SchedulesModule,
    PricingModule,
    BlockedSlotsModule,
  ],
})
export class AppModule { }
