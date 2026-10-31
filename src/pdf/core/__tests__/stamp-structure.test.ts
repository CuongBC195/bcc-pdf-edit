import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { setFontLoader } from '../fonts';
import { setQpdfWasmLocator } from '../qpdf';
import { addBackgroundColor, addBates, addHeaderFooter, addPageNumbers, addWatermark, batesLabel } from '../stamp';
import {
  addAttachments,
  countAnnotations,
  listAttachments,
  readInfo,
  removeAnnotations,
  removeMetadata,
  rewriteAttachments,
  sanitizePdf,
  setPageLabels,
  treeFromFlat,
  writeMetadata,
  writeOutline,
} from '../structure';

beforeAll(() => {
  setQpdfWasmLocator(async () => path.resolve('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm'));
  setFontLoader(async (file) => new Uint8Array(fs.readFileSync(path.resolve('public/fonts', file))));
});

async function makePdf(count = 3, rotate = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) {
    const p = doc.addPage([300, 400]);
    if (rotate) p.setRotation(degrees(rotate));
  }
  return doc.save();
}

const style = { family: 'sans' as const, size: 11, color: [0, 0, 0] as [number, number, number] };

describe('chèn chữ tiếng Việt', () => {
  it('đánh số trang, đầu chân trang, Bates, hình mờ, màu nền', async () => {
    const base = await makePdf(3, 90);
    const numbered = await addPageNumbers(base, {
      format: 'Trang {n}/{total}',
      v: 'bottom',
      h: 'center',
      mirror: true,
      marginMm: 10,
      startNumber: 1,
      fromPage: 2,
      style,
    });
    expect((await PDFDocument.load(numbered)).getPageCount()).toBe(3);
    const hf = await addHeaderFooter(base, {
      header: { left: 'Cơ quan', center: '', right: '{date}' },
      footer: { left: '', center: 'Trang {n}', right: '' },
      marginMm: 10,
      style,
      line: true,
    });
    expect(hf.byteLength).toBeGreaterThan(base.byteLength);
    const bates = await addBates(base, { prefix: 'HS-', suffix: '', start: 5, digits: 4, v: 'bottom', h: 'right', marginMm: 8, style }, 5);
    expect(bates.next).toBe(8);
    expect(batesLabel({ prefix: 'A', suffix: 'Z', digits: 3 }, 7)).toBe('A007Z');
    const wm = await addWatermark(base, {
      kind: 'text',
      text: 'BẢN SAO',
      style: { ...style, size: 48 },
      imageScale: 40,
      angle: 45,
      opacity: 0.2,
      layout: 'tile',
      tileGap: 40,
      position: 'under',
    });
    expect(wm.byteLength).toBeGreaterThan(base.byteLength);
    expect((await addBackgroundColor(base, [1, 1, 0.8])).byteLength).toBeGreaterThan(0);
  });
});

describe('cấu trúc', () => {
  it('metadata', async () => {
    const out = await writeMetadata(await makePdf(), { title: 'Báo cáo', author: 'Nguyễn Văn A', keywords: 'a, b' });
    const info = await readInfo(out);
    expect(info.title).toBe('Báo cáo');
    expect(info.author).toBe('Nguyễn Văn A');
    const clean = await readInfo(await removeMetadata(out, { removeId: true }));
    expect(clean.title).toBe('');
    expect(clean.author).toBe('');
  });

  it('nhãn trang và bookmark', async () => {
    const labelled = await setPageLabels(await makePdf(5), [
      { startPage: 1, style: 'r', prefix: '', start: 1 },
      { startPage: 3, style: 'D', prefix: 'P-', start: 1 },
    ]);
    expect((await PDFDocument.load(labelled)).catalog.get(PDFName.of('PageLabels'))).toBeTruthy();
    const tree = treeFromFlat([
      { title: 'Chương 1', page: 1, level: 0 },
      { title: 'Mục 1.1', page: 2, level: 1 },
      { title: 'Chương 2', page: 3, level: 0 },
    ]);
    expect(tree[0].children).toHaveLength(1);
    const outlined = await writeOutline(await makePdf(3), tree);
    expect((await PDFDocument.load(outlined)).catalog.get(PDFName.of('Outlines'))).toBeTruthy();
  });

  it('tệp đính kèm', async () => {
    const withFiles = await addAttachments(await makePdf(1), [
      { name: 'ghi-chu.txt', bytes: new TextEncoder().encode('xin chào'), mimeType: 'text/plain', description: 'Ghi chú' },
      { name: 'b.txt', bytes: new TextEncoder().encode('b') },
    ]);
    const list = await listAttachments(withFiles);
    expect(list.map((a) => a.name).sort()).toEqual(['b.txt', 'ghi-chu.txt']);
    expect(new TextDecoder().decode(list.find((a) => a.name === 'ghi-chu.txt')!.data())).toBe('xin chào');
    const edited = await rewriteAttachments(withFiles, [{ originalName: 'b.txt', newName: 'đổi-tên.txt', description: '' }], true);
    expect((await listAttachments(edited)).map((a) => a.name)).toEqual(['đổi-tên.txt']);
  });

  it('chú thích và làm sạch', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const link = doc.context.register(
      doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], A: { S: 'URI', URI: 'https://example.com' } })
    );
    const note = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [60, 60, 80, 80] }));
    page.node.set(doc.context.obj('Annots') as never, doc.context.obj([link, note]));
    doc.catalog.set(doc.context.obj('OpenAction') as never, doc.context.obj({ S: 'JavaScript', JS: 'app.alert(1)' }));
    const bytes = await doc.save();
    expect(await countAnnotations(bytes)).toEqual({ Link: 1, Text: 1 });
    expect(await countAnnotations(await removeAnnotations(bytes, { types: ['Text'] }))).toEqual({ Link: 1 });
    const { bytes: clean, report } = await sanitizePdf(bytes, {
      javascript: true,
      embeddedFiles: true,
      externalLinks: true,
      metadata: true,
      forms: false,
      annotations: false,
    });
    expect(report.removed.length).toBeGreaterThan(0);
    expect(await countAnnotations(clean)).toEqual({ Text: 1 });
    expect(Buffer.from(clean).toString('latin1')).not.toContain('app.alert');
    expect(Buffer.from(clean).toString('latin1')).not.toContain('example.com');
  });
});
