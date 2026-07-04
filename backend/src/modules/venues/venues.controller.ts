import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { VenuesService } from './venues.service';
import { CreateVenueDto, UpdateVenueDto } from './dto/create-venue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Venues')
@Controller('venues')
export class VenuesController {
    constructor(private readonly venuesService: VenuesService) { }

    @Get()
    @ApiOperation({ summary: 'List all venues' })
    findAll() {
        return this.venuesService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get venue by ID' })
    findById(@Param('id') id: string) {
        return this.venuesService.findById(id);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create venue (Admin)' })
    create(@Body() dto: CreateVenueDto) {
        return this.venuesService.create(dto);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update venue (Admin)' })
    update(@Param('id') id: string, @Body() dto: UpdateVenueDto) {
        return this.venuesService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate venue (Admin)' })
    deactivate(@Param('id') id: string) {
        return this.venuesService.deactivate(id);
    }
}
