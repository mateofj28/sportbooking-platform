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
import { SportsService } from './sports.service';
import { CreateSportDto, UpdateSportDto } from './dto/create-sport.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Sports')
@Controller('sports')
export class SportsController {
    constructor(private readonly sportsService: SportsService) { }

    @Get()
    @ApiOperation({ summary: 'List all sports' })
    findAll() {
        return this.sportsService.findAll();
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create sport (Admin)' })
    create(@Body() dto: CreateSportDto) {
        return this.sportsService.create(dto);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update sport (Admin)' })
    update(@Param('id') id: string, @Body() dto: UpdateSportDto) {
        return this.sportsService.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate sport (Admin)' })
    deactivate(@Param('id') id: string) {
        return this.sportsService.deactivate(id);
    }
}
