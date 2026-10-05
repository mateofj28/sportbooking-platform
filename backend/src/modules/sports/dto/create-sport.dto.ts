import { IsNotEmpty, IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BillingType } from '@prisma/client';

export class CreateSportDto {
    @ApiProperty({ example: 'Fútbol' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ example: 22, required: false, description: 'Cantidad de jugadores' })
    @IsOptional()
    @IsInt()
    @Min(1)
    maxPlayers?: number;

    @ApiProperty({
        enum: BillingType,
        required: false,
        default: BillingType.PER_SESSION,
        description: 'Modalidad de cobro: PER_SESSION (por turno) o MONTHLY (mensualidad)',
    })
    @IsOptional()
    @IsEnum(BillingType)
    billingType?: BillingType;
}

export class UpdateSportDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ required: false, description: 'Cantidad de jugadores' })
    @IsOptional()
    @IsInt()
    @Min(1)
    maxPlayers?: number;

    @ApiProperty({
        enum: BillingType,
        required: false,
        description: 'Modalidad de cobro: PER_SESSION (por turno) o MONTHLY (mensualidad)',
    })
    @IsOptional()
    @IsEnum(BillingType)
    billingType?: BillingType;
}
