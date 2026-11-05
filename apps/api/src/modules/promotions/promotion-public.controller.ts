import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PublicPromotionListResponse } from '@iranyaragh/contracts';
import { PromotionAdminService } from './promotion-admin.service';

@ApiTags('promotions')
@Controller({ path: 'promotions/public', version: '1' })
export class PromotionPublicController {
  constructor(@Inject(PromotionAdminService) private readonly promotions: PromotionAdminService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Active and upcoming automatic campaigns for storefront badges (no customer-specific data)' })
  @ApiOkResponse({ description: 'Public campaigns.' })
  async list(): Promise<PublicPromotionListResponse> {
    return { data: { items: await this.promotions.publicCampaigns() } };
  }
}
