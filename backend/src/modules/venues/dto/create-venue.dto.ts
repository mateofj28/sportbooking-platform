import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVenueDto {
    @ApiProperty({ example: 'Complejo Deportivo Central' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'complejo-deportivo-central' })
    @IsString()
    @IsNotEmpty()
    slug: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ example: 'Av. Principal 123' })
    @IsString()
    @IsNotEmpty()
    address: string;

    @ApiProperty({ example: 'Buenos Aires' })
    @IsString()
    @IsNotEmpty()
    city: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    state?: string;

    @ApiProperty({ example: 'Argentina' })
    @IsString()
    @IsNotEmpty()
    country: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    longitude?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    email?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    imageUrl?: string;
}

export class UpdateVenueDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    state?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    country?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    longitude?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    email?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    imageUrl?: string;
}
