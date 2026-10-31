/**
 * Chèn chữ / hình lên trang: số trang, đầu-chân trang, số Bates, hình mờ, con dấu, màu nền.
 */
import { PDFArray, PDFDocument, PDFName, PDFPage, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { embedFont, styleOf, type FontFamily } from './fonts';
import {
  anchorBox,
  drawRotatedImage,
  drawRotatedText,
  drawTextBox,
  fillTokens,
  inVisualSpace,
  toColor,
  type HPos,
  type Rgb,
  type VPos,
} from './draw';
import { MM_TO_PT } from './paper';
import { loadPdf, savePdf, type PdfInput } from './ops';

export interface TextStyle {
  family: FontFamily;
  size: number;
  color: Rgb;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
}

function targetsOf(doc: PDFDocument, pages?: number[]): Set<number> {
  return new Set(pages && pages.length ? pages : doc.getPageIndices().map((i) => i + 1));
}

async function fontFor(doc: PDFDocument, s: TextStyle): Promise<PDFFont> {
  return embedFont(doc, s.family, styleOf(s.bold, s.italic));
}

/** Vẽ 1 dòng chữ tại vị trí 9 ô của trang */
function drawAt(page: PDFPage, text: string, font: PDFFont, s: TextStyle, pos: { v: VPos; h: HPos }, marginPt: number) {
  if (!text) return;
  inVisualSpace(page, (geo) => {
    const lines = text.split('\n');
    const w = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, s.size)));
    const h = lines.length * s.size * 1.25;
    const { x, top } = anchorBox(geo, pos, w, h, marginPt);
    drawTextBox(page, text, { x, top, width: w + 1, font, size: s.size, color: s.color, opacity: s.opacity, align: pos.h, noWrap: true });
  });
}

// ---------------------------------------------------------------------------
// Đánh số trang
// ---------------------------------------------------------------------------
export interface PageNumberOptions {
  /** Mẫu: {n} số trang, {total} tổng số trang */
  format: string;
  v: VPos;
  h: HPos;
  /** Đối xứng trang chẵn/lẻ (in 2 mặt): trang chẵn lật trái/phải */
  mirror: boolean;
  marginMm: number;
  startNumber: number;
  /** Trang bắt đầu đánh số (1-based); trang trước đó bỏ qua */
  fromPage: number;
  /** Tổng số tính theo trang được đánh số */
  style: TextStyle;
  pages?: number[];
}

export async function addPageNumbers(input: PdfInput, o: PageNumberOptions, fileName = ''): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const font = await fontFor(doc, o.style);
  const targets = targetsOf(doc, o.pages);
  const pages = doc.getPages();
  const numbered = pages.map((_, i) => i + 1).filter((p) => p >= o.fromPage && targets.has(p));
  const total = numbered.length + o.startNumber - 1;
  numbered.forEach((pageNo, idx) => {
    const n = o.startNumber + idx;
    let h = o.h;
    if (o.mirror && h !== 'center' && n % 2 === 0) h = h === 'left' ? 'right' : 'left';
    drawAt(pages[pageNo - 1], fillTokens(o.format, { n, total, file: fileName }), font, o.style, { v: o.v, h }, o.marginMm * MM_TO_PT);
  });
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// Đầu trang / chân trang
// ---------------------------------------------------------------------------
export interface HeaderFooterOptions {
  header: { left: string; center: string; right: string };
  footer: { left: string; center: string; right: string };
  marginMm: number;
  style: TextStyle;
  line: boolean;
  pages?: number[];
}

export async function addHeaderFooter(input: PdfInput, o: HeaderFooterOptions, fileName = ''): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const font = await fontFor(doc, o.style);
  const targets = targetsOf(doc, o.pages);
  const pages = doc.getPages();
  const margin = o.marginMm * MM_TO_PT;
  pages.forEach((page, i) => {
    if (!targets.has(i + 1)) return;
    const ctx = { n: i + 1, total: pages.length, file: fileName };
    (['left', 'center', 'right'] as const).forEach((h) => {
      drawAt(page, fillTokens(o.header[h], ctx), font, o.style, { v: 'top', h }, margin);
      drawAt(page, fillTokens(o.footer[h], ctx), font, o.style, { v: 'bottom', h }, margin);
    });
    if (o.line) {
      inVisualSpace(page, (geo) => {
        const color = toColor(o.style.color);
        const hasHeader = Object.values(o.header).some(Boolean);
        const hasFooter = Object.values(o.footer).some(Boolean);
        const lh = o.style.size * 1.25;
        if (hasHeader) {
          const y = geo.height - margin - lh - 2;
          page.drawLine({ start: { x: margin, y }, end: { x: geo.width - margin, y }, thickness: 0.6, color, opacity: o.style.opacity });
        }
        if (hasFooter) {
          const y = margin + lh + 2;
          page.drawLine({ start: { x: margin, y }, end: { x: geo.width - margin, y }, thickness: 0.6, color, opacity: o.style.opacity });
        }
      });
    }
  });
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// Số Bates (đánh số liên tục qua nhiều tệp)
// ---------------------------------------------------------------------------
export interface BatesOptions {
  prefix: string;
  suffix: string;
  start: number;
  digits: number;
  v: VPos;
  h: HPos;
  marginMm: number;
  style: TextStyle;
}

export function batesLabel(o: Pick<BatesOptions, 'prefix' | 'suffix' | 'digits'>, n: number) {
  return `${o.prefix}${String(n).padStart(Math.max(1, o.digits), '0')}${o.suffix}`;
}

/** Trả về tệp đã đánh số và số tiếp theo */
export async function addBates(input: PdfInput, o: BatesOptions, start: number): Promise<{ bytes: Uint8Array; next: number }> {
  const doc = await loadPdf(input);
  const font = await fontFor(doc, o.style);
  let n = start;
  for (const page of doc.getPages()) {
    drawAt(page, batesLabel(o, n), font, o.style, { v: o.v, h: o.h }, o.marginMm * MM_TO_PT);
    n++;
  }
  return { bytes: await savePdf(doc), next: n };
}

// ---------------------------------------------------------------------------
// Hình mờ (watermark)
// ---------------------------------------------------------------------------
export interface WatermarkOptions {
  kind: 'text' | 'image';
  text: string;
  style: TextStyle;
  image?: { bytes: Uint8Array; type: 'png' | 'jpg' };
  /** Chiều rộng ảnh theo % chiều rộng trang */
  imageScale: number;
  angle: number;
  opacity: number;
  layout: 'center' | 'tile';
  /** Khoảng cách lặp (% kích thước trang) */
  tileGap: number;
  position: 'over' | 'under';
  pages?: number[];
}

export async function addWatermark(input: PdfInput, o: WatermarkOptions): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const targets = targetsOf(doc, o.pages);
  let font: PDFFont | undefined;
  let image: PDFImage | undefined;
  if (o.kind === 'text') font = await fontFor(doc, o.style);
  else if (o.image) image = o.image.type === 'png' ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes);
  else throw new Error('Chưa chọn ảnh làm hình mờ.');

  doc.getPages().forEach((page, i) => {
    if (!targets.has(i + 1)) return;
    inVisualSpace(page, (geo) => {
      const centers: [number, number][] = [];
      if (o.layout === 'center') centers.push([geo.width / 2, geo.height / 2]);
      else {
        const stepX = geo.width * Math.max(0.15, o.tileGap / 100);
        const stepY = geo.height * Math.max(0.1, o.tileGap / 100) * 0.7;
        for (let y = stepY / 2, row = 0; y < geo.height + stepY; y += stepY, row++) {
          for (let x = (row % 2 ? stepX / 2 : 0) + stepX / 4; x < geo.width + stepX; x += stepX) centers.push([x, y]);
        }
      }
      for (const [cx, cy] of centers) {
        if (font) {
          drawRotatedText(page, o.text, { cx, cy, font, size: o.style.size, angle: o.angle, color: o.style.color, opacity: o.opacity });
        } else if (image) {
          const w = (geo.width * o.imageScale) / 100;
          const h = (w * image.height) / image.width;
          drawRotatedImage(page, image, { cx, cy, width: w, height: h, angle: o.angle, opacity: o.opacity });
        }
      }
    });
    if (o.position === 'under') moveLastToFront(page);
  });
  return savePdf(doc);
}

/** Đưa luồng nội dung vừa vẽ xuống dưới cùng (vẽ trước nội dung gốc) */
export function moveLastToFront(page: PDFPage) {
  const contents = page.node.get(PDFName.of('Contents'));
  const arr = contents ? page.node.context.lookup(contents) : undefined;
  if (!(arr instanceof PDFArray) || arr.size() < 2) return;
  const last = arr.get(arr.size() - 1);
  arr.remove(arr.size() - 1);
  arr.insert(0, last);
}

// ---------------------------------------------------------------------------
// Màu nền (vector): tô một hình chữ nhật dưới nội dung
// ---------------------------------------------------------------------------
export async function addBackgroundColor(input: PdfInput, color: Rgb, pages?: number[]): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const targets = targetsOf(doc, pages);
  doc.getPages().forEach((page, i) => {
    if (!targets.has(i + 1)) return;
    inVisualSpace(page, (geo) => {
      page.drawRectangle({ x: 0, y: 0, width: geo.width, height: geo.height, color: rgb(...color) });
    });
    moveLastToFront(page);
  });
  return savePdf(doc);
}
