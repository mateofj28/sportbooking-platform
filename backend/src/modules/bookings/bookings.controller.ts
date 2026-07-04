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
import { CreateBookingDto, ManualBookingDto, CancelBookingDto } from './dto/create-booking.dto';
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
    @ApiOperation({ summary: 'List bookings (Admin: all, Client: own)' })
    findAll(
        @CurrentUser() user: { id: string; role: Role },
        @Query('status') status?: BookingStatus,
    ) {
        const isAdmin = user.role === Role.ADMIN;
        return this.bookingsService.findAll(user.id, isAdmin, status);
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

    @Post('manual')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Create manual booking (Admin)' })
    createManual(@Body() dto: ManualBookingDto, @CurrentUser('id') adminId: string) {
        return this.bookingsService.createManual(dto, adminId);
    }

    @Patch(':id/confirm')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Confirm booking (Admin)' })
    confirm(@Param('id') id: string) {
        return this.bookingsService.confirm(id);
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
