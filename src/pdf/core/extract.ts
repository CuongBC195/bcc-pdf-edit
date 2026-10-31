/**
 * Trích xuất văn bản có cấu trúc (đoạn, tiêu đề, bảng biểu), hình ảnh và bộ mã hóa BMP/TIFF/SVG từ PDF.
 * Dùng chung cho: PDF sang Text/Markdown/JSON/CSV/AI, Trích xuất bảng, Trích xuất ảnh, PDF sang Word/Excel.
 */
import { PDFDict, PDFName, PDFRawStream } from 'pdf-lib';
import * as UTIF from 'utif';
import { getPdfDocumentProxy } from '../../services/thumbnailService';
import { loadPdf, type OutputFile, type PdfInput } from './ops';
import { renderAtDpi } from './raster';

export interface TextSpan {
  str: string;
  x: number;
  width: number;
  size: number;
}

export interface PageLine {
  y: number;
  size: number;
  spans: TextSpan[];
  text: string;
  isHeading: boolean;
}

export interface StructuredPage {
  pageNumber: number;
  width: number;
  height: number;
  lines: PageLine[];
  tables: string[][][];
}

export async function extractStructuredPages(buffer: ArrayBuffer, targetPages?: number[]): Promise<StructuredPage[]> {
  const pdf = await getPdfDocumentProxy(buffer);
  const pageNos =
    targetPages && targetPages.length ? targetPages : Array.from({ length: pdf.numPages }, (_, i) => i + 1);

  const rawPages: { pageNumber: number; width: number; height: number; lines: Omit<PageLine, 'isHeading'>[] }[] = [];
  const allSizes: number[] = [];

  for (const pNo of pageNos) {
    if (pNo < 1 || pNo > pdf.numPages) continue;
    const page = await pdf.getPage(pNo);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const rowBuckets: { y: number; size: number; spans: TextSpan[] }[] = [];

    for (const raw of tc.items as any[]) {
      const str = String(raw.str ?? '');
      if (!str.trim() || !raw.transform) continue;
      const [a, b, , , e, f] = raw.transform as number[];
      const size = Math.max(6, Math.round(Math.hypot(a, b) * 2) / 2);
      const width = Math.max(size * 0.4, Number(raw.width) || str.length * size * 0.5);
      allSizes.push(size);

      let bucket = rowBuckets.find((r) => Math.abs(r.y - f) <= Math.max(3.5, size * 0.32));
      if (!bucket) {
        bucket = { y: f, size, spans: [] };
        rowBuckets.push(bucket);
      } else {
        bucket.size = Math.max(bucket.size, size);
      }
      bucket.spans.push({ str, x: e, width, size });
    }

    rowBuckets.sort((a, b) => b.y - a.y);
    const lines = rowBuckets.map((row) => {
      row.spans.sort((a, b) => a.x - b.x);
      // Gộp các mảnh chữ sát nhau trên cùng một cột
      const mergedSpans: TextSpan[] = [];
      for (const sp of row.spans) {
        const prev = mergedSpans[mergedSpans.length - 1];
        if (prev && sp.x <= prev.x + prev.width + Math.max(10, row.size * 0.95)) {
          const gap = sp.x - (prev.x + prev.width);
          prev.str += (gap > row.size * 0.16 ? ' ' : '') + sp.str;
          prev.width = Math.max(prev.x + prev.width, sp.x + sp.width) - prev.x;
        } else {
          mergedSpans.push({ ...sp, str: sp.str.trim() });
        }
      }
      const text = mergedSpans.map((s) => s.str).join('   ').trim();
      return { y: row.y, size: row.size, spans: mergedSpans, text };
    });

    rawPages.push({ pageNumber: pNo, width: vp.width, height: vp.height, lines });
  }

  allSizes.sort((a, b) => a - b);
  const bodySize = allSizes[Math.floor(allSizes.length * 0.5)] || 11;

  return rawPages.map((pg) => {
    const lines: PageLine[] = pg.lines.map((l) => ({
      ...l,
      isHeading: l.size >= bodySize * 1.18 && l.text.length <= 120,
    }));

    // Nhận diện các vùng bảng (2+ dòng liên tiếp có từ 2 cột trở lên)
    const tables: string[][][] = [];
    let currentRun: PageLine[] = [];
    const flushRun = () => {
      if (currentRun.length >= 2) {
        tables.push(alignTableColumns(currentRun));
      }
      currentRun = [];
    };
    for (const ln of lines) {
      if (ln.spans.length >= 2) currentRun.push(ln);
      else flushRun();
    }
    flushRun();

    return { pageNumber: pg.pageNumber, width: pg.width, height: pg.height, lines, tables };
  });
}

function alignTableColumns(lines: PageLine[]): string[][] {
  // Gom tâm trái của các ô để xác định các mốc cột
  const anchors: number[] = [];
  const xs = lines.flatMap((l) => l.spans.map((s) => s.x)).sort((a, b) => a - b);
  for (const x of xs) {
    if (!anchors.length || x - anchors[anchors.length - 1] > 28) anchors.push(x);
  }
  return lines.map((l) => {
    const row = Array.from({ length: anchors.length }, () => '');
    for (const sp of l.spans) {
      let bestIdx = 0;
      let bestDist = Infinity;
      anchors.forEach((ax, i) => {
        const d = Math.abs(sp.x - ax);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      row[bestIdx] = row[bestIdx] ? `${row[bestIdx]} ${sp.str}` : sp.str;
    }
    return row;
  });
}

export function rowsToCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? '').replace(/"/g, '""');
          return /[",\n;]/.test(s) ? `"${s}"` : s;
        })
        .join(',')
    )
    .join('\n');
}

export function rowsToMarkdownTable(rows: string[][]): string {
  if (!rows.length) return '';
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const norm = (r: string[]) => Array.from({ length: cols }, (_, i) => (r[i] ?? '').replace(/\|/g, '\\|'));
  const header = `| ${norm(rows[0]).join(' | ')} |`;
  const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
  const body = rows.slice(1).map((r) => `| ${norm(r).join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

// ---------------------------------------------------------------------------
// Bộ mã hóa ảnh BMP 24-bit, TIFF, SVG từ HTMLCanvasElement
// ---------------------------------------------------------------------------
export function encodeBmpFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const rowStride = (w * 3 + 3) & ~3;
  const pixelBytes = rowStride * h;
  const fileSize = 54 + pixelBytes;
  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);
  // BITMAPFILEHEADER (14 bytes)
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true); // dương = bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);

  for (let y = 0; y < h; y++) {
    const srcRow = h - 1 - y;
    const dstOffset = 54 + y * rowStride;
    for (let x = 0; x < w; x++) {
      const si = (srcRow * w + x) * 4;
      const di = dstOffset + x * 3;
      out[di] = rgba[si + 2];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si];
    }
  }
  return out;
}

export function encodeTiffFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d')!;
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const buf = UTIF.encodeImage(rgba.buffer, canvas.width, canvas.height);
  return new Uint8Array(buf);
}

export function encodeSvgFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL('image/png');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">\n  <image width="${canvas.width}" height="${canvas.height}" href="${dataUrl}" />\n</svg>\n`;
  return new TextEncoder().encode(svg);
}

// ---------------------------------------------------------------------------
// Trích xuất ảnh nhúng trong PDF (extract-images)
// ---------------------------------------------------------------------------
export async function extractImagesFromPdf(
  input: PdfInput,
  buffer: ArrayBuffer,
  targetPages?: number[]
): Promise<OutputFile[]> {
  const doc = await loadPdf(input);
  const pages = doc.getPages();
  const pageNos =
    targetPages && targetPages.length ? targetPages : Array.from({ length: pages.length }, (_, i) => i + 1);
  const out: OutputFile[] = [];

  for (const pNo of pageNos) {
    const page = pages[pNo - 1];
    if (!page) continue;
    const res = page.node.Resources();
    const xObj = res?.lookup(PDFName.of('XObject'));
    let foundOnPage = 0;
    if (xObj instanceof PDFDict) {
      for (const [, ref] of xObj.entries()) {
        const obj = doc.context.lookup(ref);
        if (!(obj instanceof PDFRawStream)) continue;
        const subtype = obj.dict.get(PDFName.of('Subtype'));
        if (subtype?.toString() !== '/Image') continue;
        const filter = obj.dict.get(PDFName.of('Filter'))?.toString() ?? '';
        if (filter.includes('DCTDecode')) {
          foundOnPage++;
          out.push({
            name: `trang-${pNo}_anh-${foundOnPage}.jpg`,
            bytes: obj.getContents(),
          });
        }
      }
    }
    // Nếu trang không dùng JPEG nguyên khối (hoặc là ảnh nén Flate/JBIG2/vẽ vector), xuất ảnh trang độ nét cao
    if (foundOnPage === 0) {
      const canvas = await renderAtDpi(buffer, pNo, 150);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh.'))), 'image/png');
      });
      out.push({
        name: `trang-${pNo}.png`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }
  }
  return out;
}

