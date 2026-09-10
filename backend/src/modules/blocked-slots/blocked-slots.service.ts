import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBlockedSlotDto, UpdateBlockedSlotDto } from './dto/create-blocked-slot.dto';

function validateRange(start: Date, end: Date) {
  if (end <= start) {
    throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
  }
  const durationMs = end.getTime() - start.getTime();
  if (durationMs > 24 * 60 * 60 * 1000) {
    throw new BadRequestException('El bloqueo no puede durar más de 24 horas');
  }
}

@Injectable()
export class BlockedSlotsService {
  constructor(private prisma: PrismaService) {}

  async findByFacility(facilityId: string) {
    return this.prisma.blockedSlot.findMany({
      where: { facilityId },
      orderBy: { startDatetime: 'desc' },
    });
  }

  async create(facilityId: string, dto: CreateBlockedSlotDto, userId: string) {
    const start = new Date(dto.startDatetime);
    const end = new Date(dto.endDatetime);
    validateRange(start, end);

    return this.prisma.blockedSlot.create({
      data: {
        facilityId,
        startDatetime: start,
        endDatetime: end,
        reason: dto.reason,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateBlockedSlotDto) {
    const slot = await this.prisma.blockedSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Bloqueo no encontrado');

    const start = dto.startDatetime ? new Date(dto.startDatetime) : slot.startDatetime;
    const end = dto.endDatetime ? new Date(dto.endDatetime) : slot.endDatetime;
    validateRange(start, end);

    return this.prisma.blockedSlot.update({
      where: { id },
      data: {
        startDatetime: start,
        endDatetime: end,
        reason: dto.reason !== undefined ? dto.reason : slot.reason,
      },
    });
  }

  async remove(id: string) {
    const slot = await this.prisma.blockedSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Bloqueo no encontrado');
    return this.prisma.blockedSlot.delete({ where: { id } });
  }
}
