import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import helmet from 'helmet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { helmetOptions } from './security-headers';

describe('API security headers', () => {
  let server: Server;
  let base: string;
  const protect = helmet(helmetOptions);

  beforeAll(async () => {
    server = createServer((req, res) => {
      protect(req, res, () => {
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('leaves Strict-Transport-Security to the TLS-terminating proxy', async () => {
    const response = await fetch(`${base}/ping`);
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('keeps the other helmet protections', async () => {
    const response = await fetch(`${base}/ping`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).not.toBeNull();
  });
});
