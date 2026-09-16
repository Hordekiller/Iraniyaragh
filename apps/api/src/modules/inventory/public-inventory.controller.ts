import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { InventoryService } from './inventory.service';

class PublicAvailabilityQueryDto {
  @IsOptional() @IsString() variantIds?: string;
}

/** Deliberately unauthenticated, aggregate-only inventory projection. */
@Controller({ path: 'inventory/public', version: '1' })
export class PublicInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('availability')
  async availability(@Query() query: PublicAvailabilityQueryDto) {
    const variantIds = (query.variantIds ?? '').split(',').map(id => id.trim()).filter(Boolean);
    return this.inventory.getPublicAvailability(variantIds);
  }
}
