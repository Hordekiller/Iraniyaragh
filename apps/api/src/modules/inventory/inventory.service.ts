import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type StockKey = {
  warehouseId: string;
  locationId: string;
  variantId: string;
};

type ChangeStockCommand = StockKey & {
  delta: number;
  type: InventoryMovementType;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
};

type ReserveStockCommand = StockKey & {
  orderId?: string;
  quantity: number;
  expiresAt: Date;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async changeOnHand(command: ChangeStockCommand) {
    if (!Number.isInteger(command.delta) || command.delta === 0) {
      throw new BadRequestException('Inventory delta must be a non-zero integer.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (command.idempotencyKey) {
        const existing = await tx.inventoryMovement.findUnique({
          where: { idempotencyKey: command.idempotencyKey },
        });
        if (existing) return existing;
      }

      await this.assertLocation(tx, command);

      const key = this.balanceKey(command);
      const current = await tx.inventoryBalance.findUnique({ where: key });
      const beforeOnHand = current?.onHand ?? 0;
      const reserved = current?.reserved ?? 0;
      const afterOnHand = beforeOnHand + command.delta;
      const available = afterOnHand - reserved;

      if (afterOnHand < 0 || available < 0) {
        throw new ConflictException('Insufficient stock for this operation.');
      }

      await tx.inventoryBalance.upsert({
        where: key,
        create: {
          warehouseId: command.warehouseId,
          locationId: command.locationId,
          variantId: command.variantId,
          onHand: afterOnHand,
          reserved,
          available,
          version: 1,
        },
        update: {
          onHand: afterOnHand,
          available,
          version: { increment: 1 },
        },
      });

      return tx.inventoryMovement.create({
        data: {
          warehouseId: command.warehouseId,
          locationId: command.locationId,
          variantId: command.variantId,
          type: command.type,
          quantity: command.delta,
          beforeOnHand,
          afterOnHand,
          reason: command.reason,
          referenceType: command.referenceType,
          referenceId: command.referenceId,
          idempotencyKey: command.idempotencyKey,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reserve(command: ReserveStockCommand) {
    if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
      throw new BadRequestException('Reservation quantity must be a positive integer.');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertLocation(tx, command);
      const key = this.balanceKey(command);
      const balance = await tx.inventoryBalance.findUnique({ where: key });

      if (!balance || balance.available < command.quantity) {
        throw new ConflictException('Insufficient available stock.');
      }

      await tx.inventoryBalance.update({
        where: key,
        data: {
          reserved: { increment: command.quantity },
          available: { decrement: command.quantity },
          version: { increment: 1 },
        },
      });

      return tx.stockReservation.create({
        data: {
          warehouseId: command.warehouseId,
          locationId: command.locationId,
          variantId: command.variantId,
          orderId: command.orderId,
          quantity: command.quantity,
          expiresAt: command.expiresAt,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async releaseReservation(reservationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.stockReservation.findUnique({ where: { id: reservationId } });
      if (!reservation) throw new NotFoundException('Reservation not found.');
      if (reservation.status !== 'ACTIVE') return reservation;

      const balance = await tx.inventoryBalance.findUnique({
        where: {
          warehouseId_locationId_variantId: {
            warehouseId: reservation.warehouseId,
            locationId: reservation.locationId,
            variantId: reservation.variantId,
          },
        },
      });
      if (!balance || balance.reserved < reservation.quantity) {
        throw new ConflictException('Reservation balance is inconsistent.');
      }

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          reserved: { decrement: reservation.quantity },
          available: { increment: reservation.quantity },
          version: { increment: 1 },
        },
      });

      return tx.stockReservation.update({
        where: { id: reservationId },
        data: { status: 'RELEASED' },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private balanceKey(key: StockKey) {
    return {
      warehouseId_locationId_variantId: {
        warehouseId: key.warehouseId,
        locationId: key.locationId,
        variantId: key.variantId,
      },
    } as const;
  }

  private async assertLocation(tx: Prisma.TransactionClient, key: StockKey) {
    const location = await tx.warehouseLocation.findFirst({
      where: { id: key.locationId, warehouseId: key.warehouseId, isActive: true },
      select: { id: true },
    });
    if (!location) throw new NotFoundException('Active warehouse location not found.');
  }
}
