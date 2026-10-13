import type { CheckoutAddress, InvoiceDraftCreate, InvoiceDraftEdit, InvoiceDraftLineInput } from '@iranyaragh/contracts';
import { normalizeCheckoutAddress } from '../orders/checkout-address';
import { invoiceInvalid } from './invoice-policy.validation';
import { invoiceAmount } from './invoice-quote';

export function invoiceDraftText(value: string | null, maximum = 500): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw invoiceInvalid('Bounded plain text or explicit null is required.');
  const text = value.trim().normalize('NFC');
  if (text.length > maximum || /[\p{Cc}\u202a-\u202e\u2066-\u2069<>]/u.test(text)) throw invoiceInvalid('Bounded plain text without markup/control characters is required.');
  return text || null;
}
export function invoiceDraftVersion(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value >= 2147483647) throw invoiceInvalid('A bounded current draft/order version is required.');
  return value;
}
export function invoiceDraftId(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(value)) throw invoiceInvalid('A valid entity identifier is required.');
  return value;
}
export function invoiceDraftFields(input: Omit<InvoiceDraftCreate, 'customerId'>): Omit<InvoiceDraftCreate, 'customerId'> {
  if (!input || !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 50) throw invoiceInvalid('One to fifty real SKU lines are required.');
  const lines: InvoiceDraftLineInput[] = input.lines.map(line => {
    if (!line || typeof line !== 'object') throw invoiceInvalid('A real SKU line is required.');
    const variantId = invoiceDraftId(line.variantId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000) throw invoiceInvalid('Quantity must be an integer between one and 1000.');
    return { variantId, quantity: line.quantity, discount: invoiceAmount(line.discount).toString() };
  });
  if (new Set(lines.map(line => line.variantId)).size !== lines.length) throw invoiceInvalid('Duplicate SKU lines are not allowed.');
  if (typeof input.shippingMethodCode !== 'string' || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/u.test(input.shippingMethodCode)) throw invoiceInvalid('An approved shipping method is required.');
  for (const key of ['provinceCode', 'city', 'address', 'postalCode', 'recipient', 'mobile'] as const)
    if (typeof input.address?.[key] !== 'string') throw invoiceInvalid('A complete Iranian billing address is required.');
  const address: CheckoutAddress = normalizeCheckoutAddress(input.address);
  return { address, lines, globalDiscount: invoiceAmount(input.globalDiscount).toString(), shippingMethodCode: input.shippingMethodCode, note: invoiceDraftText(input.note) };
}
export function invoiceDraftEdit(input: InvoiceDraftEdit): InvoiceDraftEdit {
  return { ...invoiceDraftFields(input), expectedVersion: invoiceDraftVersion(input.expectedVersion) };
}
