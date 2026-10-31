import React, { useState } from 'react';
import { BookOpen, FileCode, FileImage, FileText, Upload } from 'lucide-react';
import JSZip from 'jszip';
import { marked } from 'marked';
import { PDFDocument, rgb } from 'pdf-lib';
import * as UTIF from 'utif';
import { baseName, formatBytes } from '../core/download';
import { htmlToDocBlocks, parseCsvRows, renderBlocksToPdf, type DocBlock } from '../core/docLayout';
import type { FontFamily } from '../core/fonts';
import { savePdf } from '../core/ops';
import { MM_TO_PT, PAPER_SIZES, paperDims, type Orientation, type PaperId } from '../core/paper';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented, Toggle, ToolLayout, ToolShell } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';

// ---------------------------------------------------------------------------
// Bộ giải mã ảnh đa định dạng (JPG, PNG, WebP, SVG, BMP, HEIC, TIFF nhiều trang, CBZ)
// ---------------------------------------------------------------------------
interface DecodedImage {
  name: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  format: 'png' | 'jpg';
  previewUrl: string;
}

async function canvasToDecoded(canvas: HTMLCanvasElement, name: string, preferJpeg: boolean): Promise<DecodedImage> {
  const mime = preferJpeg ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không xuất được ảnh từ canvas.'))), mime, 0.9);
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const previewUrl = canvas.toDataURL('image/jpeg', 0.72);
  return {
    name,
    width: canvas.width,
    height: canvas.height,
    bytes,
    format: preferJpeg ? 'jpg' : 'png',
    previewUrl,
  };
}

async function decodeSingleImageBlob(blob: Blob, name: string): Promise<DecodedImage[]> {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'tif' || ext === 'tiff' || blob.type === 'image/tiff') {
    const buf = await blob.arrayBuffer();
    const ifds = UTIF.decode(buf);
    const out: DecodedImage[] = [];
    for (let i = 0; i < ifds.length; i++) {
      const ifd = ifds[i];
      UTIF.decodeImage(buf, ifd);
      const rgba = UTIF.toRGBA8(ifd);
      const canvas = document.createElement('canvas');
      canvas.width = ifd.width;
      canvas.height = ifd.height;
      const ctx = canvas.getContext('2d')!;
      const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer), ifd.width, ifd.height);
      ctx.putImageData(imgData, 0, 0);
      out.push(await canvasToDecoded(canvas, ifds.length > 1 ? `${name} (trang ${i + 1})` : name, true));
    }
    return out;
  }

  if (ext === 'cbz' || ext === 'zip') {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const entries = Object.values(zip.files)
      .filter((f) => !f.dir && /\.(jpe?g|png|webp|bmp|gif|svg|tiff?)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const out: DecodedImage[] = [];
    for (const entry of entries) {
      const subBlob = await entry.async('blob');
      const pages = await decodeSingleImageBlob(subBlob, entry.name);
      out.push(...pages);
    }
    return out;
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = Math.max(1, img.naturalWidth || img.width || 800);
    const h = Math.max(1, img.naturalHeight || img.height || 600);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const isJpeg = ext === 'jpg' || ext === 'jpeg' || blob.type === 'image/jpeg';
    return [await canvasToDecoded(canvas, name, isJpeg)];
  } catch {
    throw new Error(
      ext === 'heic' || ext === 'heif'
        ? `Trình duyệt hiện tại không hỗ trợ giải mã trực tiếp định dạng HEIC (${name}). Vui lòng mở bằng Safari hoặc chuyển sang JPG/PNG.`
        : `Không đọc được tệp ảnh "${name}".`
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function buildImagesPdf(
  images: DecodedImage[],
  options: {
    pageSize: 'auto' | PaperId;
    orientation: 'auto' | Orientation;
    marginMm: number;
  }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const margin = Math.max(0, options.marginMm) * MM_TO_PT;
  for (const it of images) {
    const embedded = it.format === 'png' ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes);
    if (options.pageSize === 'auto') {
      const w = it.width * 0.75 + margin * 2;
      const h = it.height * 0.75 + margin * 2;
      const page = doc.addPage([w, h]);
      page.drawImage(embedded, { x: margin, y: margin, width: w - margin * 2, height: h - margin * 2 });
    } else {
      const orient: Orientation =
        options.orientation === 'auto' ? (it.width > it.height ? 'landscape' : 'portrait') : options.orientation;
      const [pageW, pageH] = paperDims(options.pageSize, orient);
      const page = doc.addPage([pageW, pageH]);
      page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(1, 1, 1) });
      const availW = Math.max(36, pageW - margin * 2);
      const availH = Math.max(36, pageH - margin * 2);
      const scale = Math.min(availW / it.width, availH / it.height);
      const drawW = it.width * scale;
      const drawH = it.height * scale;
      page.drawImage(embedded, {
        x: margin + (availW - drawW) / 2,
        y: margin + (availH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  }
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// Khung chung cho nhóm Ảnh / CBZ -> PDF
// ---------------------------------------------------------------------------
const ImageToPdfWorkspace: React.FC<{
  toolId: string;
  accept: string;
  dropHint: string;
}> = ({ toolId, accept, dropHint }) => {
  const task = useTask();
  const [items, setItems] = useState<DecodedImage[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useToolState<'auto' | PaperId>(toolId, 'paper', 'A4');
  const [orient, setOrient] = useToolState<'auto' | Orientation>(toolId, 'orient', 'auto');
  const [margin, setMargin] = useToolState(toolId, 'margin', 10);
  const [mergeOne, setMergeOne] = useToolState(toolId, 'merge', true);

  const onAddFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setLoadingError(null);
    const decoded: DecodedImage[] = [];
    for (const f of Array.from(fileList)) {
      try {
        const res = await decodeSingleImageBlob(f, f.name);
        decoded.push(...res);
      } catch (e) {
        setLoadingError(e instanceof Error ? e.message : String(e));
      }
    }
    if (decoded.length) setItems((prev) => [...prev, ...decoded]);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
  };

  const run = () =>
    task.run(async (report) => {
      if (mergeOne || items.length === 1) {
        report(30, 'Đang đóng gói các ảnh vào PDF...');
        const bytes = await buildImagesPdf(items, { pageSize, orientation: orient, marginMm: margin });
        return [{ name: `${baseName(items[0]?.name ?? 'anh')}.pdf`, bytes }];
      }
      const outs = [];
      for (let i = 0; i < items.length; i++) {
        report(Math.round(((i + 1) / items.length) * 100), `Đang chuyển ảnh ${i + 1}/${items.length}...`);
        const bytes = await buildImagesPdf([items[i]], { pageSize, orientation: orient, marginMm: margin });
        outs.push({ name: `${baseName(items[i].name)}.pdf`, bytes });
      }
      return outs;
    });

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          <div>
            <div className="pdft-bar" style={{ marginBottom: 12 }}>
              <strong>{items.length} trang ảnh</strong>
              <div className="pdft-bar__spacer" />
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={15} /> + Thêm tệp ảnh
                <input type="file" accept={accept} multiple hidden onChange={(e) => onAddFiles(e.target.files)} />
              </label>
              {items.length > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems([])}>
                  Xóa hết
                </button>
              )}
            </div>
            {loadingError && (
              <div style={{ marginBottom: 10 }}>
                <Notice kind="error">{loadingError}</Notice>
              </div>
            )}
            {items.length === 0 ? (
              <label className="pdft-drop" style={{ cursor: 'pointer' }}>
                <FileImage size={36} />
                <div className="pdft-drop__title">{dropHint}</div>
                <div className="pdft-drop__sub">Xử lý hoàn toàn trên trình duyệt — có thể chọn nhiều tệp cùng lúc.</div>
                <input type="file" accept={accept} multiple hidden onChange={(e) => onAddFiles(e.target.files)} />
              </label>
            ) : (
              <div className="pdft-files">
                {items.map((it, i) => (
                  <div key={i} className="pdft-file" style={{ gridTemplateColumns: '64px 1fr auto' }}>
                    <img
                      src={it.previewUrl}
                      alt={it.name}
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-subtle)' }}
                    />
                    <div>
                      <strong>
                        {i + 1}. {it.name}
                      </strong>
                      <div className="pdft-file__meta">
                        {it.width} × {it.height} px · {formatBytes(it.bytes.byteLength)}
                      </div>
                    </div>
                    <div className="pdft-file__actions">
                      <button type="button" className="pdft-icon-btn" disabled={i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="pdft-icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="pdft-icon-btn pdft-icon-btn--danger"
                        onClick={() => setItems(items.filter((_, k) => k !== i))}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
        panel={
          <>
            <h3>Tùy chọn trang PDF</h3>
            <Field label="Khổ giấy" htmlFor="img-paper">
              <select
                id="img-paper"
                className="pdft-select"
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as 'auto' | PaperId)}
              >
                <option value="auto">Tự khớp kích thước từng ảnh</option>
                {PAPER_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            {pageSize !== 'auto' && (
              <Field label="Hướng giấy">
                <Segmented
                  label="Hướng giấy"
                  value={orient}
                  onChange={setOrient}
                  options={[
                    { value: 'auto', label: 'Tự động' },
                    { value: 'portrait', label: 'Dọc' },
                    { value: 'landscape', label: 'Ngang' },
                  ]}
                />
              </Field>
            )}
            <Field label="Lề trang (mm)" htmlFor="img-margin">
              <NumberInput id="img-margin" value={margin} min={0} max={50} onChange={setMargin} />
            </Field>
            {items.length > 1 && (
              <Toggle checked={mergeOne} onChange={setMergeOne} label="Gộp tất cả ảnh vào 1 tệp PDF duy nhất" />
            )}
            <ProcessButton
              task={task}
              label="Tạo tệp PDF"
              icon={<FileImage size={18} />}
              disabled={items.length === 0}
              onClick={run}
            />
            <ResultPanel task={task} zipName="anh-sang-pdf.zip" />
          </>
        }
      />
    </ToolShell>
  );
};

export const ImageToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="image-to-pdf" accept="image/*,.tif,.tiff,.heic,.heif" dropHint="Chọn ảnh JPG, PNG, WebP, SVG, BMP, TIFF..." />
);
export const JpgToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="jpg-to-pdf" accept="image/jpeg,.jpg,.jpeg" dropHint="Chọn các tệp ảnh JPG / JPEG" />
);
export const PngToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="png-to-pdf" accept="image/png,.png" dropHint="Chọn các tệp ảnh PNG" />
);
export const WebpToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="webp-to-pdf" accept="image/webp,.webp" dropHint="Chọn các tệp ảnh WebP" />
);
export const SvgToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="svg-to-pdf" accept="image/svg+xml,.svg" dropHint="Chọn các tệp hình vector SVG" />
);
export const BmpToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="bmp-to-pdf" accept="image/bmp,.bmp" dropHint="Chọn các tệp ảnh Bitmap (BMP)" />
);
export const HeicToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="heic-to-pdf" accept=".heic,.heif,image/heic,image/heif,image/*" dropHint="Chọn ảnh HEIC / HEIF chụp từ iPhone" />
);
export const TiffToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="tiff-to-pdf" accept=".tif,.tiff,image/tiff" dropHint="Chọn tệp ảnh TIFF (hỗ trợ TIFF nhiều trang)" />
);
export const CbzToPdf: React.FC = () => (
  <ImageToPdfWorkspace toolId="cbz-to-pdf" accept=".cbz,.zip,application/zip" dropHint="Chọn tệp truyện tranh CBZ / ZIP chứa ảnh" />
);

// ---------------------------------------------------------------------------
// Bộ phân tích định dạng văn bản / dữ liệu / ebook sang DocBlock[]
// ---------------------------------------------------------------------------
function rtfToPlainText(rtf: string): string {
  // Giải mã ký tự Unicode \uN? (RTF dùng số nguyên 16-bit có dấu) và \'hh
  let s = rtf
    .replace(/\\par\b|\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\u(-?\d+)\??/g, (_, num) => {
      const code = Number(num);
      return String.fromCharCode(code < 0 ? code + 65536 : code);
    })
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Bỏ nhóm fonttbl, colortbl, stylesheet, info
  s = s.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|\*\\[a-z]+)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, '');
  // Bỏ các từ điều khiển RTF còn lại
  s = s.replace(/\\[a-z]+-?\d*\s?/gi, '').replace(/[{}]/g, '');
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function decodeMimeWords(str: string): string {
  return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, enc, body) => {
    try {
      if (String(enc).toUpperCase() === 'B') {
        const bin = atob(body);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder(charset).decode(bytes);
      }
      const qp = body.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__: string, h: string) => String.fromCharCode(parseInt(h, 16)));
      const bytes = Uint8Array.from(qp, (c: string) => c.charCodeAt(0));
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return body;
    }
  });
}

function parseEmailToBlocks(raw: string): DocBlock[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const splitIdx = normalized.indexOf('\n\n');
  const headerPart = splitIdx >= 0 ? normalized.slice(0, splitIdx) : '';
  let bodyPart = splitIdx >= 0 ? normalized.slice(splitIdx + 2) : normalized;
  const unfolded = headerPart.replace(/\n[ \t]+/g, ' ');
  const headers: Record<string, string> = {};
  for (const line of unfolded.split('\n')) {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (m) headers[m[1].toLowerCase()] = decodeMimeWords(m[2].trim());
  }

  // Giải mã Quoted-Printable nếu có
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headerPart)) {
    const soft = bodyPart.replace(/=\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < soft.length; i++) {
      if (soft[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
        bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(soft.charCodeAt(i));
      }
    }
    bodyPart = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }

  const blocks: DocBlock[] = [];
  if (headers.subject) blocks.push({ kind: 'heading', level: 1, text: headers.subject });
  const metaRows: string[][] = [];
  if (headers.from) metaRows.push(['Người gửi (From)', headers.from]);
  if (headers.to) metaRows.push(['Người nhận (To)', headers.to]);
  if (headers.cc) metaRows.push(['Đồng kính gửi (Cc)', headers.cc]);
  if (headers.date) metaRows.push(['Thời gian (Date)', headers.date]);
  if (metaRows.length) {
    blocks.push({ kind: 'table', rows: metaRows });
    blocks.push({ kind: 'hr' });
  }
  if (/<html|<body|<div|<p>/i.test(bodyPart)) {
    blocks.push(...htmlToDocBlocks(bodyPart));
  } else {
    for (const para of bodyPart.split(/\n{2,}/)) {
      const t = para.trim();
      if (t) blocks.push({ kind: 'paragraph', text: t });
    }
  }
  return blocks;
}

async function parseEpubToBlocks(buffer: ArrayBuffer): Promise<DocBlock[]> {
  const zip = await JSZip.loadAsync(buffer);
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  let opfPath = '';
  if (containerXml) {
    const m = /full-path="([^"]+)"/i.exec(containerXml);
    if (m) opfPath = m[1];
  }
  if (!opfPath) {
    opfPath = Object.keys(zip.files).find((k) => /\.opf$/i.test(k)) ?? '';
  }
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const blocks: DocBlock[] = [];

  if (opfPath && zip.file(opfPath)) {
    const opfText = await zip.file(opfPath)!.async('string');
    const dom = new DOMParser().parseFromString(opfText, 'application/xml');
    const title = dom.querySelector('title, dc\\:title')?.textContent?.trim();
    if (title) blocks.push({ kind: 'heading', level: 1, text: title });

    const manifest = new Map<string, string>();
    dom.querySelectorAll('manifest > item').forEach((it) => {
      const id = it.getAttribute('id');
      const href = it.getAttribute('href');
      if (id && href) manifest.set(id, baseDir + href);
    });
    const spineIds = Array.from(dom.querySelectorAll('spine > itemref'))
      .map((ir) => ir.getAttribute('idref') ?? '')
      .filter(Boolean);
    const chapterPaths = spineIds.map((id) => manifest.get(id)).filter((p): p is string => !!p);
    for (const path of chapterPaths) {
      const f = zip.file(path) ?? zip.file(decodeURIComponent(path));
      if (!f) continue;
      const html = await f.async('string');
      blocks.push(...htmlToDocBlocks(html));
    }
  } else {
    const htmlFiles = Object.values(zip.files)
      .filter((f) => !f.dir && /\.(x?html|htm)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const f of htmlFiles) {
      blocks.push(...htmlToDocBlocks(await f.async('string')));
    }
  }
  return blocks.length ? blocks : [{ kind: 'paragraph', text: 'Không tìm thấy nội dung chương trong tệp EPUB.' }];
}

async function parseFb2ToBlocks(buffer: ArrayBuffer, fileName: string): Promise<DocBlock[]> {
  let xmlText = '';
  if (/\.zip$/i.test(fileName)) {
    const zip = await JSZip.loadAsync(buffer);
    const fb2Entry = Object.values(zip.files).find((f) => !f.dir && /\.fb2$/i.test(f.name));
    if (fb2Entry) xmlText = await fb2Entry.async('string');
  } else {
    xmlText = new TextDecoder('utf-8').decode(buffer);
  }
  const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
  const blocks: DocBlock[] = [];
  const bookTitle = dom.querySelector('book-title')?.textContent?.trim();
  if (bookTitle) blocks.push({ kind: 'heading', level: 1, text: bookTitle });
  dom.querySelectorAll('body section').forEach((sec) => {
    const title = sec.querySelector(':scope > title')?.textContent?.trim();
    if (title) blocks.push({ kind: 'heading', level: 2, text: title });
    sec.querySelectorAll(':scope > p, :scope > subtitle, :scope > v').forEach((p) => {
      const t = (p.textContent ?? '').trim();
      if (!t) return;
      if (p.tagName.toLowerCase() === 'subtitle') blocks.push({ kind: 'heading', level: 3, text: t });
      else blocks.push({ kind: 'paragraph', text: t });
    });
  });
  return blocks.length ? blocks : [{ kind: 'paragraph', text: dom.documentElement?.textContent?.trim() || 'Tệp FB2 trống.' }];
}

function parseXmlToBlocks(xmlText: string): DocBlock[] {
  const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
  const root = dom.documentElement;
  if (!root || root.nodeName === 'parsererror') {
    return [{ kind: 'code', text: xmlText }];
  }
  const blocks: DocBlock[] = [{ kind: 'heading', level: 1, text: `<${root.nodeName}>` }];
  const children = Array.from(root.children);
  // Nếu các phần tử con lặp lại cùng cấu trúc -> dựng bảng
  if (children.length >= 2 && children[0].children.length > 0) {
    const cols = Array.from(new Set(children.flatMap((c) => Array.from(c.children).map((sub) => sub.nodeName))));
    if (cols.length >= 1 && cols.length <= 10) {
      const rows = children.map((c) => cols.map((col) => c.querySelector(col)?.textContent?.trim() ?? ''));
      blocks.push({ kind: 'table', headers: cols, rows });
      return blocks;
    }
  }
  blocks.push({ kind: 'code', text: xmlText });
  return blocks;
}

function parseJsonToBlocks(jsonText: string): DocBlock[] {
  try {
    const parsed = JSON.parse(jsonText);
    const blocks: DocBlock[] = [];
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      const keys = Array.from(new Set(parsed.slice(0, 100).flatMap((row) => Object.keys(row as object)))).slice(0, 10);
      const rows = parsed.map((row) =>
        keys.map((k) => {
          const v = (row as Record<string, unknown>)[k];
          return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        })
      );
      blocks.push({ kind: 'heading', level: 2, text: `Bảng dữ liệu (${parsed.length} bản ghi)` });
      blocks.push({ kind: 'table', headers: keys, rows });
    } else if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const rows = Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
        k,
        typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
      ]);
      blocks.push({ kind: 'table', headers: ['Trường (Key)', 'Giá trị (Value)'], rows });
    }
    blocks.push({ kind: 'heading', level: 3, text: 'Nội dung JSON chi tiết' });
    blocks.push({ kind: 'code', text: JSON.stringify(parsed, null, 2) });
    return blocks;
  } catch {
    return [{ kind: 'code', text: jsonText }];
  }
}

// ---------------------------------------------------------------------------
// Khung chung cho nhóm Văn bản / Dữ liệu / Ebook -> PDF
// ---------------------------------------------------------------------------
type TextFormatKind = 'txt' | 'markdown' | 'csv' | 'json' | 'xml' | 'rtf' | 'email' | 'epub' | 'fb2';

const TextToPdfWorkspace: React.FC<{
  toolId: string;
  kind: TextFormatKind;
  accept: string;
  sampleText?: string;
  defaultOrient?: Orientation;
}> = ({ toolId, kind, accept, sampleText = '', defaultOrient = 'portrait' }) => {
  const task = useTask();
  const [text, setText] = useToolState(toolId, 'text', sampleText);
  const [fileName, setFileName] = useState<string>('tai-lieu');
  const [binaryBuffer, setBinaryBuffer] = useState<ArrayBuffer | null>(null);
  const [paper, setPaper] = useToolState<PaperId>(toolId, 'paper', 'A4');
  const [orient, setOrient] = useToolState<Orientation>(toolId, 'orient', defaultOrient);
  const [family, setFamily] = useToolState<FontFamily>(toolId, 'family', 'sans');
  const [fontSize, setFontSize] = useToolState(toolId, 'size', 11);

  const isBinaryOnly = kind === 'epub';

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFileName(baseName(f.name));
    const buf = await f.arrayBuffer();
    setBinaryBuffer(buf);
    if (!isBinaryOnly && !/\.zip$/i.test(f.name)) {
      setText(new TextDecoder('utf-8').decode(buf));
    }
  };

  const run = () =>
    task.run(async () => {
      let blocks: DocBlock[] = [];
      switch (kind) {
        case 'txt':
          blocks = text.split(/\n{2,}/).map((p) => ({ kind: 'paragraph', text: p }));
          break;
        case 'markdown': {
          const html = await marked.parse(text);
          blocks = htmlToDocBlocks(html);
          break;
        }
        case 'csv': {
          const rows = parseCsvRows(text);
          blocks = rows.length ? [{ kind: 'table', headers: rows[0], rows: rows.slice(1) }] : [];
          break;
        }
        case 'json':
          blocks = parseJsonToBlocks(text);
          break;
        case 'xml':
          blocks = parseXmlToBlocks(text);
          break;
        case 'rtf': {
          const plain = rtfToPlainText(text);
          blocks = plain.split(/\n{2,}/).map((p) => ({ kind: 'paragraph', text: p }));
          break;
        }
        case 'email':
          blocks = parseEmailToBlocks(text);
          break;
        case 'epub':
          if (!binaryBuffer) throw new Error('Vui lòng chọn tệp .epub.');
          blocks = await parseEpubToBlocks(binaryBuffer);
          break;
        case 'fb2':
          if (binaryBuffer) blocks = await parseFb2ToBlocks(binaryBuffer, fileName);
          else blocks = await parseFb2ToBlocks(new TextEncoder().encode(text).buffer as ArrayBuffer, 'sach.fb2');
          break;
      }
      if (!blocks.length) blocks = [{ kind: 'paragraph', text: text || 'Tài liệu trống.' }];
      const bytes = await renderBlocksToPdf(blocks, {
        paper,
        orientation: orient,
        family,
        fontSize,
        title: fileName,
      });
      return [{ name: `${fileName}.pdf`, bytes }];
    });

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          <div>
            <div className="pdft-bar" style={{ marginBottom: 12 }}>
              <strong>Nguồn dữ liệu ({kind.toUpperCase()})</strong>
              <div className="pdft-bar__spacer" />
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={15} /> Chọn tệp từ máy
                <input type="file" accept={accept} hidden onChange={onPickFile} />
              </label>
            </div>
            {isBinaryOnly ? (
              <label className="pdft-drop" style={{ cursor: 'pointer' }}>
                <BookOpen size={36} />
                <div className="pdft-drop__title">
                  {binaryBuffer ? `Đã nạp: ${fileName}.epub (${formatBytes(binaryBuffer.byteLength)})` : 'Chọn tệp sách điện tử .EPUB'}
                </div>
                <div className="pdft-drop__sub">Đọc toàn bộ chương sách và định dạng sang trang PDF tiếng Việt.</div>
                <input type="file" accept={accept} hidden onChange={onPickFile} />
              </label>
            ) : (
              <Field label="Nội dung (có thể chọn tệp ở trên hoặc dán/chỉnh sửa trực tiếp bên dưới)" htmlFor="txt-src">
                <textarea
                  id="txt-src"
                  className="pdft-textarea"
                  rows={16}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  style={{ fontFamily: kind === 'json' || kind === 'xml' || kind === 'csv' ? 'monospace' : undefined }}
                />
              </Field>
            )}
          </div>
        }
        panel={
          <>
            <h3>Định dạng trang PDF</h3>
            <Field label="Khổ giấy" htmlFor="doc-paper">
              <select id="doc-paper" className="pdft-select" value={paper} onChange={(e) => setPaper(e.target.value as PaperId)}>
                {PAPER_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hướng trang">
              <Segmented
                label="Hướng trang"
                value={orient}
                onChange={setOrient}
                options={[
                  { value: 'portrait', label: 'Khổ dọc' },
                  { value: 'landscape', label: 'Khổ ngang' },
                ]}
              />
            </Field>
            <Field label="Phông chữ tiếng Việt">
              <Segmented
                label="Phông chữ"
                value={family}
                onChange={setFamily}
                options={[
                  { value: 'sans', label: 'Không chân' },
                  { value: 'serif', label: 'Có chân' },
                  { value: 'mono', label: 'Đơn cách' },
                ]}
              />
            </Field>
            <Field label="Cỡ chữ chuẩn (pt)" htmlFor="doc-size">
              <NumberInput id="doc-size" value={fontSize} min={8} max={22} onChange={setFontSize} />
            </Field>
            <ProcessButton
              task={task}
              label="Xuất sang PDF"
              icon={kind === 'json' || kind === 'xml' ? <FileCode size={18} /> : <FileText size={18} />}
              disabled={isBinaryOnly ? !binaryBuffer : !text.trim() && !binaryBuffer}
              onClick={run}
            />
            <ResultPanel task={task} />
          </>
        }
      />
    </ToolShell>
  );
};

export const TxtToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="txt-to-pdf"
    kind="txt"
    accept=".txt,.log,text/plain"
    sampleText={'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n\nNhập hoặc chọn tệp văn bản (.txt) để chuyển sang PDF chuẩn tiếng Việt.'}
  />
);

export const MarkdownToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="markdown-to-pdf"
    kind="markdown"
    accept=".md,.markdown,text/markdown,text/plain"
    sampleText={'# Báo cáo tổng hợp\n\nTài liệu được chuyển từ **Markdown** sang PDF với đầy đủ dấu tiếng Việt.\n\n- Mục thứ nhất\n- Mục thứ hai\n\n| STT | Hạng mục | Trạng thái |\n|---|---|---|\n| 1 | Gộp & Tách PDF | Hoàn thành |\n| 2 | Xuất báo cáo | Sẵn sàng |'}
  />
);

export const CsvToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="csv-to-pdf"
    kind="csv"
    accept=".csv,.tsv,text/csv,text/tab-separated-values"
    defaultOrient="landscape"
    sampleText={'STT,Họ và tên,Phòng ban,Ghi chú\n1,Nguyễn Văn An,Kế toán,Đã đối chiếu\n2,Trần Thị Bình,Hành chính,Hoàn thành\n3,Lê Hoàng Cường,Kỹ thuật,Đang xử lý'}
  />
);

export const JsonToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="json-to-pdf"
    kind="json"
    accept=".json,application/json"
    sampleText={'[\n  { "ma": "HS-001", "ten": "Hợp đồng nguyên tắc", "trangThai": "Đã duyệt" },\n  { "ma": "HS-002", "ten": "Biên bản nghiệm thu", "trangThai": "Chờ ký" }\n]'}
  />
);

export const XmlToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="xml-to-pdf"
    kind="xml"
    accept=".xml,text/xml,application/xml"
    sampleText={'<DanhSachHoSo>\n  <HoSo>\n    <Ma>HS-01</Ma>\n    <Ten>Quyết định phê duyệt</Ten>\n  </HoSo>\n  <HoSo>\n    <Ma>HS-02</Ma>\n    <Ten>Tờ trình thẩm định</Ten>\n  </HoSo>\n</DanhSachHoSo>'}
  />
);

export const RtfToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="rtf-to-pdf"
    kind="rtf"
    accept=".rtf,application/rtf,text/rtf"
    sampleText={'{\\rtf1\\ansi\\deff0 Ch\\u7885?n t\\u7879?p RTF ho\\u7863?c d\\u225?n n\\u7897?i dung v\\u224?o \\u273?\\u226?y.}'}
  />
);

export const EmailToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="email-to-pdf"
    kind="email"
    accept=".eml,.txt,message/rfc822"
    sampleText={'From: Phòng Hành chính <hanhchinh@example.vn>\nTo: Ban Giám đốc <bgd@example.vn>\nDate: Mon, 31 Oct 2026 09:00:00 +0700\nSubject: Thông báo lịch họp giao ban tuần\n\nKính gửi Ban Giám đốc,\n\nPhòng Hành chính xin gửi lịch họp giao ban đầu tuần vào 08h30 sáng thứ Hai.'}
  />
);

export const EpubToPdf: React.FC = () => (
  <TextToPdfWorkspace toolId="epub-to-pdf" kind="epub" accept=".epub,application/epub+zip" />
);

export const Fb2ToPdf: React.FC = () => (
  <TextToPdfWorkspace
    toolId="fb2-to-pdf"
    kind="fb2"
    accept=".fb2,.fb2.zip,.zip,application/xml,text/xml"
    sampleText={'<FictionBook><body><section><title><p>Chương 1</p></title><p>Chọn tệp sách điện tử .fb2 để chuyển sang PDF.</p></section></body></FictionBook>'}
  />
);
