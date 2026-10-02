import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_ROOT = join(__dirname, '..', '..');
const read = (relativePath: string): string =>
  readFileSync(join(API_ROOT, relativePath), 'utf8');

const bootstrapScript = () => read('scripts/bootstrap-admin.mjs');
const bootstrapCore = () => read('scripts/bootstrap-admin-core.mjs');
const seedScript = () => read('prisma/seed.mjs');
const rbacBaseline = () => read('prisma/rbac-baseline.mjs');
const rbacPolicy = () => read('prisma/rbac-baseline-policy.mjs');
const rbacEntryPoint = () => read('prisma/apply-rbac-baseline.mjs');
const demoPolicy = () => read('prisma/demo-staging-policy.mjs');
const demoEntryPoint = () => read('prisma/seed-demo-staging.mjs');
const apiPackageJson = () => JSON.parse(read('package.json'));

// The provisioning guards document themselves in comments, and those comments
// legitimately name the things the code must not do. Assertions that forbid a
// word or an identifier therefore run against the comment-stripped source.
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^[ \t]*\/\/.*$/gmu, '');

const rbacBaselineCode = () => stripComments(rbacBaseline());
const rbacEntryPointCode = () => stripComments(rbacEntryPoint());
const rbacPolicyCode = () => stripComments(rbacPolicy());
const demoPolicyCode = () => stripComments(demoPolicy());
const demoEntryPointCode = () => stripComments(demoEntryPoint());

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

  it('keeps the seed free of any privileged user or stored admin credential', () => {
    const source = seedScript();
    // The RBAC baseline is the seed's whole job: no privileged identity is ever
    // created implicitly, so a database can be seeded without a back door.
    expect(source).not.toMatch(/user\.(create|upsert)/);
    expect(source).not.toMatch(/passwordHash/);
    expect(source).not.toMatch(/password\s*:/);
    expect(source).not.toMatch(/secret\s*:/);
    expect(source).not.toMatch(/const\s+(devCode|password)\s*=\s*['"]/i);
    expect(source).toMatch(/No privileged user is seeded/);
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

describe('canonical RBAC baseline path', () => {
  it('is the declared prerequisite of first-admin bootstrap and is checked before any prompt', () => {
    const source = bootstrapScript();
    expect(source).toMatch(/assertSystemAdminRolePresent\s*\(/);
    // The check must run before the email/password/TOTP questions, otherwise an
    // operator types a password into a run that cannot succeed.
    expect(source.indexOf('await assertSystemAdminRolePresent(prisma)')).toBeLessThan(
      source.indexOf('await hidden('),
    );
    expect(source.indexOf('await assertSystemAdminRolePresent(prisma)')).toBeLessThan(
      source.indexOf('Administrator email:'),
    );
  });

  it('is wired to an explicit, environment-fenced command', () => {
    const scripts = apiPackageJson().scripts;
    expect(scripts['rbac:baseline']).toBe('node prisma/apply-rbac-baseline.mjs');
    expect(scripts['demo:staging']).toBe('node prisma/seed-demo-staging.mjs');
    expect(scripts['auth:bootstrap']).toBe('node scripts/bootstrap-admin.mjs');
  });

  it('fails closed outside staging and production and needs an explicit opt-in', () => {
    const policy = rbacPolicyCode();
    expect(policy).toContain('ALLOW_RBAC_BASELINE');
    expect(policy).toMatch(/new Set\(\["staging", "production"\]\)/);
    expect(policy).toContain('RBAC_BASELINE_CONFIRM_PRODUCTION');
  });

  it('never imports, relaxes or bypasses the development seed guard', () => {
    expect(rbacPolicyCode()).not.toContain('seed-policy');
    expect(rbacPolicyCode()).not.toContain('ALLOW_DATABASE_SEED');
    expect(demoPolicyCode()).not.toContain('seed-policy');
    expect(demoEntryPointCode()).not.toContain('seed-policy');
    expect(demoEntryPointCode()).not.toContain('./seed.mjs');
    // The development seed guard itself is untouched by this path.
    expect(seedScript()).toContain('assertSeedEnvironment');
  });

  it('creates no user, credential or demo row on any provisioning path', () => {
    for (const source of [rbacBaselineCode(), rbacEntryPointCode()]) {
      expect(source).not.toMatch(/\buser\.(create|upsert|update|delete)/);
      expect(source).not.toMatch(/password/i);
      expect(source).not.toMatch(/seed_demo_|DEMO_CATALOG|WH-DEMO|demo-brand/);
    }
  });

  it('exposes both a read-only verification gate and an audited apply mode', () => {
    const entry = rbacEntryPoint();
    expect(entry).toContain('--check');
    expect(entry).toContain('--apply');
    expect(entry).toContain('mutually exclusive');
    expect(rbacBaseline()).toMatch(/export async function inspectRbacBaseline/);
    expect(rbacBaseline()).toMatch(/auditMode === "append"/);
  });

  it('fences demo data to staging only and fabricates no payment or SMS success', () => {
    expect(demoPolicy()).toMatch(/only when NODE_ENV=staging/);
    expect(demoPolicy()).toContain('ALLOW_DEMO_STAGING_DATA');
    const demo = stripComments(read('prisma/demo-catalog.mjs'));
    for (const forbidden of ['order.', 'payment.', 'sms.', 'notification.']) {
      expect(demo).not.toContain(`transaction.${forbidden}`);
    }
  });

  it('keeps the shared canonical registry free of any environment or policy concern', () => {
    const source = rbacBaseline();
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toContain('assertSeedEnvironment');
    expect(source).not.toContain('ALLOW_DATABASE_SEED');
  });
});