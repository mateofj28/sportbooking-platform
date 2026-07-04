import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSportDto {
    @ApiProperty({ example: 'Fútbol' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'futbol' })
    @IsString()
    @IsNotEmpty()
    slug: string;

    @ApiProperty({ example: 'soccer', required: false })
    @IsOptional()
    @IsString()
    icon?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;
}

export class UpdateSportDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    slug?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    icon?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;
}
