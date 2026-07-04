import { IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBlockedSlotDto {
  @ApiProperty({ example: '2025-01-15T10:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startDatetime: string;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  endDatetime: string;

  @ApiProperty({ example: 'Mantenimiento de cancha', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
