import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateUserDto, AdminUpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'List all users (Admin)' })
    findAll(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
    ) {
        return this.usersService.findAll({
            page: page ? +page : 1,
            limit: limit ? +limit : 10,
            search,
        });
    }

    @Get(':id')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Get user by ID (Admin)' })
    findById(@Param('id') id: string) {
        return this.usersService.findById(id);
    }

    @Patch('profile')
    @ApiOperation({ summary: 'Update own profile' })
    updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
        return this.usersService.updateProfile(userId, dto);
    }

    @Patch(':id')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Update user (Admin)' })
    adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
        return this.usersService.adminUpdate(id, dto);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Deactivate user (Admin)' })
    deactivate(@Param('id') id: string) {
        return this.usersService.deactivate(id);
    }
}
