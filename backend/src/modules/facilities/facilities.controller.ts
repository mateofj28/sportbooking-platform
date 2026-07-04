import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto, UpdateFacilityDto } from './dto/create-facility.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Facilities')
@Controller('facilities')
export class FacilitiesController {
    constructor(private readonly facilitiesService: FacilitiesService) { }

    @Get()
    @ApiOperation({ summary: 'List facilities with filters' })
    findAll(
        @Query('sportId') sportId?: string,
        @Query('venueId') venueId?: string,
        @Query('isIndoor') isIndoor?: string,
        @Query('search') search?: string,
    ) {
        return this.facilitiesService.findAll({
            sportId,
            venueId,
            isIndoor: isIndoor ? isIndoor === 'true' : undefined,
            search,
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get facility detail' })
    findById(@Param('id') id: string) {
        return this.facilitiesService.findById(id);
    }

    @Get(':id/availability')
    @ApiOperation({ summary: 'Get facility availability for a date' })
    getAvailability(
        @Param('id') id: string,
        @Query('date') date: string,
    ) {
        return this.facilitiesService.getAvailability(id, date);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create facility (Admin)' })
    create(@Body() dto: CreateFacilityDto) {
        return this.facilitiesService.create(dto);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update facility (Admin)' })
    update(@Param('id') id: string, @Body() dto: UpdateFacilityDto) {
        return this.facilitiesService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate facility (Admin)' })
    deactivate(@Param('id') id: string) {
        return this.facilitiesService.deactivate(id);
    }
}
