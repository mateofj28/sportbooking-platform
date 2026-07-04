import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BlockedSlotsService } from './blocked-slots.service';
import { CreateBlockedSlotDto } from './dto/create-blocked-slot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Blocked Slots')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class BlockedSlotsController {
  constructor(private readonly blockedSlotsService: BlockedSlotsService) {}

  @Get('facilities/:facilityId/blocked-slots')
  @ApiOperation({ summary: 'Get blocked slots for facility' })
  findByFacility(@Param('facilityId') facilityId: string) {
    return this.blockedSlotsService.findByFacility(facilityId);
  }

  @Post('facilities/:facilityId/blocked-slots')
  @ApiOperation({ summary: 'Create blocked slot (Admin)' })
  create(
    @Param('facilityId') facilityId: string,
    @Body() dto: CreateBlockedSlotDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.blockedSlotsService.create(facilityId, dto, userId);
  }

  @Delete('blocked-slots/:id')
  @ApiOperation({ summary: 'Delete blocked slot (Admin)' })
  remove(@Param('id') id: string) {
    return this.blockedSlotsService.remove(id);
  }
}
