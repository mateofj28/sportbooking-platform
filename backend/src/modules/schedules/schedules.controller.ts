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
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/create-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Schedules')
@Controller()
export class SchedulesController {
    constructor(private readonly schedulesService: SchedulesService) { }

    @Get('facilities/:facilityId/schedules')
    @ApiOperation({ summary: 'Get schedules for facility' })
    findByFacility(@Param('facilityId') facilityId: string) {
        return this.schedulesService.findByFacility(facilityId);
    }

    @Post('facilities/:facilityId/schedules')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create schedule (Admin)' })
    create(
        @Param('facilityId') facilityId: string,
        @Body() dto: CreateScheduleDto,
    ) {
        return this.schedulesService.create(facilityId, dto);
    }

    @Patch('schedules/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update schedule (Admin)' })
    update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
        return this.schedulesService.update(id, dto);
    }

    @Delete('schedules/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete schedule (Admin)' })
    remove(@Param('id') id: string) {
        return this.schedulesService.remove(id);
    }
}
