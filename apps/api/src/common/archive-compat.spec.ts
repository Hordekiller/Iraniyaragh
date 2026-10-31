import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';

// Resolve the actual transitive dependencies used by ExcelJS under pnpm too.
// A clean audit alone cannot detect incompatible matcher/archive major APIs.
const apiRequire = createRequire(resolve(process.cwd(), 'package.json'));
const excelRequire = createRequire(apiRequire.resolve('exceljs'));
const archiverRequire = createRequire(excelRequire.resolve('archiver'));
const utils = archiverRequire('archiver-utils') as {
  file: { expand(options: { cwd: string; dot: boolean }, patterns: string[]): string[] };
};
type Archive = Transform & {
  glob(pattern: string, options: Record<string, unknown>): Archive;
  directory(source: string, destination: string): Archive;
  finalize(): Promise<void>;
};
const archiver = excelRequire('archiver') as (format: string) => Archive;
const unzipper = excelRequire('unzipper') as {
  Open: { buffer(bytes: Buffer): Promise<{
    files: { path: string; type: string; buffer(): Promise<Buffer> }[];
  }> };
};

describe('ExcelJS archive dependency compatibility', () => {
  const directories: string[] = [];
  async function fixtureDirectory() {
    const directory = await mkdtemp(join(tmpdir(), 'ir-archive-fixture-'));
    directories.push(directory);
    return directory;
  }
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('expands wildcards and exclusions through archiver-utils using the patched glob API', async () => {
    const directory = await fixtureDirectory();
    await mkdir(join(directory, 'nested'));
    await Promise.all(['a.txt', '.hidden.txt', 'nested/نمونه.txt', 'nested/skip.txt'].map(
      (name) => writeFile(join(directory, name), 'isolated fixture'),
    ));
    expect(utils.file.expand({ cwd: directory, dot: true }, ['**/*.txt', '!**/skip.txt']).sort())
      .toEqual(['.hidden.txt', 'a.txt', 'nested/نمونه.txt']);
  });

  it('creates and reads ZIPs with Unicode paths, dotfiles, recursive directories and glob exclusions', async () => {
    const directory = await fixtureDirectory();
    await mkdir(join(directory, 'nested'));
    await Promise.all(['a.txt', '.hidden.txt', 'nested/نمونه.txt', 'nested/skip.txt'].map(
      (name) => writeFile(join(directory, name), `fixture:${name}`),
    ));
    const archive = archiver('zip');
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('warning', (error: Error) => archive.destroy(error));
    const completion = finished(archive);
    archive.glob('**/*.txt', { cwd: directory, dot: true, nodir: true, ignore: '**/skip.txt' });
    archive.directory(join(directory, 'nested'), 'directory-copy');
    await archive.finalize();
    await completion;
    const zip = await unzipper.Open.buffer(Buffer.concat(chunks));
    const files = zip.files.filter((entry) => entry.type === 'File');
    expect(files.map((entry) => entry.path).sort()).toEqual([
      '.hidden.txt', 'a.txt', 'directory-copy/skip.txt', 'directory-copy/نمونه.txt', 'nested/نمونه.txt',
    ]);
    for (const entry of files) {
      const original = entry.path.replace('directory-copy/', 'nested/');
      expect((await entry.buffer()).toString('utf8')).toBe(`fixture:${original}`);
    }
  });

  it('round trips streaming XLSX writes and reads without losing identifiers, styles or exact money text', async () => {
    const filename = join(await fixtureDirectory(), 'isolated-fixture.xlsx');
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename, useSharedStrings: true, useStyles: true });
    const sheet = workbook.addWorksheet('محصول آزمایشی');
    sheet.addRow(['SKU', 'عنوان', 'IRR', 'costPrice']).commit();
    const row = sheet.addRow(['FIXTURE-00123', 'محصول آزمایشی', '900719925474099312345', null]);
    row.getCell(3).numFmt = '@';
    row.getCell(2).font = { bold: true };
    row.commit();
    await workbook.commit();

    const restored = new ExcelJS.Workbook();
    await restored.xlsx.readFile(filename);
    const restoredSheet = restored.getWorksheet('محصول آزمایشی')!;
    expect(restoredSheet.getRow(2).values).toEqual([
      undefined, 'FIXTURE-00123', 'محصول آزمایشی', '900719925474099312345',
    ]);
    expect(restoredSheet.getCell('B2').font.bold).toBe(true);
    expect(restoredSheet.getCell('C2').numFmt).toBe('@');
    expect(restoredSheet.getCell('D2').value).toBeNull();

    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filename, {
      entries: 'emit', sharedStrings: 'cache', worksheets: 'emit', styles: 'cache', hyperlinks: 'ignore',
    });
    const rows: ExcelJS.CellValue[][] = [];
    for await (const worksheet of reader) {
      for await (const streamedRow of worksheet) {
        rows.push([streamedRow.getCell(1).value, streamedRow.getCell(2).value, streamedRow.getCell(3).value]);
      }
    }
    expect(rows).toEqual([
      ['SKU', 'عنوان', 'IRR'],
      ['FIXTURE-00123', 'محصول آزمایشی', '900719925474099312345'],
    ]);
  });
});
