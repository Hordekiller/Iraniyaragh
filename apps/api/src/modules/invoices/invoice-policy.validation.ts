import { BadRequestException } from '@nestjs/common';
import type { InvoicePolicyFields, InvoicePolicyUpdate } from '@iranyaragh/contracts';

export const invoiceInvalid = (message: string) => new BadRequestException({ code: 'VALIDATION_ERROR', message });
function text(value: string, maximum: number): string {
  if (typeof value !== 'string') throw invoiceInvalid('Bounded plain text is required.');
  const result = value.trim().normalize('NFC');
  if (!result || result.length > maximum || /[\p{Cc}\u202a-\u202e\u2066-\u2069<>]/u.test(result)) throw invoiceInvalid('Bounded plain text without markup/control characters is required.');
  return result;
}
export function invoicePolicyFields(input: InvoicePolicyFields): InvoicePolicyFields {
  if (!input || !['EXCLUSIVE', 'INCLUSIVE', 'EXEMPT'].includes(input.taxTreatment) ||
    !Number.isInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10000 ||
    !Number.isInteger(input.discountCapBps) || input.discountCapBps < 0 || input.discountCapBps > 10000 ||
    typeof input.shippingTaxable !== 'boolean' || typeof input.isActive !== 'boolean') throw invoiceInvalid('Explicit tax, discount and activation policy is required.');
  const exemptionReason = input.exemptionReason === null ? null : text(input.exemptionReason, 500);
  if ((input.taxTreatment === 'EXEMPT' && (input.taxRateBps !== 0 || !exemptionReason)) ||
    (input.taxTreatment !== 'EXEMPT' && exemptionReason !== null)) throw invoiceInvalid('Exempt treatment requires zero rate and an explicit reason; taxable treatment cannot carry an exemption.');
  return { sellerName: text(input.sellerName, 200), sellerAddress: text(input.sellerAddress, 1000), sellerContact: text(input.sellerContact, 200),
    taxTreatment: input.taxTreatment, taxRateBps: input.taxRateBps, exemptionReason, discountCapBps: input.discountCapBps,
    shippingTaxable: input.shippingTaxable, isActive: input.isActive };
}
export function invoicePolicyUpdate(input: InvoicePolicyUpdate): InvoicePolicyUpdate {
  const fields = invoicePolicyFields(input);
  if (input.expectedVersion !== null && (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= 2147483647)) throw invoiceInvalid('The current policy version is required.');
  return { ...fields, expectedVersion: input.expectedVersion, reason: text(input.reason, 500) };
}
