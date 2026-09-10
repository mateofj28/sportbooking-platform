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
import { ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto, UpdateFacilityDto } from './dto/create-facility.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface AuthUser {
    id: string;
    role: Role;
    venueId?: string | null;
}

@ApiTags('Facilities')
@Controller('facilities')
export class FacilitiesController {
    constructor(private readonly facilitiesService: FacilitiesService) { }

    @Get()
    @UseGuards(OptionalJwtAuthGuard)
    @ApiOperation({ summary: 'List facilities with filters' })
    findAll(
        @CurrentUser() user: AuthUser | undefined,
        @Query('sportId') sportId?: string,
        @Query('venueId') venueId?: string,
        @Query('isIndoor') isIndoor?: string,
        @Query('search') search?: string,
        @Query('includeInactive') includeInactive?: string,
        @Query('bookableOnly') bookableOnly?: string,
    ) {
        // El admin de sede solo puede listar instalaciones de su propia sede.
        // Se fuerza el filtro por venueId ignorando cualquier valor recibido.
        const effectiveVenueId =
            user?.role === Role.VENUE_ADMIN && user.venueId
                ? user.venueId
                : venueId;

        return this.facilitiesService.findAll({
            sportId,
            venueId: effectiveVenueId,
            isIndoor: isIndoor ? isIndoor === 'true' : undefined,
            search,
            includeInactive: includeInactive === 'true',
            bookableOnly: bookableOnly === 'true',
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
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateFacilityDto) {
        // El admin de sede solo puede crear instalaciones en su propia sede.
        if (user.role === Role.VENUE_ADMIN) {
            if (!user.venueId) {
                throw new ForbiddenException('No tienes una sede asignada');
            }
            if (dto.venueId !== user.venueId) {
                throw new ForbiddenException(
                    'Solo puedes crear instalaciones en tu propia sede',
                );
            }
        }
        return this.facilitiesService.create(dto);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update facility (Admin)' })
    async update(
        @CurrentUser() user: AuthUser,
        @Param('id') id: string,
        @Body() dto: UpdateFacilityDto,
    ) {
        await this.assertVenueAccess(user, id);
        // Nota: UpdateFacilityDto no permite cambiar la sede, por lo que un
        // admin de sede no puede mover una instalación a otra sede.
        return this.facilitiesService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate facility (Admin)' })
    async deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
        await this.assertVenueAccess(user, id);
        return this.facilitiesService.deactivate(id);
    }

    /**
     * Verifica que un admin de sede solo opere sobre instalaciones de su sede.
     * El admin general (ADMIN) no tiene restricción.
     */
    private async assertVenueAccess(user: AuthUser, facilityId: string) {
        if (user.role !== Role.VENUE_ADMIN) return;
        if (!user.venueId) {
            throw new ForbiddenException('No tienes una sede asignada');
        }
        const facility = await this.facilitiesService.findById(facilityId);
        if (facility.venueId !== user.venueId) {
            throw new ForbiddenException(
                'Solo puedes gestionar instalaciones de tu propia sede',
            );
        }
    }
}
