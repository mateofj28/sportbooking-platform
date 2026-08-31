import { IsNotEmpty, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
