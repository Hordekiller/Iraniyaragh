import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_AXIS_SIGNATURE,
  canonicalizeSku,
  combinationSignature,
  legacyCombinationSignature,
  pendingCombinationSignature,
} from './variant-identifiers';

describe('variant identifiers', () => {
  describe('canonicalizeSku', () => {
    it('trims, collapses internal whitespace and uppercases ASCII', () => {
      expect(canonicalizeSku('  Wrench   12  ')).toBe('WRENCH 12');
    });

    it('preserves leading zeros', () => {
      expect(canonicalizeSku('00123')).toBe('00123');
    });

    it('uppercases lowercase ASCII skus', () => {
      expect(canonicalizeSku('bolt-m3')).toBe('BOLT-M3');
    });

    it('is idempotent', () => {
      const once = canonicalizeSku(' Gear  X ');
      expect(canonicalizeSku(once)).toBe(once);
    });
  });

  describe('combinationSignature', () => {
    it('yields the sha256 of the empty axis set', () => {
      expect(createHash('sha256').update('').digest('hex')).toBe(
        EMPTY_AXIS_SIGNATURE,
      );
      expect(combinationSignature([])).toBe(EMPTY_AXIS_SIGNATURE);
    });

    it('is stable regardless of axis ordering', () => {
      const a = combinationSignature([
        { attributeId: 'att-2', optionId: 'opt-2' },
        { attributeId: 'att-1', optionId: 'opt-1' },
      ]);
      const b = combinationSignature([
        { attributeId: 'att-1', optionId: 'opt-1' },
        { attributeId: 'att-2', optionId: 'opt-2' },
      ]);
      expect(a).toBe(b);
      expect(a).not.toBe(EMPTY_AXIS_SIGNATURE);
    });
  });

  describe('legacy and pending signatures', () => {
    it('prefixes legacy signatures with variant id', () => {
      expect(legacyCombinationSignature('variant-1')).toBe('legacy:variant-1');
    });

    it('generates unique pending placeholders', () => {
      const seen = new Set([
        pendingCombinationSignature(),
        pendingCombinationSignature(),
        pendingCombinationSignature(),
      ]);
      expect(seen.size).toBe(3);
    });
  });
});
