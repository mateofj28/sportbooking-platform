import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
    @ApiProperty({ example: 'john@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email: string;
}

export class ResetPasswordDto {
    @ApiProperty()
    @IsNotEmpty()
    token: string;

    @ApiProperty({ example: 'NewSecureP@ss123' })
    @IsNotEmpty()
    password: string;
}
