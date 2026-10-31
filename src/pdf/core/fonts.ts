/**
 * Font tiếng Việt (Noto Sans / Noto Serif / Noto Sans Mono — giấy phép SIL OFL) cho mọi công cụ chèn chữ.
 * Font chuẩn của PDF (Helvetica...) không có dấu tiếng Việt nên luôn nhúng font qua fontkit (chỉ nhúng ký tự dùng tới).
 */
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

export type FontFamily = 'sans' | 'serif' | 'mono';
export type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

const FILES: Record<FontFamily, Partial<Record<FontStyle, string>>> = {
  sans: {
    regular: 'NotoSans-Regular.ttf',
    bold: 'NotoSans-Bold.ttf',
    italic: 'NotoSans-Italic.ttf',
    boldItalic: 'NotoSans-BoldItalic.ttf',
  },
  serif: {
    regular: 'NotoSerif-Regular.ttf',
    bold: 'NotoSerif-Bold.ttf',
    italic: 'NotoSerif-Italic.ttf',
    boldItalic: 'NotoSerif-BoldItalic.ttf',
  },
  mono: { regular: 'NotoSansMono-Regular.ttf' },
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  sans: 'Không chân (Noto Sans)',
  serif: 'Có chân (Noto Serif, giống Times)',
  mono: 'Đơn cách (Noto Sans Mono)',
};

type Loader = (file: string) => Promise<Uint8Array>;

let loader: Loader = async (file) => {
  const res = await fetch(`/fonts/${file}`);
  if (!res.ok) throw new Error(`Không tải được font ${file}`);
  return new Uint8Array(await res.arrayBuffer());
};

/** Cho phép test (Node) đọc font từ đĩa */
export function setFontLoader(fn: Loader) {
  loader = fn;
  cache.clear();
}

const cache = new Map<string, Promise<Uint8Array>>();

export function fontFile(family: FontFamily, style: FontStyle): string {
  const set = FILES[family];
  return set[style] ?? set.regular!;
}

export function loadFontBytes(family: FontFamily, style: FontStyle = 'regular'): Promise<Uint8Array> {
  const file = fontFile(family, style);
  let p = cache.get(file);
  if (!p) {
    p = loader(file).catch((err) => {
      cache.delete(file);
      throw err;
    });
    cache.set(file, p);
  }
  return p;
}

const registered = new WeakSet<PDFDocument>();
const embedded = new WeakMap<PDFDocument, Map<string, Promise<PDFFont>>>();

/** Nhúng font vào tài liệu (dùng lại nếu đã nhúng) */
export function embedFont(doc: PDFDocument, family: FontFamily = 'sans', style: FontStyle = 'regular'): Promise<PDFFont> {
  if (!registered.has(doc)) {
    doc.registerFontkit(fontkit);
    registered.add(doc);
  }
  let map = embedded.get(doc);
  if (!map) {
    map = new Map();
    embedded.set(doc, map);
  }
  const key = fontFile(family, style);
  let p = map.get(key);
  if (!p) {
    p = loadFontBytes(family, style).then((bytes) => doc.embedFont(bytes, { subset: true }));
    map.set(key, p);
  }
  return p;
}

/** Bộ font đầy đủ của một họ (thường, đậm, nghiêng, đậm nghiêng) */
export async function embedFontSet(doc: PDFDocument, family: FontFamily = 'sans') {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    embedFont(doc, family, 'regular'),
    embedFont(doc, family, 'bold'),
    embedFont(doc, family, 'italic'),
    embedFont(doc, family, 'boldItalic'),
  ]);
  return { regular, bold, italic, boldItalic };
}

export function styleOf(bold?: boolean, italic?: boolean): FontStyle {
  return bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
}

/** Chuyển màu hex (#rrggbb) sang [r, g, b] 0..1 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

