/**
 * Vẽ lên trang theo "không gian hiển thị": gốc toạ độ ở góc trái-dưới của trang như người dùng nhìn thấy
 * (đã tính /Rotate và CropBox), đơn vị pt. Mọi công cụ chèn chữ/hình dùng chung để không lệch khi trang bị xoay.
 */
import {
  PDFPage,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
} from 'pdf-lib';
import { normalizeAngle } from './ops';

export interface VisualGeometry {
  /** Kích thước hiển thị (pt) */
  width: number;
  height: number;
  rotation: number;
}

export function visualGeometry(page: PDFPage): VisualGeometry {
  const box = page.getCropBox();
  const rotation = normalizeAngle(page.getRotation().angle);
  const swapped = rotation === 90 || rotation === 270;
  return { width: swapped ? box.height : box.width, height: swapped ? box.width : box.height, rotation };
}

/** Ma trận đổi toạ độ hiển thị -> toạ độ người dùng của trang */
export function visualMatrix(page: PDFPage): [number, number, number, number, number, number] {
  const { x, y, width: w, height: h } = page.getCropBox();
  switch (normalizeAngle(page.getRotation().angle)) {
    case 90:
      return [0, 1, -1, 0, x + w, y];
    case 180:
      return [-1, 0, 0, -1, x + w, y + h];
    case 270:
      return [0, -1, 1, 0, x, y + h];
    default:
      return [1, 0, 0, 1, x, y];
  }
}

/** Chạy các lệnh vẽ trong không gian hiển thị của trang */
export function inVisualSpace(page: PDFPage, draw: (geo: VisualGeometry) => void) {
  const m = visualMatrix(page);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
  try {
    draw(visualGeometry(page));
  } finally {
    page.pushOperators(popGraphicsState());
  }
}

export type Rgb = [number, number, number];
export const toColor = (c: Rgb) => rgb(c[0], c[1], c[2]);

/** Ngắt dòng theo độ rộng (giữ xuống dòng có sẵn) */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const candidate = line + word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line.trimEnd());
      line = word.trimStart();
      // Từ quá dài: cắt theo ký tự
      while (line && font.widthOfTextAtSize(line, size) > maxWidth) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export type Align = 'left' | 'center' | 'right';

export interface TextBoxOptions {
  /** Góc trái-trên của khung (pt, không gian hiển thị, gốc dưới-trái) */
  x: number;
  top: number;
  width: number;
  font: PDFFont;
  size: number;
  color?: Rgb;
  opacity?: number;
  align?: Align;
  lineHeight?: number;
  /** Không ngắt dòng (giữ nguyên từng dòng) */
  noWrap?: boolean;
}

/** Vẽ đoạn chữ trong khung (gọi bên trong inVisualSpace). Trả về chiều cao đã dùng. */
export function drawTextBox(page: PDFPage, text: string, o: TextBoxOptions): number {
  const lh = (o.lineHeight ?? 1.25) * o.size;
  const lines = o.noWrap ? text.split(/\r?\n/) : wrapText(text, o.font, o.size, Math.max(1, o.width));
  // Dòng đầu: đường chân chữ cách đỉnh khung khoảng 0.8 cỡ chữ
  let baseline = o.top - o.size * 0.92;
  for (const line of lines) {
    const w = o.font.widthOfTextAtSize(line, o.size);
    const x = o.align === 'center' ? o.x + (o.width - w) / 2 : o.align === 'right' ? o.x + o.width - w : o.x;
    if (line) {
      page.drawText(line, {
        x,
        y: baseline,
        size: o.size,
        font: o.font,
        color: toColor(o.color ?? [0, 0, 0]),
        opacity: o.opacity,
      });
    }
    baseline -= lh;
  }
  return lines.length * lh;
}

/** Vẽ một dòng chữ xoay quanh tâm (cx, cy) */
export function drawRotatedText(
  page: PDFPage,
  text: string,
  o: { cx: number; cy: number; font: PDFFont; size: number; angle: number; color?: Rgb; opacity?: number }
) {
  const w = o.font.widthOfTextAtSize(text, o.size);
  const h = o.font.heightAtSize(o.size, { descender: false });
  const t = (o.angle * Math.PI) / 180;
  // Toạ độ điểm gốc chữ (trái-chân) sao cho tâm chữ nằm ở (cx, cy)
  const dx = -w / 2;
  const dy = -h / 2.6;
  page.drawText(text, {
    x: o.cx + dx * Math.cos(t) - dy * Math.sin(t),
    y: o.cy + dx * Math.sin(t) + dy * Math.cos(t),
    size: o.size,
    font: o.font,
    rotate: degrees(o.angle),
    color: toColor(o.color ?? [0, 0, 0]),
    opacity: o.opacity,
  });
}

/** Vẽ ảnh xoay quanh tâm khung */
export function drawRotatedImage(
  page: PDFPage,
  image: PDFImage,
  o: { cx: number; cy: number; width: number; height: number; angle?: number; opacity?: number }
) {
  const t = ((o.angle ?? 0) * Math.PI) / 180;
  const dx = -o.width / 2;
  const dy = -o.height / 2;
  page.drawImage(image, {
    x: o.cx + dx * Math.cos(t) - dy * Math.sin(t),
    y: o.cy + dx * Math.sin(t) + dy * Math.cos(t),
    width: o.width,
    height: o.height,
    rotate: degrees(o.angle ?? 0),
    opacity: o.opacity,
  });
}

// ---------------------------------------------------------------------------
// Vị trí 9 ô (trên/giữa/dưới × trái/giữa/phải)
// ---------------------------------------------------------------------------
export type VPos = 'top' | 'middle' | 'bottom';
export type HPos = 'left' | 'center' | 'right';

/** Điểm neo (pt) cho khung rộng w, cao h tại vị trí chỉ định với lề margin; trả góc trái-trên */
export function anchorBox(
  geo: VisualGeometry,
  pos: { v: VPos; h: HPos },
  w: number,
  h: number,
  margin: number
): { x: number; top: number } {
  const x = pos.h === 'left' ? margin : pos.h === 'right' ? geo.width - margin - w : (geo.width - w) / 2;
  const top = pos.v === 'top' ? geo.height - margin : pos.v === 'bottom' ? margin + h : (geo.height + h) / 2;
  return { x, top };
}

// ---------------------------------------------------------------------------
// Mẫu chữ có biến: {n} số trang, {total} tổng trang, {date} ngày, {file} tên tệp
// ---------------------------------------------------------------------------
export interface TokenContext {
  n: number;
  total: number;
  file?: string;
  date?: Date;
}

export function fillTokens(template: string, ctx: TokenContext): string {
  const d = ctx.date ?? new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return template
    .replace(/\{n\}/gi, String(ctx.n))
    .replace(/\{total\}/gi, String(ctx.total))
    .replace(/\{date\}/gi, `${dd}/${mm}/${d.getFullYear()}`)
    .replace(/\{file\}/gi, ctx.file ?? '');
}

/** Số La Mã (I, II, ...) */
export function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let v = Math.max(1, Math.floor(n));
  for (const [k, s] of map) {
    while (v >= k) {
      out += s;
      v -= k;
    }
  }
  return out;
}

