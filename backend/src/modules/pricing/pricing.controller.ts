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
import { PricingService } from './pricing.service';
import { CreatePricingDto, UpdatePricingDto } from './dto/create-pricing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Pricing')
@Controller()
export class PricingController {
    constructor(private readonly pricingService: PricingService) { }

    @Get('facilities/:facilityId/pricing')
    @ApiOperation({ summary: 'Get pricing for facility' })
    findByFacility(@Param('facilityId') facilityId: string) {
        return this.pricingService.findByFacility(facilityId);
    }

    @Post('facilities/:facilityId/pricing')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create pricing (Admin)' })
    create(
        @Param('facilityId') facilityId: string,
        @Body() dto: CreatePricingDto,
    ) {
        return this.pricingService.create(facilityId, dto);
    }

    @Patch('pricing/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update pricing (Admin)' })
    update(@Param('id') id: string, @Body() dto: UpdatePricingDto) {
        return this.pricingService.update(id, dto);
    }

    @Delete('pricing/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete pricing (Admin)' })
    remove(@Param('id') id: string) {
        return this.pricingService.remove(id);
    }
}
