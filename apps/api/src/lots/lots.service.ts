import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface UpdateLotInput {
  unitCost?: number;
  note?: string | null;
}

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findOne(id: string) {
    const lot = await this.prisma.stockLot.findUnique({
      where: { id },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    return this.serialize(lot);
  }

  async update(id: string, input: UpdateLotInput, userId?: string) {
    const before = await this.prisma.stockLot.findUnique({
      where: { id },
      select: {
        id: true,
        variantId: true,
        unitCost: true,
        note: true,
        initialQuantity: true,
        remainingQuantity: true,
      },
    });
    if (!before) throw new NotFoundException('Lot not found');

    const updated = await this.prisma.stockLot.update({
      where: { id },
      data: {
        ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      include: { supplier: { select: { id: true, name: true } } },
    });

    await this.audit.log({
      entity: 'Lot',
      entityId: id,
      action: 'UPDATE',
      userId,
      before: {
        unitCost: Number(before.unitCost),
        note: before.note,
      },
      after: {
        unitCost: Number(updated.unitCost),
        note: updated.note,
      },
      note: 'Изменение партии не пересчитывает прошлые движения (snapshot бухучёта)',
    });

    return this.serialize(updated);
  }

  private serialize(l: {
    id: string;
    variantId: string;
    unitCost: { toString(): string } | string | number;
    initialQuantity: { toString(): string } | string | number;
    remainingQuantity: { toString(): string } | string | number;
    receivedAt: Date;
    supplierId: string | null;
    supplier: { id: string; name: string } | null;
    note: string | null;
    userId: string;
    createdByMovementId: string;
    createdAt: Date;
  }) {
    return {
      id: l.id,
      variantId: l.variantId,
      unitCost: Number(l.unitCost),
      initialQuantity: Number(l.initialQuantity),
      remainingQuantity: Number(l.remainingQuantity),
      receivedAt: l.receivedAt.toISOString(),
      supplierId: l.supplierId,
      supplier: l.supplier,
      note: l.note,
      userId: l.userId,
      createdByMovementId: l.createdByMovementId,
      createdAt: l.createdAt.toISOString(),
    };
  }
}
