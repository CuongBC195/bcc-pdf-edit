/**
 * Chuyển đổi hai chiều giữa PDF và tài liệu văn phòng:
 * - Word (.docx), Excel (.xlsx), PowerPoint (.pptx) -> PDF
 * - OpenDocument (.odt, .ods, .odp, .odg) -> PDF
 * - PDF -> Word (.docx) và PDF -> Excel (.xlsx) chuẩn Office Open XML (OOXML).
 */
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFDocument, rgb } from 'pdf-lib';
import { htmlToDocBlocks, parseCsvRows, renderBlocksToPdf, wrapLine, type DocBlock, type LayoutOptions } from './docLayout';
import { extractStructuredPages } from './extract';
import { embedFontSet, type FontFamily } from './fonts';
import { savePdf } from './ops';
import { MM_TO_PT } from './paper';

const xmlEscape = (s: string) =>
  s
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// ---------------------------------------------------------------------------
// 1. Word (.docx) -> PDF
// ---------------------------------------------------------------------------
export async function convertDocxToPdf(buffer: ArrayBuffer, opts: LayoutOptions = {}): Promise<Uint8Array> {
  const res = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const blocks = htmlToDocBlocks(res.value);
  if (!blocks.length) blocks.push({ kind: 'paragraph', text: 'Tài liệu Word trống.' });
  return renderBlocksToPdf(blocks, opts);
}

// ---------------------------------------------------------------------------
// 2. Excel (.xlsx / .csv) -> PDF
// ---------------------------------------------------------------------------
function colLettersToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return Math.max(0, n - 1);
}

export async function parseXlsxSheets(buffer: ArrayBuffer): Promise<{ name: string; rows: string[][] }[]> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings: string[] = [];
  if (sharedXml) {
    const dom = new DOMParser().parseFromString(sharedXml, 'application/xml');
    dom.querySelectorAll('si').forEach((si) => {
      const parts = Array.from(si.querySelectorAll('t')).map((t) => t.textContent ?? '');
      sharedStrings.push(parts.join(''));
    });
  }

  const wbXml = await zip.file('xl/workbook.xml')?.async('string');
  const sheetNames: string[] = [];
  if (wbXml) {
    const dom = new DOMParser().parseFromString(wbXml, 'application/xml');
    dom.querySelectorAll('sheet').forEach((s) => {
      sheetNames.push(s.getAttribute('name') || 'Sheet');
    });
  }

  const sheetFiles = Object.keys(zip.files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const sheets: { name: string; rows: string[][] }[] = [];
  for (let idx = 0; idx < sheetFiles.length; idx++) {
    const xml = await zip.file(sheetFiles[idx])!.async('string');
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const rows: string[][] = [];
    dom.querySelectorAll('sheetData > row').forEach((rowEl) => {
      const row: string[] = [];
      rowEl.querySelectorAll('c').forEach((cEl) => {
        const ref = cEl.getAttribute('r') ?? '';
        const colMatch = /^[A-Z]+/i.exec(ref);
        const colIdx = colMatch ? colLettersToIndex(colMatch[0].toUpperCase()) : row.length;
        while (row.length <= colIdx) row.push('');
        const t = cEl.getAttribute('t');
        const vText = cEl.querySelector('v')?.textContent ?? '';
        let val = vText;
        if (t === 's') {
          val = sharedStrings[Number(vText)] ?? vText;
        } else if (t === 'inlineStr') {
          val = Array.from(cEl.querySelectorAll('is t'))
            .map((x) => x.textContent ?? '')
            .join('');
        }
        row[colIdx] = val.trim();
      });
      if (row.some(Boolean)) rows.push(row);
    });
    if (rows.length) {
      sheets.push({ name: sheetNames[idx] || `Trang tính ${idx + 1}`, rows });
    }
  }
  return sheets;
}

export async function convertExcelToPdf(
  buffer: ArrayBuffer,
  fileName: string,
  opts: LayoutOptions = {}
): Promise<Uint8Array> {
  const blocks: DocBlock[] = [];
  if (/\.csv$|\.tsv$/i.test(fileName)) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const rows = parseCsvRows(text);
    if (rows.length) blocks.push({ kind: 'table', headers: rows[0], rows: rows.slice(1) });
  } else {
    const sheets = await parseXlsxSheets(buffer);
    sheets.forEach((sh, i) => {
      if (i > 0) blocks.push({ kind: 'pageBreak' });
      blocks.push({ kind: 'heading', level: 2, text: sh.name });
      blocks.push({ kind: 'table', headers: sh.rows[0], rows: sh.rows.slice(1) });
    });
  }
  if (!blocks.length) blocks.push({ kind: 'paragraph', text: 'Bảng tính không có dữ liệu.' });
  return renderBlocksToPdf(blocks, { orientation: 'landscape', ...opts });
}

// ---------------------------------------------------------------------------
// 3. PowerPoint (.pptx) -> PDF (mỗi slide 1 trang ngang 16:9)
// ---------------------------------------------------------------------------
export async function convertPptxToPdf(buffer: ArrayBuffer, family: FontFamily = 'sans'): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const doc = await PDFDocument.create();
  const fonts = await embedFontSet(doc, family);
  const slideW = 841.89; // A4 ngang
  const slideH = 473.56; // 16:9
  const margin = 22 * MM_TO_PT;

  for (let sIdx = 0; sIdx < slideFiles.length; sIdx++) {
    const slidePath = slideFiles[sIdx];
    const xml = await zip.file(slidePath)!.async('string');
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const page = doc.addPage([slideW, slideH]);

    // Nền slide sáng kèm thanh nhấn ở đầu trang
    page.drawRectangle({ x: 0, y: 0, width: slideW, height: slideH, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 0, y: slideH - 8, width: slideW, height: 8, color: rgb(0.11, 0.39, 0.85) });

    // Tách dòng chữ từ các khối hình (sp)
    const paragraphs: string[] = [];
    dom.querySelectorAll('sp').forEach((sp) => {
      sp.querySelectorAll('p').forEach((p) => {
        const line = Array.from(p.querySelectorAll('t'))
          .map((t) => t.textContent ?? '')
          .join('')
          .trim();
        if (line) paragraphs.push(line);
      });
    });

    let y = slideH - margin - 6;
    const title = paragraphs[0] ?? `Trang trình chiếu ${sIdx + 1}`;
    const bodyLines = paragraphs.slice(1);

    const titleWrapped = wrapLine(title, fonts.bold, 22, slideW - margin * 2);
    for (const ln of titleWrapped) {
      y -= 24;
      page.drawText(ln, { x: margin, y, font: fonts.bold, size: 22, color: rgb(0.07, 0.12, 0.24) });
    }
    y -= 14;

    // Kiểm tra ảnh liên kết trong _rels của slide
    const slideFileName = slidePath.split('/').pop()!;
    const relsPath = `ppt/slides/_rels/${slideFileName}.rels`;
    const relsXml = await zip.file(relsPath)?.async('string');
    const slideImages: { bytes: Uint8Array; isPng: boolean }[] = [];
    if (relsXml) {
      const relDom = new DOMParser().parseFromString(relsXml, 'application/xml');
      const targets = Array.from(relDom.querySelectorAll('Relationship'))
        .map((r) => r.getAttribute('Target') ?? '')
        .filter((t) => /\.(png|jpe?g)$/i.test(t));
      for (const target of targets) {
        const cleanPath = target.replace(/^\.\.\//, 'ppt/');
        const imgEntry = zip.file(cleanPath);
        if (imgEntry) {
          slideImages.push({
            bytes: await imgEntry.async('uint8array'),
            isPng: /\.png$/i.test(cleanPath),
          });
        }
      }
    }

    const textColW = slideImages.length ? (slideW - margin * 2) * 0.56 : slideW - margin * 2;
    for (const para of bodyLines) {
      const lines = wrapLine(`• ${para}`, fonts.regular, 14, textColW);
      for (const ln of lines) {
        if (y < margin + 18) break;
        y -= 19;
        page.drawText(ln, { x: margin, y, font: fonts.regular, size: 14, color: rgb(0.16, 0.2, 0.28) });
      }
      y -= 5;
    }

    if (slideImages.length) {
      const imgInfo = slideImages[0];
      try {
        const embedded = imgInfo.isPng ? await doc.embedPng(imgInfo.bytes) : await doc.embedJpg(imgInfo.bytes);
        const boxW = (slideW - margin * 2) * 0.4;
        const boxH = slideH - margin * 2 - 50;
        const scale = Math.min(1, boxW / embedded.width, boxH / embedded.height);
        const dw = embedded.width * scale;
        const dh = embedded.height * scale;
        page.drawImage(embedded, {
          x: slideW - margin - boxW + (boxW - dw) / 2,
          y: margin + (boxH - dh) / 2,
          width: dw,
          height: dh,
        });
      } catch {
        /* bỏ qua ảnh định dạng lạ */
      }
    }

    // Số trang slide ở góc phải dưới
    const footer = `${sIdx + 1} / ${slideFiles.length}`;
    const fw = fonts.regular.widthOfTextAtSize(footer, 10);
    page.drawText(footer, {
      x: slideW - margin - fw,
      y: 16,
      font: fonts.regular,
      size: 10,
      color: rgb(0.45, 0.5, 0.58),
    });
  }

  if (doc.getPageCount() === 0) {
    doc.addPage([slideW, slideH]);
  }
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// 4. OpenDocument (.odt, .ods, .odp, .odg) -> PDF
// ---------------------------------------------------------------------------
export async function convertOdfToPdf(
  buffer: ArrayBuffer,
  kind: 'odt' | 'ods' | 'odp' | 'odg',
  opts: LayoutOptions = {}
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const contentXml = await zip.file('content.xml')?.async('string');
  if (!contentXml) throw new Error('Tệp OpenDocument không hợp lệ (thiếu content.xml).');
  const dom = new DOMParser().parseFromString(contentXml, 'application/xml');
  const blocks: DocBlock[] = [];

  if (kind === 'ods') {
    const tables = Array.from(dom.getElementsByTagName('table:table'));
    tables.forEach((tb, idx) => {
      if (idx > 0) blocks.push({ kind: 'pageBreak' });
      const name = tb.getAttribute('table:name') || `Bảng ${idx + 1}`;
      blocks.push({ kind: 'heading', level: 2, text: name });
      const rows: string[][] = [];
      Array.from(tb.getElementsByTagName('table:table-row')).forEach((tr) => {
        const row: string[] = [];
        Array.from(tr.getElementsByTagName('table:table-cell')).forEach((tc) => {
          const repeat = Math.min(20, Math.max(1, Number(tc.getAttribute('table:number-columns-repeated') || '1')));
          const val = (tc.textContent ?? '').trim();
          for (let r = 0; r < repeat; r++) row.push(val);
        });
        while (row.length && !row[row.length - 1]) row.pop();
        if (row.some(Boolean)) rows.push(row);
      });
      if (rows.length) blocks.push({ kind: 'table', headers: rows[0], rows: rows.slice(1) });
    });
    return renderBlocksToPdf(blocks, { orientation: 'landscape', ...opts });
  }

  if (kind === 'odp' || kind === 'odg') {
    const pages = Array.from(dom.getElementsByTagName('draw:page'));
    pages.forEach((pg, idx) => {
      if (idx > 0) blocks.push({ kind: 'pageBreak' });
      const name = pg.getAttribute('draw:name') || `Trang ${idx + 1}`;
      blocks.push({ kind: 'heading', level: 1, text: name });
      Array.from(pg.getElementsByTagName('text:p')).forEach((p) => {
        const t = (p.textContent ?? '').trim();
        if (t) blocks.push({ kind: 'paragraph', text: t });
      });
    });
    return renderBlocksToPdf(blocks, { orientation: kind === 'odp' ? 'landscape' : 'portrait', ...opts });
  }

  // kind === 'odt'
  const body = dom.getElementsByTagName('office:text')[0] ?? dom.documentElement;
  for (const child of Array.from(body.children)) {
    const tag = child.tagName;
    if (tag === 'text:h') {
      const lvl = Math.min(4, Math.max(1, Number(child.getAttribute('text:outline-level') || '1'))) as 1 | 2 | 3 | 4;
      const t = (child.textContent ?? '').trim();
      if (t) blocks.push({ kind: 'heading', level: lvl, text: t });
    } else if (tag === 'text:p') {
      const t = (child.textContent ?? '').trim();
      if (t) blocks.push({ kind: 'paragraph', text: t });
    } else if (tag === 'text:list') {
      const items = Array.from(child.getElementsByTagName('text:list-item'))
        .map((li) => (li.textContent ?? '').trim())
        .filter(Boolean);
      if (items.length) blocks.push({ kind: 'list', items });
    } else if (tag === 'table:table') {
      const rows = Array.from(child.getElementsByTagName('table:table-row'))
        .map((tr) =>
          Array.from(tr.getElementsByTagName('table:table-cell')).map((tc) => (tc.textContent ?? '').trim())
        )
        .filter((r) => r.some(Boolean));
      if (rows.length) blocks.push({ kind: 'table', headers: rows[0], rows: rows.slice(1) });
    }
  }
  if (!blocks.length) blocks.push({ kind: 'paragraph', text: (body.textContent ?? '').trim() || 'Tài liệu trống.' });
  return renderBlocksToPdf(blocks, opts);
}

// ---------------------------------------------------------------------------
// 5. PDF -> Word (.docx chuẩn OOXML)
// ---------------------------------------------------------------------------
export async function convertPdfToDocx(buffer: ArrayBuffer, includePageBreaks = true): Promise<Uint8Array> {
  const pages = await extractStructuredPages(buffer);
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="180" w:after="80"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
</w:styles>`
  );

  const bodyParts: string[] = [];
  pages.forEach((pg, pIdx) => {
    if (pIdx > 0 && includePageBreaks) {
      bodyParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
    for (const ln of pg.lines) {
      const style = ln.isHeading ? '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' : '';
      bodyParts.push(
        `<w:p>${style}<w:r><w:t xml:space="preserve">${xmlEscape(ln.text)}</w:t></w:r></w:p>`
      );
    }
    for (const tb of pg.tables) {
      const rowsXml = tb
        .map(
          (row) =>
            `<w:tr>${row
              .map(
                (cell) =>
                  `<w:tc><w:p><w:r><w:t xml:space="preserve">${xmlEscape(cell)}</w:t></w:r></w:p></w:tc>`
              )
              .join('')}</w:tr>`
        )
        .join('');
      bodyParts.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${rowsXml}</w:tbl>`);
    }
  });

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParts.join('\n    ')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`
  );

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------
// 6. PDF -> Excel (.xlsx chuẩn OOXML)
// ---------------------------------------------------------------------------
function indexToColLetters(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function convertPdfToXlsx(buffer: ArrayBuffer, sheetPerPage = false): Promise<Uint8Array> {
  const pages = await extractStructuredPages(buffer);
  const sheets: { name: string; rows: string[][] }[] = [];

  if (sheetPerPage) {
    pages.forEach((p) => {
      const rows = p.tables.length ? p.tables.flat() : p.lines.map((l) => l.spans.map((s) => s.str));
      sheets.push({ name: `Trang ${p.pageNumber}`, rows });
    });
  } else {
    const allRows = pages.flatMap((p) =>
      p.tables.length ? p.tables.flat() : p.lines.map((l) => l.spans.map((s) => s.str))
    );
    sheets.push({ name: 'DuLieuPDF', rows: allRows });
  }
  if (!sheets.length) sheets.push({ name: 'DuLieuPDF', rows: [['Không có dữ liệu']] });

  const zip = new JSZip();
  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetOverrides}
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );

  const wbSheets = sheets
    .map(
      (sh, i) =>
        `    <sheet name="${xmlEscape(sh.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join('\n');

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${wbSheets}
  </sheets>
</workbook>`
  );

  const wbRels = sheets
    .map(
      (_, i) =>
        `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n');

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${wbRels}
</Relationships>`
  );

  sheets.forEach((sh, sIdx) => {
    const rowsXml = sh.rows
      .map((row, rIdx) => {
        const rNum = rIdx + 1;
        const cells = row
          .map((cell, cIdx) => {
            const ref = `${indexToColLetters(cIdx)}${rNum}`;
            const num = Number(cell.replace(/,/g, ''));
            if (cell !== '' && !Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(cell.trim())) {
              return `<c r="${ref}"><v>${num}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
          })
          .join('');
        return `<row r="${rNum}">${cells}</row>`;
      })
      .join('\n    ');

    zip.file(
      `xl/worksheets/sheet${sIdx + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rowsXml}
  </sheetData>
</worksheet>`
    );
  });

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

