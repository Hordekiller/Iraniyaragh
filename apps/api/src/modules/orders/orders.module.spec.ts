import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { OrderReadController } from './order-read.controller';
import { StaffOrderController } from './staff-order.controller';

/**
 * Guards a route-registration invariant that has no other observable test.
 *
 * Nest/Express match routes in registration order and `OrderReadController`
 * owns the parametric `GET /orders/admin/:id`. If it is registered before
 * `StaffOrderController`, then `GET /orders/admin/options` is captured as
 * `id: "options"` and the lookup 404s. The controller-level HTTP spec cannot
 * catch a reorder here because it declares its own module.
 */
describe('OrdersModule controller registration order', () => {
  it('registers the static staff sub-routes before the parametric admin detail route', async () => {
    const { OrdersModule } = await import('./orders.module');
    const controllers = (Reflect.getMetadata('controllers', OrdersModule) ??
      []) as unknown[];

    const staffIndex = controllers.indexOf(StaffOrderController);
    const readIndex = controllers.indexOf(OrderReadController);

    expect(staffIndex, 'StaffOrderController must be registered').toBeGreaterThanOrEqual(0);
    expect(readIndex, 'OrderReadController must be registered').toBeGreaterThanOrEqual(0);
    expect(
      staffIndex,
      'StaffOrderController (orders/admin/options) must precede OrderReadController (orders/admin/:id)',
    ).toBeLessThan(readIndex);
  });
});
