import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  alternateMerge,
  booklet,
  bookletOrder,
  combineSinglePage,
  composePages,
  cropPages,
  deletePages,
  dividePages,
  duplexCollate,
  extractPages,
  fixPageSize,
  getPageDimensions,
  groupsEveryN,
  groupsFromCutPoints,
  groupsIntoParts,
  insertBlankPages,
  mergePdfs,
  nUp,
  overlayPdf,
  posterize,
  reversePages,
  rotateCustom,
  rotatePages,
  splitByGroups,
} from '../ops';

/** Tạo PDF thử: mỗi trang có chiều rộng = 100 + số trang (để nhận diện thứ tự) */
async function makePdf(count: number, opts: { rotate?: number; size?: [number, number] } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= count; i++) {
    const page = doc.addPage(opts.size ?? [100 + i, 200]);
    if (opts.rotate) page.setRotation(degrees(opts.rotate));
  }
  return doc.save();
}

async function widths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getWidth()));
}

describe('gộp & tách', () => {
  it('gộp nhiều tệp theo thứ tự và dải trang', async () => {
    const a = await makePdf(3);
    const b = await makePdf(2);
    const out = await mergePdfs([{ bytes: a, pages: [3, 1] }, { bytes: b }]);
    expect(await widths(out)).toEqual([103, 101, 101, 102]);
  });

  it('nhóm trang', () => {
    expect(groupsEveryN(5, 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(groupsIntoParts(7, 3)).toEqual([[1, 2, 3], [4, 5], [6, 7]]);
    expect(groupsFromCutPoints(6, [2, 4, 9])).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('tách thành nhiều tệp', async () => {
    const files = await splitByGroups(await makePdf(5), [[1, 2], [5]], 'doc');
    expect(files.map((f) => f.name)).toEqual(['doc_01.pdf', 'doc_02.pdf']);
    expect(await widths(files[1].bytes)).toEqual([105]);
  });

  it('trích xuất trang', async () => {
    expect(await widths(await extractPages(await makePdf(4), [4, 2]))).toEqual([104, 102]);
  });

  it('trộn xen kẽ có đảo ngược', async () => {
    const out = await alternateMerge([{ bytes: await makePdf(3) }, { bytes: await makePdf(2), reverse: true }]);
    expect(await widths(out)).toEqual([101, 102, 102, 101, 103]);
  });

  it('ghép scan 2 mặt', async () => {
    // Mặt trước 1,2,3 ; mặt sau (ngược) 6,5,4 -> 1,4,2,5,3,6
    const out = await duplexCollate(await makePdf(6), { reverseBacks: true });
    expect(await widths(out)).toEqual([101, 106, 102, 105, 103, 104]);
    await expect(duplexCollate(await makePdf(5), { reverseBacks: true })).rejects.toThrow(/số lẻ/);
  });

  it('phủ lớp lên/dưới không lỗi', async () => {
    const over = await overlayPdf(await makePdf(3), await makePdf(1), { position: 'over', repeat: 'first', fit: 'fit' });
    const under = await overlayPdf(await makePdf(3), await makePdf(2), { position: 'under', repeat: 'cycle', fit: 'stretch' });
    expect(await widths(over)).toEqual([101, 102, 103]);
    expect(await widths(under)).toEqual([101, 102, 103]);
  });
});

describe('thao tác trang', () => {
  it('xóa trang, không cho xóa hết', async () => {
    expect(await widths(await deletePages(await makePdf(4), [2, 3]))).toEqual([101, 104]);
    await expect(deletePages(await makePdf(2), [1, 2])).rejects.toThrow();
  });

  it('dựng lại trang (sắp xếp, nhân bản, trang trắng, nhiều tệp)', async () => {
    const out = await composePages(
      [await makePdf(2), await makePdf(3)],
      [
        { source: 1, page: 3 },
        { source: 0, page: 1, rotation: 90 },
        { source: 0, page: null, blankSize: [50, 50] },
        { source: 0, page: 1 },
      ]
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([103, 101, 50, 101]);
    expect(doc.getPage(1).getRotation().angle).toBe(90);
  });

  it('chèn trang trắng', async () => {
    expect(await widths(await insertBlankPages(await makePdf(3), { position: { kind: 'after', page: 1 }, count: 2 }))).toEqual([
      101, 101, 101, 102, 103,
    ]);
    const every = await insertBlankPages(await makePdf(4), { position: { kind: 'every', step: 2 }, count: 1, size: [10, 10] });
    expect(await widths(every)).toEqual([101, 102, 10, 103, 104, 10]);
  });

  it('đảo ngược và xoay', async () => {
    expect(await widths(await reversePages(await makePdf(3)))).toEqual([103, 102, 101]);
    const rotated = await PDFDocument.load(await rotatePages(await makePdf(2, { rotate: 90 }), { 1: 90, 2: -90 }));
    expect(rotated.getPages().map((p) => p.getRotation().angle)).toEqual([180, 0]);
  });

  it('xoay góc tùy ý', async () => {
    const out = await PDFDocument.load(await rotateCustom(await makePdf(2, { size: [100, 200] }), { angle: 90, keepSize: false }));
    const p = out.getPage(0);
    expect(Math.round(p.getWidth())).toBe(200);
    expect(Math.round(p.getHeight())).toBe(100);
  });

  it('chia trang theo chiều hiển thị', async () => {
    const out = await PDFDocument.load(await dividePages(await makePdf(1, { size: [200, 100] }), { direction: 'vertical', parts: 2 }));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getMediaBox()).toMatchObject({ x: 0, width: 100 });
    expect(out.getPage(1).getMediaBox()).toMatchObject({ x: 100, width: 100 });
    // Trang xoay 90°: phần bên trái khi hiển thị ứng với y nhỏ
    const rot = await PDFDocument.load(
      await dividePages(await makePdf(1, { size: [100, 200], rotate: 90 }), { direction: 'vertical', parts: 2 })
    );
    expect(rot.getPage(0).getMediaBox()).toMatchObject({ y: 0, height: 100 });
  });

  it('ghép thành 1 trang dài', async () => {
    const { bytes } = await combineSinglePage(await makePdf(3, { size: [100, 200] }), {
      direction: 'vertical',
      gapMm: 0,
      separator: false,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(Math.round(doc.getPage(0).getHeight())).toBe(600);
  });
});

describe('bố cục & in ấn', () => {
  it('cắt lề theo chiều hiển thị', async () => {
    const doc = await PDFDocument.load(
      await cropPages(await makePdf(1, { size: [200, 300] }), { margins: { top: 10, right: 20, bottom: 30, left: 40 } })
    );
    expect(doc.getPage(0).getCropBox()).toMatchObject({ x: 40, y: 30, width: 140, height: 260 });
  });

  it('n trang / tờ', async () => {
    const doc = await PDFDocument.load(
      await nUp(await makePdf(5, { size: [100, 200] }), {
        perSheet: 4,
        sheet: null,
        marginMm: 0,
        gapMm: 0,
        border: true,
        order: 'row',
      })
    );
    expect(doc.getPageCount()).toBe(2);
  });

  it('thứ tự sách gấp', () => {
    expect(bookletOrder(8)).toEqual([
      [8, 1],
      [2, 7],
      [6, 3],
      [4, 5],
    ]);
    expect(bookletOrder(3)).toEqual([
      [null, 1],
      [2, 3],
    ]);
  });

  it('sách gấp và poster', async () => {
    const b = await PDFDocument.load(await booklet(await makePdf(5), { sheet: null, binding: 'left', creepMarks: true }));
    expect(b.getPageCount()).toBe(4);
    const p = await PDFDocument.load(
      await posterize(await makePdf(1), { cols: 2, rows: 3, sheet: [595, 842], overlapMm: 5, cutMarks: true })
    );
    expect(p.getPageCount()).toBe(6);
  });

  it('chuẩn hóa khổ giấy và đọc kích thước', async () => {
    const doc = await PDFDocument.load(
      await fixPageSize(await makePdf(2, { size: [300, 100] }), {
        size: [595, 842],
        matchOrientation: true,
        mode: 'fit',
        marginMm: 0,
      })
    );
    expect(Math.round(doc.getPage(0).getWidth())).toBe(842);
    const dims = await getPageDimensions(await makePdf(1, { size: [100, 200], rotate: 90 }));
    expect(dims[0]).toMatchObject({ width: 200, height: 100, rotation: 90 });
  });
});

