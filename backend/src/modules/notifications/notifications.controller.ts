import {
    Controller,
    Get,
    Patch,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.VENUE_ADMIN)
@ApiBearerAuth()
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get()
    @ApiOperation({ summary: 'Lista de notificaciones (scope por rol), paginada' })
    list(
        @CurrentUser() user: { id: string; role: Role; venueId?: string | null },
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.notificationsService.list(user, page ? +page : 1, limit ? +limit : 20);
    }

    @Get('unread-count')
    @ApiOperation({ summary: 'Cantidad de notificaciones no leídas del usuario' })
    unreadCount(@CurrentUser() user: { id: string; role: Role; venueId?: string | null }) {
        return this.notificationsService.unreadCount(user);
    }

    @Patch('read-all')
    @ApiOperation({ summary: 'Marcar todas las notificaciones del scope como leídas' })
    markAllRead(@CurrentUser() user: { id: string; role: Role; venueId?: string | null }) {
        return this.notificationsService.markAllRead(user);
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Marcar una notificación como leída' })
    markRead(
        @CurrentUser() user: { id: string; role: Role; venueId?: string | null },
        @Param('id') id: string,
    ) {
        return this.notificationsService.markRead(user, id);
    }
}
