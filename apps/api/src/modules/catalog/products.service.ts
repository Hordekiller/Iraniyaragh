import { Injectable } from '@nestjs/common';
import { PriceType, Prisma, ProductStatus } from '@prisma/client';
import { AppError, ErrorCodes } from '../../common/errors/app-error';
import { toRialNumber } from '../../common/money/money';
import { PrismaService } from '../../database/prisma.service';
import { buildPageMeta } from '../../common/dto/pagination.dto';
import { InventoryService } from '../inventory/inventory.service';

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
} as const;

type ActivePrice = {
  id: string;
  type: PriceType;
  amount: bigint;
  minQuantity: number;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async list(query: QueryShape) {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      ...(query.categorySlug
        ? { category: { slug: query.categorySlug } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { skus: { some: { sku: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          ...productInclude,
          skus: {
            where: { isActive: true },
            include: {
              prices: {
                where: { isActive: true },
                orderBy: { effectiveFrom: 'desc' },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const items = await Promise.all(
      products.map(async (product) => this.mapPublicProduct(product)),
    );

    return {
      items,
      meta: buildPageMeta(total, query.page, query.limit),
    };
  }

  async detail(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, status: ProductStatus.ACTIVE },
      include: {
        ...productInclude,
        skus: {
          where: { isActive: true },
          include: {
            prices: { where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } },
          },
        },
      },
    });
    if (!product) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Product not found.', 404);
    }
    return this.mapPublicProduct(product);
  }

  private async mapPublicProduct(product: ProductWithSkus) {
    const skus = await Promise.all(
      product.skus.map(async (sku) => {
        const price = pickCurrentPrice(sku.prices);
        const available = await this.inventory.availableQuantity(sku.id);
        return {
          id: sku.id,
          skuCode: sku.sku,
          title: sku.title,
          price: price ? toRialNumber(price.amount) : null,
          minQuantity: price ? price.minQuantity : 1,
          available,
          weightGrams: sku.weightGrams,
        };
      }),
    );
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      category: product.category,
      brand: product.brand,
      skus,
    };
  }
}

interface QueryShape {
  page: number;
  limit: number;
  categorySlug?: string;
  search?: string;
}

type ProductWithSkus = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: { id: string; name: string; slug: string } | null;
  brand: { id: string; name: string; slug: string } | null;
  skus: Array<{
    id: string;
    sku: string;
    title: string | null;
    weightGrams: number | null;
    prices: ActivePrice[];
  }>;
};

function pickCurrentPrice(prices: ActivePrice[]): ActivePrice | null {
  if (prices.length === 0) return null;
  const sale = prices.find((p) => p.type === PriceType.SALE);
  return sale ?? prices[0];
}
