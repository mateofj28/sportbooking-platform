import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBlockedSlotDto } from './dto/create-blocked-slot.dto';

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

    if (end <= start) {
      throw new BadRequestException('La hora de fin debe ser posterior a la de inicio');
    }

    // Un bloqueo no puede durar más de 24h (evita rangos absurdos)
    const durationMs = end.getTime() - start.getTime();
    if (durationMs > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('El bloqueo no puede durar más de 24 horas');
    }

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

  async remove(id: string) {
    const slot = await this.prisma.blockedSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Bloqueo no encontrado');
    return this.prisma.blockedSlot.delete({ where: { id } });
  }
}
