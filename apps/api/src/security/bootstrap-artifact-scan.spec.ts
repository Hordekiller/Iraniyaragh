import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_ROOT = join(__dirname, '..', '..');
const read = (relativePath: string): string =>
  readFileSync(join(API_ROOT, relativePath), 'utf8');

const bootstrapScript = () => read('scripts/bootstrap-admin.mjs');
const bootstrapCore = () => read('scripts/bootstrap-admin-core.mjs');
const seedScript = () => read('prisma/seed.mjs');

describe('bootstrap artifact scan', () => {
  it('requires an interactive TTY and an explicit --confirm flag before any input', () => {
    const source = bootstrapScript();
    expect(source).toMatch(/stdin\.isTTY/);
    expect(source).toMatch(/stdout\.isTTY/);
    expect(source).toContain(`process.argv[2] !== '--confirm'`);
    expect(source.indexOf('--confirm')).toBeLessThan(source.indexOf('await hidden('));
  });

  it('never embeds a password, TOTP secret or default credential in the script', () => {
    const source = bootstrapScript();
    expect(source).toMatch(/const password = await hidden\(/);
    expect(source).not.toMatch(/password\s*=\s*['"]/);
    expect(source).not.toMatch(/secret\s*=\s*['"]/);
    expect(source).not.toMatch(/const\s+(code|key|token)\s*=\s*['"]/i);
    expect(source.match(/\?\?\s*['"]/g)).toBeNull();
  });

  it('reads connection keys only from required environment variables with no fallback', () => {
    const source = bootstrapScript();
    expect(source).toContain(`required('DATABASE_URL')`);
    expect(source).toContain(`required('AUTH_HASH_SECRET')`);
    expect(source).toContain(`required('AUTH_TOTP_ENCRYPTION_KEY')`);
    const envMatches = source.match(/process\.env/g);
    expect(envMatches).not.toBeNull();
    expect(envMatches?.length).toBe(1);
    expect(source).toContain(`required('DATABASE_URL')`);
    expect(source).not.toMatch(/process\.env\.[A-Z_]+(?!\])\s*\?\?\s*['"]/);
    expect(source.match(/\?\?\s*['"]/g)).toBeNull();
  });

  it('delegates the creation transaction to the testable core and refuses replacement', () => {
    const source = bootstrapScript();
    expect(source).toMatch(/createFirstAdministrator\s*\(/);
    expect(source).toContain('createFirstAdministrator({');
    expect(source).toContain('refuses replacement');
  });

  it('keeps the core transaction free of environment and credential literals', () => {
    const source = bootstrapCore();
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/passwordHash\s*=\s*['"]/);
    expect(source).not.toMatch(/encryptedSecret\s*=\s*['"]/);
    expect(source).not.toMatch(/recoveryCodes\s*=\s*\[/);
    expect(source).toMatch(/passwordHash,\s*encryptedSecret/);
    expect(source).toMatch(/recoveryCodes/);
  });

  it('keeps the seed free of a stored admin credential and gates the dev admin on AUTH_DEV_CODE', () => {
    const source = seedScript();
    expect(source).toMatch(/passwordHash:\s*null/);
    expect(source).toMatch(/AUTH_DEV_CODE/);
    expect(source).toMatch(/process\.env\.AUTH_DEV_CODE/);
    expect(source).not.toMatch(/AUTH_DEV_CODE[^\r\n]{0,40}\?\?\s*['"]/);
    expect(source).not.toMatch(/password:\s*['"]/);
    expect(source).not.toMatch(/secret:\s*['"]/);
    expect(source).not.toMatch(/const\s+(devCode|password)\s*=\s*['"]/i);
  });

  it('lists no committed default credential string in the first-admin artifacts', () => {
    const sources = [bootstrapScript(), bootstrapCore(), seedScript()].join('\n');
    const forbidden = [
      /password\s*[:-]\s*['"]password['"]/i,
      /secret\s*=\s*['"](secret|changeme|change-me|password)['"]/i,
      /['"](admin|root)['"]\s*:\s*['"](admin|123456|password)['"]/i,
    ];
    for (const pattern of forbidden) {
      expect(sources).not.toMatch(pattern);
    }
  });
});