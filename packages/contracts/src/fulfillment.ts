import type { ApiSuccess } from './api';
import type { FulfillmentStatus } from './orders';

export type FulfillmentPickProof = {
  id: string;
  orderItemId: string;
  quantity: number;
  actorId: string | null;
  requestId: string;
  createdAt: string;
};

export type FulfillmentPickLine = {
  orderItemId: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  quantity: number;
  pick: FulfillmentPickProof | null;
};

export type FulfillmentPickListResponse = ApiSuccess<{
  fulfillment: { id: string; status: FulfillmentStatus };
  items: FulfillmentPickLine[];
}>;

export type FulfillmentPickResponse = ApiSuccess<{ pick: FulfillmentPickProof }>;
