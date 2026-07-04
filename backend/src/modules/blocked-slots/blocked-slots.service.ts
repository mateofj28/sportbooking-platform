import { Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.blockedSlot.create({
      data: {
        facilityId,
        startDatetime: new Date(dto.startDatetime),
        endDatetime: new Date(dto.endDatetime),
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
