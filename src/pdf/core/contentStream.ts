/**
 * Đọc / ghi luồng nội dung trang (content stream) ở mức toán tử — dùng để đổi màu chữ dạng vector.
 */
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { loadPdf, savePdf, type PdfInput } from './ops';

export interface Op {
  operator: string;
  operands: string[];
}

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));

/** Tách luồng nội dung thành dãy toán tử (giữ nguyên văn bản gốc của toán hạng) */
export function parseContent(src: string): Op[] {
  const ops: Op[] = [];
  let operands: string[] = [];
  let i = 0;
  const n = src.length;
  const code = (k: number) => src.charCodeAt(k);
  while (i < n) {
    const c = code(i);
    if (WS.has(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      // chú thích %
      while (i < n && code(i) !== 0x0a && code(i) !== 0x0d) i++;
      continue;
    }
    const start = i;
    if (c === 0x28) {
      // chuỗi ( ... ) có lồng và thoát
      let depth = 0;
      while (i < n) {
        const ch = code(i);
        if (ch === 0x5c) {
          i += 2;
          continue;
        }
        if (ch === 0x28) depth++;
        else if (ch === 0x29) {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      operands.push(src.slice(start, i));
      continue;
    }
    if (c === 0x3c && code(i + 1) === 0x3c) {
      // từ điển << ... >>
      let depth = 0;
      while (i < n) {
        if (code(i) === 0x3c && code(i + 1) === 0x3c) {
          depth++;
          i += 2;
        } else if (code(i) === 0x3e && code(i + 1) === 0x3e) {
          depth--;
          i += 2;
          if (depth === 0) break;
        } else if (code(i) === 0x28) {
          // chuỗi bên trong từ điển
          let d = 0;
          while (i < n) {
            const ch = code(i);
            if (ch === 0x5c) {
              i += 2;
              continue;
            }
            if (ch === 0x28) d++;
            else if (ch === 0x29 && --d === 0) {
              i++;
              break;
            }
            i++;
          }
        } else i++;
      }
      operands.push(src.slice(start, i));
      continue;
    }
    if (c === 0x3c) {
      while (i < n && code(i) !== 0x3e) i++;
      i++;
      operands.push(src.slice(start, i));
      continue;
    }
    if (c === 0x5b) {
      // mảng [ ... ] (có thể chứa chuỗi)
      let depth = 0;
      while (i < n) {
        const ch = code(i);
        if (ch === 0x28) {
          let d = 0;
          while (i < n) {
            const k = code(i);
            if (k === 0x5c) {
              i += 2;
              continue;
            }
            if (k === 0x28) d++;
            else if (k === 0x29 && --d === 0) {
              i++;
              break;
            }
            i++;
          }
          continue;
        }
        if (ch === 0x5b) depth++;
        else if (ch === 0x5d && --depth === 0) {
          i++;
          break;
        }
        i++;
      }
      operands.push(src.slice(start, i));
      continue;
    }
    if (c === 0x2f) {
      i++;
      while (i < n && !WS.has(code(i)) && !DELIM.has(code(i))) i++;
      operands.push(src.slice(start, i));
      continue;
    }
    // số hoặc toán tử
    while (i < n && !WS.has(code(i)) && !DELIM.has(code(i))) i++;
    const tok = src.slice(start, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok) || tok === 'true' || tok === 'false' || tok === 'null') {
      operands.push(tok);
      continue;
    }
    if (tok === 'BI') {
      // ảnh nội tuyến: giữ nguyên tới EI
      const end = findInlineImageEnd(src, i);
      ops.push({ operator: 'BI', operands: [src.slice(i, end)] });
      i = end + 2;
      operands = [];
      continue;
    }
    if (!tok) {
      i++;
      continue;
    }
    ops.push({ operator: tok, operands });
    operands = [];
  }
  return ops;
}

function findInlineImageEnd(src: string, from: number): number {
  const id = src.indexOf('ID', from);
  let k = id + 3;
  while (k < src.length) {
    const e = src.indexOf('EI', k);
    if (e < 0) return src.length - 2;
    const before = src.charCodeAt(e - 1);
    const after = src.charCodeAt(e + 2);
    if (WS.has(before) && (Number.isNaN(after) || WS.has(after))) return e;
    k = e + 2;
  }
  return src.length - 2;
}

export function serializeContent(ops: Op[]): string {
  return ops
    .map((op) => (op.operator === 'BI' ? `BI${op.operands[0]}EI` : [...op.operands, op.operator].join(' ')))
    .join('\n');
}

const latin1 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};
const toBytes = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

function streamText(obj: PDFObject | undefined, doc: PDFDocument): string {
  const s = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  if (s instanceof PDFRawStream) return latin1(decodePDFRawStream(s).decode());
  if (s instanceof PDFStream) return latin1(s.getContents());
  return '';
}

// ---------------------------------------------------------------------------
// Đổi màu chữ
// ---------------------------------------------------------------------------
const FILL_OPS = new Set(['rg', 'g', 'k', 'sc', 'scn', 'cs']);
const STROKE_OPS = new Set(['RG', 'G', 'K', 'SC', 'SCN', 'CS']);

/** Màu đậm (gần đen/xám tối) dựa theo toán hạng */
function isDark(op: Op): boolean {
  const v = op.operands.map(Number);
  switch (op.operator.toLowerCase()) {
    case 'g':
      return v[0] < 0.35;
    case 'rg':
      return 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2] < 0.35;
    case 'k':
      return v[3] > 0.65 || (v[0] + v[1] + v[2]) / 3 + v[3] > 0.75;
    default:
      return true;
  }
}

export function recolorText(ops: Op[], color: [number, number, number], onlyDark: boolean): { ops: Op[]; changed: number } {
  const rgbOps = (stroke: boolean): Op => ({ operator: stroke ? 'RG' : 'rg', operands: color.map((c) => c.toFixed(4)) });
  const out: Op[] = [];
  let inText = false;
  let changed = 0;
  for (const op of ops) {
    if (op.operator === 'BT') {
      inText = true;
      out.push(op);
      if (!onlyDark) out.push(rgbOps(false), rgbOps(true));
      continue;
    }
    if (op.operator === 'ET') inText = false;
    if (inText && (FILL_OPS.has(op.operator) || STROKE_OPS.has(op.operator))) {
      const stroke = STROKE_OPS.has(op.operator);
      if (op.operator === 'cs' || op.operator === 'CS') {
        if (!onlyDark) continue;
        out.push(op);
        continue;
      }
      if (!onlyDark || isDark(op)) {
        out.push(rgbOps(stroke));
        changed++;
        continue;
      }
    }
    out.push(op);
  }
  return { ops: out, changed };
}

export async function changeTextColor(
  input: PdfInput,
  options: { color: [number, number, number]; onlyDark: boolean; pages?: number[] }
): Promise<{ bytes: Uint8Array; changed: number }> {
  const doc = await loadPdf(input);
  const targets = new Set(options.pages && options.pages.length ? options.pages : doc.getPageIndices().map((i) => i + 1));
  let changed = 0;
  const doneForms = new Set<string>();

  const rewriteForms = (resources: PDFDict | undefined) => {
    const xobjs = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjs) return;
    for (const [, ref] of xobjs.entries()) {
      if (!(ref instanceof PDFRef) || doneForms.has(ref.toString())) continue;
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFStream)) continue;
      if (stream.dict.get(PDFName.of('Subtype'))?.toString() !== '/Form') continue;
      doneForms.add(ref.toString());
      const r = recolorText(parseContent(streamText(stream, doc)), options.color, options.onlyDark);
      changed += r.changed;
      const dict = stream.dict.clone(doc.context);
      dict.delete(PDFName.of('Filter'));
      dict.delete(PDFName.of('DecodeParms'));
      dict.delete(PDFName.of('Length'));
      const replacement = doc.context.flateStream(toBytes(serializeContent(r.ops)), {});
      for (const [k, v] of dict.entries()) replacement.dict.set(k, v);
      doc.context.assign(ref, replacement);
      rewriteForms(replacement.dict.lookupMaybe(PDFName.of('Resources'), PDFDict));
    }
  };

  doc.getPages().forEach((page, i) => {
    if (!targets.has(i + 1)) return;
    const contents = page.node.get(PDFName.of('Contents'));
    const resolved = contents instanceof PDFRef ? doc.context.lookup(contents) : contents;
    const parts: PDFObject[] = resolved && 'asArray' in resolved ? (resolved as unknown as { asArray(): PDFObject[] }).asArray() : contents ? [contents] : [];
    const text = parts.map((p) => streamText(p, doc)).join('\n');
    const r = recolorText(parseContent(text), options.color, options.onlyDark);
    changed += r.changed;
    const stream = doc.context.flateStream(toBytes(serializeContent(r.ops)));
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));
    rewriteForms(page.node.Resources());
  });
  return { bytes: await savePdf(doc), changed };
}

