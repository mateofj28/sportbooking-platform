import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class AdminCreateUserDto {
    @ApiProperty({ example: 'john@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ example: 'SecureP@ss123' })
    @IsString()
    @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
    @Matches(/(?=.*[A-Z])/, { message: 'La contraseña debe tener al menos una mayúscula' })
    @Matches(/(?=.*\d)/, { message: 'La contraseña debe tener al menos un número' })
    password: string;

    @ApiProperty({ example: 'John' })
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ example: '+1234567890', required: false })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({ example: '12345678', required: false })
    @IsOptional()
    @IsString()
    dni?: string;

    @ApiProperty({ enum: Role, required: false, default: 'CLIENT' })
    @IsOptional()
    @IsEnum(Role)
    role?: Role;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    venueId?: string;
}
