import type { InvoicePolicyFields, InvoiceQuote, Money } from '@iranyaragh/contracts';
import { invoiceInvalid, invoicePolicyFields } from './invoice-policy.validation';

const maximum = 9223372036854775807n;
const denominator = 10000n;
function amount(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/u.test(value)) throw invoiceInvalid('Canonical integer IRR is required.');
  return bounded(BigInt(value));
}
function bounded(value: bigint): bigint {
  if (value < 0n || value > maximum) throw invoiceInvalid('Invoice amount exceeds signed BIGINT IRR.');
  return value;
}
const money = (value: bigint): Money => ({ amount: bounded(value).toString(), currency: 'IRR' });
const sum = (values: bigint[]) => bounded(values.reduce((total, value) => total + value, 0n));
const halfUp = (numerator: bigint, divisor: bigint) => (numerator + divisor / 2n) / divisor;

/** Internal boundary: caller supplies trusted catalog/order snapshots, never client sale prices. */
export function quoteInvoice(policyInput: InvoicePolicyFields, input: {
  lines: { id: string; quantity: number; unitPrice: string; discount: string }[];
  globalDiscount: string;
  shipping: string;
}): InvoiceQuote {
  const policy = invoicePolicyFields(policyInput);
  if (!policy.isActive) throw invoiceInvalid('An active approved invoice policy is required.');
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200) throw invoiceInvalid('Between one and 200 invoice lines are required.');
  const ids = new Set<string>();
  const prepared = input.lines.map(line => {
    if (typeof line.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(line.id) || ids.has(line.id) ||
      !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000000) throw invoiceInvalid('Unique line IDs and bounded positive quantities are required.');
    ids.add(line.id);
    const subtotal = bounded(amount(line.unitPrice) * BigInt(line.quantity));
    const discount = amount(line.discount);
    if (discount > subtotal) throw invoiceInvalid('A line discount cannot exceed its subtotal.');
    return { id: line.id, subtotal, discount, remaining: subtotal - discount };
  });
  const subtotal = sum(prepared.map(line => line.subtotal));
  const remaining = sum(prepared.map(line => line.remaining));
  const globalDiscount = amount(input.globalDiscount);
  const totalDiscount = sum([...prepared.map(line => line.discount), globalDiscount]);
  if (globalDiscount > remaining || totalDiscount * denominator > subtotal * BigInt(policy.discountCapBps)) throw invoiceInvalid('Discount exceeds the remaining amount or configured cap.');
  const allocations = prepared.map((line, index) => ({ index, value: remaining ? globalDiscount * line.remaining / remaining : 0n,
    remainder: remaining ? globalDiscount * line.remaining % remaining : 0n }));
  let residue = globalDiscount - sum(allocations.map(line => line.value));
  // Less than line count; ties deliberately retain stable invoice line order.
  const ranked = [...allocations].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const allocation of ranked) {
    if (residue === 0n) break;
    allocation.value += 1n; residue -= 1n;
  }
  const taxComponents = (value: bigint, taxable: boolean) => {
    if (!taxable || policy.taxTreatment === 'EXEMPT') return { base: value, tax: 0n, total: value };
    const rate = BigInt(policy.taxRateBps);
    if (policy.taxTreatment === 'INCLUSIVE') {
      const base = halfUp(value * denominator, denominator + rate);
      return { base, tax: value - base, total: value };
    }
    const tax = bounded(halfUp(value * rate, denominator));
    return { base: value, tax, total: bounded(value + tax) };
  };
  const lines = prepared.map((line, index) => {
    const discount = line.discount + allocations[index].value;
    const parts = taxComponents(line.subtotal - discount, true);
    return { id: line.id, subtotal: money(line.subtotal), discount: money(discount), netAmount: money(parts.base), tax: money(parts.tax), total: money(parts.total) };
  });
  const shipping = amount(input.shipping);
  const shippingParts = taxComponents(shipping, policy.shippingTaxable);
  return { lines, subtotal: money(subtotal), discount: money(totalDiscount), shipping: money(shipping),
    netAmount: money(sum([...lines.map(line => BigInt(line.netAmount.amount)), shippingParts.base])),
    tax: money(sum([...lines.map(line => BigInt(line.tax.amount)), shippingParts.tax])),
    total: money(sum([...lines.map(line => BigInt(line.total.amount)), shippingParts.total])) };
}
