import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: QueryProductsDto) {
    return this.products.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.products.detail(id);
  }
}
