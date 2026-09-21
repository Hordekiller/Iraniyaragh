import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AttributeDefinitionCreateDto, AttributeOptionCreateDto, MoneyDto, ProductCreateDto, ProductDescriptionDto } from './catalog.dto';

describe('MoneyDto', () => {
  it('accepts canonical integer Rial and rejects currencies that cannot be persisted', async () => {
    const rial = Object.assign(new MoneyDto(), { amount: '10000', currency: 'IRR' });
    const unsupported = Object.assign(new MoneyDto(), { amount: '10000', currency: 'USD' });

    await expect(validate(rial)).resolves.toHaveLength(0);
    await expect(validate(unsupported)).resolves.not.toHaveLength(0);
  });
});

describe('Attribute code DTOs', () => {
  it('reject one-character attribute and option codes', async () => {
    const attribute = Object.assign(new AttributeDefinitionCreateDto(), { code: 'a', name: 'Attribute' });
    const option = Object.assign(new AttributeOptionCreateDto(), { code: 'a', label: 'Option' });

    await expect(validate(attribute)).resolves.not.toHaveLength(0);
    await expect(validate(option)).resolves.not.toHaveLength(0);
  });

  it('accepts two-character canonical codes', async () => {
    const attribute = Object.assign(new AttributeDefinitionCreateDto(), { code: 'ab', name: 'Attribute' });
    const option = Object.assign(new AttributeOptionCreateDto(), { code: 'ab', label: 'Option' });

    await expect(validate(attribute)).resolves.toHaveLength(0);
    await expect(validate(option)).resolves.toHaveLength(0);
  });
});

describe('ProductDescriptionDto', () => {
  it('accepts a description with expectedVersion', async () => {
    const dto = Object.assign(new ProductDescriptionDto(), { description: '<p>متن</p>', expectedVersion: 3 });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts null description for clearing', async () => {
    const dto = Object.assign(new ProductDescriptionDto(), { description: null, expectedVersion: 0 });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires expectedVersion and rejects too-large descriptions', async () => {
    const missing = Object.assign(new ProductDescriptionDto(), { description: 'x' });
    const tooLarge = Object.assign(new ProductDescriptionDto(), { description: 'x'.repeat(100_001), expectedVersion: 0 });
    expect((await validate(missing)).length).toBeGreaterThan(0);
    expect((await validate(tooLarge)).length).toBeGreaterThan(0);
  });
});

describe('ProductCreateDto', () => {
  it('accepts a description up to the 100,000 character limit and rejects beyond', async () => {
    const base = { name: 'Product', slug: 'product' };
    const ok = Object.assign(new ProductCreateDto(), { ...base, description: 'x'.repeat(100_000) });
    const tooLarge = Object.assign(new ProductCreateDto(), { ...base, description: 'x'.repeat(100_001) });
    await expect(validate(ok)).resolves.toHaveLength(0);
    expect((await validate(tooLarge)).length).toBeGreaterThan(0);
  });
});
