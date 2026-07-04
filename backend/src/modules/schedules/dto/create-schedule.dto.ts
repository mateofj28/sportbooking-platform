import { IsNotEmpty, IsInt, IsString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateScheduleDto {
    @ApiProperty({ example: 0, description: '0=Monday, 6=Sunday' })
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek: number;

    @ApiProperty({ example: '08:00' })
    @IsString()
    @IsNotEmpty()
    openTime: string;

    @ApiProperty({ example: '22:00' })
    @IsString()
    @IsNotEmpty()
    closeTime: string;
}

export class UpdateScheduleDto {
    @ApiProperty({ required: false })
    @IsString()
    openTime?: string;

    @ApiProperty({ required: false })
    @IsString()
    closeTime?: string;
}
