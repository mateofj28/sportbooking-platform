import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role, BookingStatus } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, ManualBookingDto, CancelBookingDto, CreateRecurringBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookingsController {
    constructor(private readonly bookingsService: BookingsService) { }

    @Get()
    @ApiOperation({ summary: 'List bookings (Admin: all, Venue admin: su sede, Client: own)' })
    findAll(
        @CurrentUser() user: { id: string; role: Role; venueId?: string | null },
        @Query('status') status?: BookingStatus,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.bookingsService.findAll(user, status, page ? +page : 1, limit ? +limit : 20);
    }

    @Get('recurring')
    @ApiOperation({ summary: 'List recurring bookings (turnos fijos)' })
    findRecurring(
        @CurrentUser() user: { id: string; role: Role; venueId?: string | null },
    ) {
        return this.bookingsService.findRecurring(user);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get booking by ID' })
    findById(@Param('id') id: string) {
        return this.bookingsService.findById(id);
    }

    @Post()
    @ApiOperation({ summary: 'Create booking' })
    create(@Body() dto: CreateBookingDto, @CurrentUser('id') userId: string) {
        return this.bookingsService.create(dto, userId);
    }

    @Post('recurring')
    @ApiOperation({ summary: 'Create recurring booking (turno fijo)' })
    createRecurring(
        @Body() dto: CreateRecurringBookingDto,
        @CurrentUser() user: { id: string; role: Role; venueId?: string | null },
    ) {
        return this.bookingsService.createRecurring(user, dto);
    }

    @Post('manual')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN, Role.VENUE_ADMIN)
    @ApiOperation({ summary: 'Create manual booking (Admin / Venue admin)' })
    createManual(
        @Body() dto: ManualBookingDto,
        @CurrentUser() actor: { id: string; role: Role; venueId?: string | null },
    ) {
        return this.bookingsService.createManual(dto, actor);
    }

    @Patch('recurring/:id/cancel')
    @ApiOperation({ summary: 'Cancel entire recurring booking series (turno fijo)' })
    cancelRecurring(
        @Param('id') id: string,
        @CurrentUser() user: { id: string; role: Role; venueId?: string | null },
        @Body() dto: CancelBookingDto,
    ) {
        return this.bookingsService.cancelRecurring(id, user, dto.reason);
    }

    @Patch(':id/cancel')
    @ApiOperation({ summary: 'Cancel booking' })
    cancel(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() dto: CancelBookingDto,
    ) {
        return this.bookingsService.cancel(id, userId, dto);
    }
}
