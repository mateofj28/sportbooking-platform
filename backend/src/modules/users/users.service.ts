import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { UpdateUserDto, AdminUpdateUserDto } from './dto/update-user.dto';
import { AdminCreateUserDto } from './dto/create-user.dto';
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
            throw new NotFoundException('Usuario no encontrado');
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

    async adminCreate(dto: AdminCreateUserDto) {
        try {
            return await this.usersRepository.create(dto);
        } catch (error: any) {
            if (error.code === 'P2002') {
                throw new ConflictException('Ya existe un usuario con ese email o DNI');
            }
            throw error;
        }
    }

    async deactivate(id: string) {
        await this.findById(id);
        return this.usersRepository.update(id, { isActive: false });
    }

    async reactivate(id: string) {
        await this.findById(id);
        return this.usersRepository.update(id, { isActive: true });
    }
}
