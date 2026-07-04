import { IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    facilityId: string;

    @ApiProperty({ example: '2025-01-15T10:00:00.000Z' })
    @IsDateString()
    @IsNotEmpty()
    startDatetime: string;

    @ApiProperty({ example: '2025-01-15T11:00:00.000Z' })
    @IsDateString()
    @IsNotEmpty()
    endDatetime: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class ManualBookingDto extends CreateBookingDto {
    @ApiProperty({ description: 'User ID for manual booking' })
    @IsString()
    @IsNotEmpty()
    userId: string;
}

export class CancelBookingDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    reason?: string;
}
