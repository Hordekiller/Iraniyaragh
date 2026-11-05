/*
 * Test-database-only fixture: mints a session directly through the real
 * AuthSessionService (no HTTP). Used because the customer OTP is random,
 * hash-only and cannot be read by a browser test. Refuses non-test databases.
 * Usage: node mint-session.cjs customer|staff <userId> [backdateLastUsedMinutes]
 * Output (JSON): { refreshToken, csrfToken, accessToken, sessionId }
 */
const path = require('node:path');
const api = path.resolve(__dirname, '../../apps/api');
require(path.join(api, 'node_modules/reflect-metadata'));
const { NestFactory } = require(path.join(api, 'node_modules/@nestjs/core'));
(async () => {
  if (process.env.NODE_ENV !== 'test' || !/_test|sf_test/.test(process.env.DATABASE_URL ?? '')) throw new Error('test database only');
  const [kind, userId, backdate] = process.argv.slice(2);
  const { AppModule } = require(path.join(api, 'dist/src/app.module.js'));
  const { AuthSessionService } = require(path.join(api, 'dist/src/modules/auth/auth-session.service.js'));
  const { PrismaService } = require(path.join(api, 'dist/src/database/prisma.service.js'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sessions = app.get(AuthSessionService, { strict: false });
  const prisma = app.get(PrismaService, { strict: false });
  const level = kind === 'staff' ? 'STAFF_MFA' : 'CUSTOMER_OTP';
  const issued = await sessions.createSession({ userId, authenticationLevel: level, authenticatedAt: new Date(Date.now() - 1000) });
  if (backdate) await prisma.session.update({ where: { id: issued.sessionId }, data: { lastUsedAt: new Date(Date.now() - Number(backdate) * 60000) } });
  console.log(JSON.stringify({ refreshToken: issued.refreshToken, csrfToken: issued.csrfToken, accessToken: issued.accessToken, sessionId: issued.sessionId }));
  await app.close();
})().catch(e => { console.error(e.message); process.exit(1); });
