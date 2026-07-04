import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UpdateUserDto, AdminUpdateUserDto } from './dto/update-user.dto';
import { PaginationParams } from '../../common/interfaces/pagination.interface';

@Injectable()
export class UsersService {
    constructor(private readonly usersRepository: UsersRepository) { }

    async findAll(params: PaginationParams) {
        return this.usersRepository.findAll(params);
    }

    async findById(id: string) {
        const user = await this.usersRepository.findById(id);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    async updateProfile(userId: string, dto: UpdateUserDto) {
        return this.usersRepository.update(userId, dto);
    }

    async adminUpdate(id: string, dto: AdminUpdateUserDto) {
        await this.findById(id);
        return this.usersRepository.update(id, dto);
    }

    async deactivate(id: string) {
        await this.findById(id);
        return this.usersRepository.update(id, { isActive: false });
    }
}
