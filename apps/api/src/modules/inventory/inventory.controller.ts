import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryMovementType } from '@prisma/client';
import {
  InventoryMovementDto,
  InventoryService,
  InventorySnapshotDto,
} from './inventory.service';

class SnapshotQueryDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

class MovementQueryDto extends SnapshotQueryDto {
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;
}

type ListResponse<T> = {
  data: T[];
  meta: { count: number; offset: number; limit: number };
};

@ApiTags('inventory')
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('movements')
  @ApiOperation({ summary: 'List inventory movements (read-only)' })
  async movements(@Query() query: MovementQueryDto): Promise<ListResponse<InventoryMovementDto>> {
    const result = await this.inventory.getMovements(query);
    return {
      data: result.items,
      meta: { count: result.count, offset: query.offset ?? 0, limit: query.limit ?? 50 },
    };
  }

  @Get()
  @ApiOperation({ summary: 'List inventory snapshots (read-only)' })
  async list(@Query() query: SnapshotQueryDto): Promise<ListResponse<InventorySnapshotDto>> {
    const result = await this.inventory.getSnapshots(query);
    return {
      data: result.items,
      meta: { count: result.count, offset: query.offset ?? 0, limit: query.limit ?? 50 },
    };
  }
}