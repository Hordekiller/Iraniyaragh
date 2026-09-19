import { IsDateString, Matches } from 'class-validator';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  TransferStatus,
} from '@prisma/client';
import type { AdminDashboardQuery } from '@iranyaragh/contracts';

export const ORDER_STATUS_VALUES = Object.values(OrderStatus);
export const PAYMENT_STATUS_VALUES = Object.values(PaymentStatus);
export const FULFILLMENT_STATUS_VALUES = Object.values(FulfillmentStatus);
export const RESERVATION_STATUS_VALUES = Object.values(ReservationStatus);
export const TRANSFER_STATUS_VALUES = Object.values(TransferStatus);

const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export class AdminDashboardQueryDto implements AdminDashboardQuery {
  @IsDateString({ strict: true })
  @Matches(ISO_INSTANT_PATTERN)
  createdFrom!: string;

  @IsDateString({ strict: true })
  @Matches(ISO_INSTANT_PATTERN)
  createdToExclusive!: string;
}
