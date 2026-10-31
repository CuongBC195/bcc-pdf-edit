import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { runQpdf, setQpdfWasmLocator } from '../qpdf';

beforeAll(() => {
  setQpdfWasmLocator(async () => path.resolve('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
});

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  return doc.save();
}

describe('qpdf', () => {
  it('mã hóa rồi giải mã bằng mật khẩu', async () => {
    const enc = await runQpdf(await makePdf(), ['--encrypt', 'user1', 'owner1', '256', '--']);
    expect(Buffer.from(enc.output).toString('latin1')).toContain('/Encrypt');
    await expect(runQpdf(enc.output, ['--password=sai', '--decrypt'])).rejects.toThrow(/Mật khẩu/);
    const dec = await runQpdf(enc.output, ['--password=user1', '--decrypt']);
    const doc = await PDFDocument.load(dec.output);
    expect(doc.getPageCount()).toBe(2);
  });

  it('linearize', async () => {
    const out = await runQpdf(await makePdf(), ['--linearize']);
    expect(Buffer.from(out.output).toString('latin1')).toContain('/Linearized');
  });
});

