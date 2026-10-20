import { BadRequestException } from '@nestjs/common';

/** Internal job identity, never a User, a staff session or a request-body flag. */
export type OrderExpirySystemContext = {
  actorId: null;
  requestId: string;
  systemActor: 'order-reservation-expiry';
};

export function orderExpirySystemContext(requestId: string): OrderExpirySystemContext {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)) {
    throw new BadRequestException('A bounded correlation ID is required for order expiry.');
  }
  return { actorId: null, requestId, systemActor: 'order-reservation-expiry' };
}
