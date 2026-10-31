/**
 * Bộ dàn trang văn bản, bảng biểu và hình ảnh sang PDF (pdf-lib + font tiếng Việt Noto).
 * Dùng chung cho: TXT, Markdown, CSV, JSON, XML, RTF, Email, EPUB, FB2, Word, Excel, ODF.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { embedFont, embedFontSet, type FontFamily } from './fonts';
import { savePdf } from './ops';
import { MM_TO_PT, paperDims, type Orientation, type PaperId } from './paper';

export type DocBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string; bold?: boolean; italic?: boolean; mono?: boolean; indent?: number }
  | { kind: 'code'; text: string }
  | { kind: 'list'; ordered?: boolean; items: string[] }
  | { kind: 'table'; headers?: string[]; rows: string[][] }
  | { kind: 'image'; bytes: Uint8Array; type: 'png' | 'jpg'; caption?: string }
  | { kind: 'hr' }
  | { kind: 'pageBreak' };

export interface LayoutOptions {
  paper?: PaperId;
  orientation?: Orientation;
  marginMm?: number;
  family?: FontFamily;
  fontSize?: number;
  lineHeight?: number;
  title?: string;
}

/** Ngắt dòng một đoạn chữ theo chiều rộng tối đa (pt) */
export function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = text.replace(/\r/g, '').replace(/\t/g, '    ');
  const rawLines = clean.split('\n');
  const out: string[] = [];
  for (const raw of rawLines) {
    if (!raw.trim()) {
      out.push('');
      continue;
    }
    const words = raw.split(/(\s+)/);
    let current = '';
    for (const part of words) {
      const candidate = current + part;
      if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current.trimEnd()) out.push(current.trimEnd());
        const trimmed = part.trimStart();
        if (!trimmed) {
          current = '';
        } else if (font.widthOfTextAtSize(trimmed, size) <= maxWidth) {
          current = trimmed;
        } else {
          // Từ quá dài (URL / chuỗi mã) -> cắt theo ký tự
          let chunk = '';
          for (const ch of trimmed) {
            if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        }
      }
    }
    if (current.trimEnd()) out.push(current.trimEnd());
  }
  return out.length ? out : [''];
}

export async function renderBlocksToPdf(blocks: DocBlock[], opts: LayoutOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (opts.title) doc.setTitle(opts.title);
  const [pageW, pageH] = paperDims(opts.paper ?? 'A4', opts.orientation ?? 'portrait');
  const margin = (opts.marginMm ?? 18) * MM_TO_PT;
  const contentW = Math.max(72, pageW - margin * 2);
  const baseSize = opts.fontSize ?? 11;
  const lineGap = opts.lineHeight ?? 1.38;

  const fonts = await embedFontSet(doc, opts.family ?? 'sans');
  const monoFont = await embedFont(doc, 'mono', 'regular');

  let page: PDFPage = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const newPage = () => {
    page = doc.addPage([pageW, pageH]);
    y = pageH - margin;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  for (const b of blocks) {
    switch (b.kind) {
      case 'pageBreak':
        newPage();
        break;

      case 'hr':
        ensureSpace(14);
        y -= 6;
        page.drawLine({
          start: { x: margin, y },
          end: { x: pageW - margin, y },
          thickness: 0.7,
          color: rgb(0.78, 0.81, 0.86),
        });
        y -= 8;
        break;

      case 'heading': {
        const sizes: Record<1 | 2 | 3 | 4, number> = {
          1: baseSize * 1.65,
          2: baseSize * 1.38,
          3: baseSize * 1.18,
          4: baseSize * 1.06,
        };
        const sz = sizes[b.level] ?? baseSize * 1.2;
        const lh = sz * 1.32;
        const lines = wrapLine(b.text, fonts.bold, sz, contentW);
        ensureSpace(lh * Math.min(2, lines.length) + 10);
        y -= 6;
        for (const ln of lines) {
          ensureSpace(lh);
          y -= sz;
          page.drawText(ln, { x: margin, y, font: fonts.bold, size: sz, color: rgb(0.06, 0.1, 0.2) });
          y -= lh - sz;
        }
        y -= 4;
        break;
      }

      case 'paragraph': {
        const font = b.mono
          ? monoFont
          : b.bold && b.italic
            ? fonts.boldItalic
            : b.bold
              ? fonts.bold
              : b.italic
                ? fonts.italic
                : fonts.regular;
        const indent = (b.indent ?? 0) * 14;
        const availW = Math.max(48, contentW - indent);
        const lh = baseSize * lineGap;
        const lines = wrapLine(b.text, font, baseSize, availW);
        for (const ln of lines) {
          ensureSpace(lh);
          y -= baseSize;
          if (ln) {
            page.drawText(ln, {
              x: margin + indent,
              y,
              font,
              size: baseSize,
              color: rgb(0.12, 0.15, 0.2),
            });
          }
          y -= lh - baseSize;
        }
        y -= baseSize * 0.35;
        break;
      }

      case 'code': {
        const sz = Math.max(8, baseSize - 1.5);
        const lh = sz * 1.35;
        const pad = 8;
        const lines = wrapLine(b.text, monoFont, sz, contentW - pad * 2);
        y -= 4;
        for (const ln of lines) {
          ensureSpace(lh + 4);
          page.drawRectangle({
            x: margin,
            y: y - lh,
            width: contentW,
            height: lh + 1,
            color: rgb(0.95, 0.96, 0.98),
          });
          y -= sz + 1;
          if (ln) {
            page.drawText(ln, { x: margin + pad, y, font: monoFont, size: sz, color: rgb(0.14, 0.18, 0.26) });
          }
          y -= lh - sz - 1;
        }
        y -= 6;
        break;
      }

      case 'list': {
        const lh = baseSize * lineGap;
        const bulletIndent = 16;
        b.items.forEach((item, idx) => {
          const marker = b.ordered ? `${idx + 1}.` : '•';
          const lines = wrapLine(item, fonts.regular, baseSize, contentW - bulletIndent);
          lines.forEach((ln, lIdx) => {
            ensureSpace(lh);
            y -= baseSize;
            if (lIdx === 0) {
              page.drawText(marker, { x: margin + 2, y, font: fonts.bold, size: baseSize, color: rgb(0.2, 0.25, 0.35) });
            }
            if (ln) {
              page.drawText(ln, { x: margin + bulletIndent, y, font: fonts.regular, size: baseSize, color: rgb(0.12, 0.15, 0.2) });
            }
            y -= lh - baseSize;
          });
        });
        y -= 4;
        break;
      }

      case 'table': {
        const allRows = b.headers && b.headers.length ? [b.headers, ...b.rows] : b.rows;
        if (!allRows.length) break;
        const colCount = Math.max(1, ...allRows.map((r) => r.length));
        const sz = Math.max(7.5, Math.min(baseSize - 1, colCount > 7 ? 8 : 9.5));
        const lh = sz * 1.28;
        const cellPadX = 5;
        const cellPadY = 4;

        // Tính độ rộng cột tỉ lệ theo độ dài chữ trung bình
        const weights = Array.from({ length: colCount }, (_, c) => {
          let maxLen = 4;
          for (let r = 0; r < Math.min(allRows.length, 40); r++) {
            maxLen = Math.max(maxLen, Math.min(45, String(allRows[r][c] ?? '').length));
          }
          return Math.sqrt(maxLen);
        });
        const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
        const colWidths = weights.map((w) => (w / totalWeight) * contentW);

        y -= 4;
        allRows.forEach((row, rIdx) => {
          const isHeader = !!b.headers?.length && rIdx === 0;
          const font = isHeader ? fonts.bold : fonts.regular;
          const wrappedCells = Array.from({ length: colCount }, (_, c) =>
            wrapLine(String(row[c] ?? ''), font, sz, Math.max(18, colWidths[c] - cellPadX * 2))
          );
          const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length));
          const rowH = maxLines * lh + cellPadY * 2;
          ensureSpace(rowH + 2);

          // Tô nền hàng tiêu đề hoặc hàng chẵn
          if (isHeader || rIdx % 2 === 1) {
            page.drawRectangle({
              x: margin,
              y: y - rowH,
              width: contentW,
              height: rowH,
              color: isHeader ? rgb(0.9, 0.93, 0.98) : rgb(0.975, 0.98, 0.99),
            });
          }

          let cx = margin;
          for (let c = 0; c < colCount; c++) {
            const cw = colWidths[c];
            page.drawRectangle({
              x: cx,
              y: y - rowH,
              width: cw,
              height: rowH,
              borderColor: rgb(0.8, 0.83, 0.88),
              borderWidth: 0.5,
            });
            const lines = wrappedCells[c];
            lines.forEach((ln, lIdx) => {
              if (!ln) return;
              page.drawText(ln, {
                x: cx + cellPadX,
                y: y - cellPadY - (lIdx + 1) * sz - lIdx * (lh - sz),
                font,
                size: sz,
                color: isHeader ? rgb(0.06, 0.1, 0.2) : rgb(0.14, 0.17, 0.22),
              });
            });
            cx += cw;
          }
          y -= rowH;
        });
        y -= 8;
        break;
      }

      case 'image': {
        try {
          const img = b.type === 'png' ? await doc.embedPng(b.bytes) : await doc.embedJpg(b.bytes);
          const maxH = Math.min(pageH - margin * 2 - 24, 380);
          const scale = Math.min(1, contentW / img.width, maxH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          ensureSpace(drawH + 12);
          y -= drawH;
          page.drawImage(img, { x: margin + (contentW - drawW) / 2, y, width: drawW, height: drawH });
          y -= 6;
          if (b.caption) {
            const capSize = baseSize - 1.5;
            ensureSpace(capSize + 6);
            y -= capSize;
            page.drawText(b.caption, { x: margin, y, font: fonts.italic, size: capSize, color: rgb(0.35, 0.4, 0.48) });
            y -= 4;
          }
        } catch {
          /* bỏ qua ảnh lỗi định dạng */
        }
        break;
      }
    }
  }

  return savePdf(doc);
}

/** Chuyển cây HTML (từ Markdown, DOCX mammoth, EPUB, FB2) thành danh sách DocBlock */
export function htmlToDocBlocks(html: string): DocBlock[] {
  if (typeof DOMParser === 'undefined') {
    const blocks: DocBlock[] = [];
    const strip = (s: string) => s.replace(/<[^>]+>/g, '').trim();
    const tagRe = /<(h[1-6]|p|pre|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(html)) !== null) {
      const tag = m[1].toLowerCase();
      const inner = m[2];
      if (tag.startsWith('h')) {
        const level = Math.min(4, Math.max(1, Number(tag[1]))) as 1 | 2 | 3 | 4;
        const text = strip(inner);
        if (text) blocks.push({ kind: 'heading', level, text });
      } else if (tag === 'pre') {
        const text = strip(inner);
        if (text) blocks.push({ kind: 'code', text });
      } else if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
          .map((x) => strip(x[1]))
          .filter(Boolean);
        if (items.length) blocks.push({ kind: 'list', ordered: tag === 'ol', items });
      } else {
        const text = strip(inner);
        if (text) blocks.push({ kind: 'paragraph', text });
      }
    }
    if (!blocks.length && strip(html)) {
      blocks.push({ kind: 'paragraph', text: strip(html) });
    }
    return blocks;
  }
  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');
  const blocks: DocBlock[] = [];

  const dataUrlToImg = (src: string): { bytes: Uint8Array; type: 'png' | 'jpg' } | null => {
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(src);
    if (!m) return null;
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, type: m[1].toLowerCase() === 'png' ? 'png' : 'jpg' };
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').trim();
      if (t) blocks.push({ kind: 'paragraph', text: t });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      const level = Math.min(4, Math.max(1, Number(tag[1]))) as 1 | 2 | 3 | 4;
      const t = (el.textContent ?? '').trim();
      if (t) blocks.push({ kind: 'heading', level, text: t });
      return;
    }
    if (tag === 'pre' || tag === 'code') {
      const t = (el.textContent ?? '').replace(/\n$/, '');
      if (t.trim()) blocks.push({ kind: 'code', text: t });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.querySelectorAll(':scope > li'))
        .map((li) => (li.textContent ?? '').trim())
        .filter(Boolean);
      if (items.length) blocks.push({ kind: 'list', ordered: tag === 'ol', items });
      return;
    }
    if (tag === 'table') {
      const trs = Array.from(el.querySelectorAll('tr'));
      const headers: string[] = [];
      const rows: string[][] = [];
      trs.forEach((tr, idx) => {
        const ths = Array.from(tr.querySelectorAll('th'));
        if (idx === 0 && ths.length) {
          headers.push(...ths.map((c) => (c.textContent ?? '').trim()));
        } else {
          const cells = Array.from(tr.querySelectorAll('th, td')).map((c) => (c.textContent ?? '').trim());
          if (cells.some(Boolean)) rows.push(cells);
        }
      });
      if (headers.length || rows.length) blocks.push({ kind: 'table', headers: headers.length ? headers : undefined, rows });
      return;
    }
    if (tag === 'hr') {
      blocks.push({ kind: 'hr' });
      return;
    }
    if (tag === 'img') {
      const img = dataUrlToImg(el.getAttribute('src') ?? '');
      if (img) blocks.push({ kind: 'image', ...img, caption: el.getAttribute('alt') || undefined });
      return;
    }
    if (tag === 'p' || tag === 'blockquote') {
      // Kiểm tra ảnh nhúng bên trong <p>
      for (const childImg of Array.from(el.querySelectorAll('img'))) {
        const decoded = dataUrlToImg(childImg.getAttribute('src') ?? '');
        if (decoded) blocks.push({ kind: 'image', ...decoded, caption: childImg.getAttribute('alt') || undefined });
      }
      const t = (el.textContent ?? '').trim();
      if (t) {
        const onlyBold = el.children.length === 1 && (el.children[0].tagName === 'STRONG' || el.children[0].tagName === 'B');
        blocks.push({ kind: 'paragraph', text: t, bold: onlyBold, italic: tag === 'blockquote', indent: tag === 'blockquote' ? 1 : 0 });
      }
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };

  for (const child of Array.from(dom.body.childNodes)) walk(child);
  return blocks;
}

/** Tách bảng CSV / TSV (tự nhận diện dấu phẩy, chấm phẩy hoặc tab) */
export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!clean) return [];
  const firstLine = clean.split('\n')[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n') {
      row.push(cur.trim());
      rows.push(row);
      row = [];
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) {
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

