import { IsNotEmpty, IsOptional, IsString, IsInt, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePricingDto {
    @ApiProperty({ example: 0, required: false, description: '0=Monday, 6=Sunday, null=all days' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek?: number;

    @ApiProperty({ example: '08:00' })
    @IsString()
    @IsNotEmpty()
    startTime: string;

    @ApiProperty({ example: '22:00' })
    @IsString()
    @IsNotEmpty()
    endTime: string;

    @ApiProperty({ example: 25.00 })
    @IsNumber()
    @Min(0)
    pricePerHour: number;

    @ApiProperty({ example: 'USD', required: false })
    @IsOptional()
    @IsString()
    currency?: string;
}

export class UpdatePricingDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    startTime?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    endTime?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    @Min(0)
    pricePerHour?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    currency?: string;
}
