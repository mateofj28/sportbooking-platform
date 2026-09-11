import { IsNotEmpty, IsOptional, IsString, IsDateString, IsInt, Min, Max } from 'class-validator';
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

export class CreateRecurringBookingDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    facilityId: string;

    @ApiProperty({ example: 3, description: '0=Lunes ... 6=Domingo' })
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek: number;

    @ApiProperty({ example: '20:00' })
    @IsString()
    @IsNotEmpty()
    startTime: string;

    @ApiProperty({ example: '22:00' })
    @IsString()
    @IsNotEmpty()
    endTime: string;

    @ApiProperty({ example: '2026-09-15', description: 'Fecha de inicio (YYYY-MM-DD). Se generan las próximas N ocurrencias del día elegido a partir de esta fecha.' })
    @IsDateString()
    @IsNotEmpty()
    startDate: string;

    @ApiProperty({ required: false, description: 'Cliente para el que se crea (solo admin de sede)' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    notes?: string;
}
