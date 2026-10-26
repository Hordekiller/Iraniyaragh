import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signInStaff } from './staff-auth';

test('downloads private CSV/XLSX artifacts from the durable shared worker', async ({
  request,
  page,
  context,
}, testInfo) => {
  const { accessToken } = await signInStaff(request);
  const authorization = `Bearer ${accessToken}`;
  await context.setExtraHTTPHeaders({ authorization });
  const baseURL = process.env.API_E2E_URL ?? 'http://127.0.0.1:4000';
  const definition = {
    kind: 'orders',
    filters: {
      from: '2026-01-01T00:00:00.000Z',
      toExclusive: '2026-01-02T00:00:00.000Z',
      customerId: `isolated-empty-${randomUUID()}`,
    },
    maxRows: 20,
  };
  for (const format of ['csv', 'xlsx']) {
    const key = `report-browser-${randomUUID()}`;
    const ask = await request.post('/api/v1/reports/admin/exports', {
      headers: { authorization, 'idempotency-key': key },
      data: { definition, format },
    });
    expect(ask.status()).toBe(200);
    expect(ask.headers()['cache-control']).toBe('no-store');
    const { exportId } = (await ask.json()).data;
    let sha256 = '';
    await expect
      .poll(
        async () => {
          const poll = await request.get(`/api/v1/reports/admin/exports/${exportId}`, {
            headers: { authorization },
          });
          expect(poll.status()).toBe(200);
          const data = (await poll.json()).data;
          sha256 = data.sha256;
          return data.status;
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toBe('READY');
    const snapshot = await request.get(`/api/v1/reports/admin/exports/${exportId}/snapshot`, {
      headers: { authorization },
    });
    expect(snapshot.status()).toBe(200);
    const table = (await snapshot.json()).data;
    expect(table.definition).toEqual(definition);
    expect(table.rows).toEqual([]);
    expect(table.headers).toHaveLength(10);
    expect(table.sha256).toMatch(/^[a-f0-9]{64}$/u);
    await page.setContent(
      `<a href="${baseURL}/api/v1/reports/admin/exports/${exportId}/artifact">download</a>`,
    );
    const pending = page.waitForEvent('download');
    await page.getByRole('link', { name: 'download', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`^iranyaragh-orders-\\d{8}\\.${format}$`));
    const output = testInfo.outputPath(`isolated-report.${format}`);
    await download.saveAs(output);
    const bytes = await readFile(output);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
    if (format === 'csv')
      expect(bytes.toString('utf8')).toBe(
        `\ufeff${table.headers.map((cell: string) => `"${cell}"`).join(',')}\r\n`,
      );
    else expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const replay = await request.post('/api/v1/reports/admin/exports', {
      headers: { authorization, 'idempotency-key': key },
      data: { definition, format },
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data).toMatchObject({ exportId, status: 'READY', replayed: true, sha256 });
  }
});
