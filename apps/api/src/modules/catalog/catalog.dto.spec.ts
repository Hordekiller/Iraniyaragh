import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AttributeDefinitionCreateDto, AttributeOptionCreateDto, MoneyDto } from './catalog.dto';

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
