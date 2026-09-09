import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFacilityDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    venueId: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    sportId: string;

    @ApiProperty({ example: 'Cancha 1' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    imageUrl?: string;

    @ApiProperty({ example: 'césped sintético', required: false })
    @IsOptional()
    @IsString()
    surfaceType?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    isIndoor?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsInt()
    capacity?: number;

    @ApiProperty({ example: 60, description: 'Minimum booking duration in minutes' })
    @IsInt()
    @Min(15)
    minBookingDuration: number;

    @ApiProperty({ example: 120, description: 'Maximum booking duration in minutes' })
    @IsInt()
    @Min(15)
    maxBookingDuration: number;
}

export class UpdateFacilityDto {
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
    imageUrl?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    surfaceType?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    isIndoor?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsInt()
    capacity?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsInt()
    @Min(15)
    minBookingDuration?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsInt()
    @Min(15)
    maxBookingDuration?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
