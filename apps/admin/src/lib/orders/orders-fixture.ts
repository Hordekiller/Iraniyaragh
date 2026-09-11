import type {
  AdminOrderDetail,
  AdminOrderListResult,
  AdminOrderQuery,
  AdminOrdersApi,
  AdminOrderSummary,
} from './orders-types';

/**
 * Deterministic, read-only order fixture for the admin queue and detail pages.
 *
 * The backend orders module does not exist yet (issue backlog), so the admin
 * must never present a mocked "live" API as business truth. Like the storefront
 * `OrderFixture`, this implementation offers a complete, testable read journey
 * through the `AdminOrdersApi` port — with clearly synthetic demo identities and
 * no real PII — and is replaced by the real HTTP client behind the same
 * interface once the order/payment/fulfillment state machines land
 * (docs/COMMERCE_AND_INVENTORY.md, docs/ADMIN_PANEL_PLAN.md §5.4).
 *
 * The three lifecycles stay separated: an order row exposes its order state,
 * its payment state and its fulfillment state independently and never flattens
 * them into one status.
 */
export class OrdersFixtureApi implements AdminOrdersApi {
  private readonly orders: AdminOrderSummary[];
  private readonly details: Map<string, AdminOrderDetail>;

  constructor() {
    this.orders = buildSeedSummaries();
    this.details = new Map(buildSeedDetails().map((order) => [order.id, order]));
  }

  async listOrders(query: AdminOrderQuery): Promise<AdminOrderListResult> {
    const perPage = query.perPage ?? 25;
    const page = query.page ?? 1;

    let rows = this.orders;

    if (query.search && query.search.trim()) {
      const needle = normalizeSearch(query.search.trim());
      rows = rows.filter((order) =>
        normalizeSearch(`${order.orderNumber} ${order.customer.fullName} ${order.customer.mobile}`).includes(needle),
      );
    }

    if (query.orderStatus) rows = rows.filter((order) => order.orderStatus === query.orderStatus);
    if (query.paymentStatus) rows = rows.filter((order) => order.paymentStatus === query.paymentStatus);
    if (query.fulfillmentStatus) {
      rows = rows.filter((order) => order.fulfillmentStatus === query.fulfillmentStatus);
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const dir = query.sortDir === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const key: keyof AdminOrderSummary = sortBy;
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      const sa = String(av);
      const sb = String(bv);
      return sa.localeCompare(sb) * dir;
    });

    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const clampedPage = Math.min(Math.max(1, page), pages);
    const start = (clampedPage - 1) * perPage;
    const items = rows.slice(start, start + perPage);

    return { items, meta: { page: clampedPage, perPage, total, pages } };
  }

  async getOrder(id: string): Promise<AdminOrderDetail> {
    const order = this.details.get(id);
    if (!order) {
      throw new Error('سفارش یافت نشد.');
    }
    return order;
  }
}

const NOW = Date.parse('2026-09-08T12:00:00Z');

function iso(daysAgo: number, hours = 0): string {
  return new Date(NOW - daysAgo * 86_400_000 - hours * 3_600_000).toISOString();
}

/**
 * The orders port the admin UI depends on. In this pre-backend phase it is
 * bound to the deterministic fixture; the HTTP client swaps in behind the same
 * interface when the order API lands.
 */
export const ordersApi: AdminOrdersApi = new OrdersFixtureApi();

function normalizeSearch(value: string): string {
  return value.replace(/\u200c/g, ' ').toLowerCase().trim();
}

function buildSeedSummaries(): AdminOrderSummary[] {
  return [
    {
      id: 'ord-1001',
      orderNumber: 'IR-10-4821',
      createdAt: iso(0, 2),
      updatedAt: iso(0, 1),
      customer: { fullName: 'مشتری نمونهٔ یک', mobile: '09120000001' },
      totalRials: 4_650_000,
      orderStatus: 'PROCESSING',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'ALLOCATED',
    },
    {
      id: 'ord-1002',
      orderNumber: 'IR-10-4822',
      createdAt: iso(0, 5),
      updatedAt: iso(0, 3),
      customer: { fullName: 'مشتری نمونهٔ دو', mobile: '09120000002' },
      totalRials: 2_150_000,
      orderStatus: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      fulfillmentStatus: 'UNFULFILLED',
    },
    {
      id: 'ord-1003',
      orderNumber: 'IR-09-3764',
      createdAt: iso(1, 4),
      updatedAt: iso(1),
      customer: { fullName: 'مشتری نمونهٔ سه', mobile: '09350000003' },
      totalRials: 9_870_000,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'DELIVERED',
    },
    {
      id: 'ord-1004',
      orderNumber: 'IR-09-3763',
      createdAt: iso(1, 7),
      updatedAt: iso(1, 2),
      customer: { fullName: 'مشتری نمونهٔ چهار', mobile: '09190000004' },
      totalRials: 780_000,
      orderStatus: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      fulfillmentStatus: 'UNFULFILLED',
    },
    {
      id: 'ord-1005',
      orderNumber: 'IR-09-3701',
      createdAt: iso(2, 4),
      updatedAt: iso(2, 1),
      customer: { fullName: 'مشتری نمونهٔ پنج', mobile: '09210000005' },
      totalRials: 3_300_000,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PARTIALLY_REFUNDED',
      fulfillmentStatus: 'SHIPPED',
    },
  ];
}

function buildSeedDetails(): AdminOrderDetail[] {
  const summaries = buildSeedSummaries();
  const lines: Record<string, { productName: string; sku: string; quantity: number; unitPriceRials: number }[]> = {
    'ord-1001': [
      { productName: 'دستگیرهٔ در استیل', sku: 'HND-ST-240', quantity: 2, unitPriceRials: 1_800_000 },
      { productName: 'قفل چندمنظوره', sku: 'LCK-MP-102', quantity: 1, unitPriceRials: 1_050_000 },
    ],
    'ord-1002': [
      { productName: 'لولای مخفی ۱۸۰ درجه', sku: 'HGE-HT-018', quantity: 5, unitPriceRials: 430_000 },
    ],
    'ord-1003': [
      { productName: 'کشوی چوبی ممتاز', sku: 'DRW-WD-500', quantity: 3, unitPriceRials: 3_290_000 },
    ],
    'ord-1004': [
      { productName: 'پیچ و رولپلاک بسته', sku: 'SCR-PK-300', quantity: 1, unitPriceRials: 780_000 },
    ],
    'ord-1005': [
      { productName: 'یراقآلات شیشه', sku: 'GLZ-KT-080', quantity: 2, unitPriceRials: 1_650_000 },
    ],
  };

  return summaries.map((summary, index) => {
    const lineSeed = lines[summary.id] ?? [];
    const lineItems = lineSeed.map((line, lineIndex) => ({
      id: `${summary.id}-line-${lineIndex + 1}`,
      productName: line.productName,
      sku: line.sku,
      quantity: line.quantity,
      unitPriceRials: line.unitPriceRials,
      lineTotalRials: line.unitPriceRials * line.quantity,
    }));
    const subtotalRials = lineItems.reduce((sum, line) => sum + line.lineTotalRials, 0);
    const shippingRials = index % 2 === 0 ? 0 : 80_000;
    return {
      ...summary,
      subtotalRials,
      shippingRials,
      totalRials: subtotalRials + shippingRials,
      lines: lineItems,
      shipping: {
        province: 'تهران',
        city: 'تهران',
        postalCode: '1234567890',
        address: 'خیابان نمونه، پلاک ۱',
      },
    } satisfies AdminOrderDetail;
  });
}