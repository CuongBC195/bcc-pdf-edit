/**
 * Các thao tác xử lý PDF thuần (không phụ thuộc giao diện), dựa trên pdf-lib (MIT).
 *
 * Quy ước:
 * - Số trang trong tham số là 1-based (giống người dùng nhìn thấy).
 * - Đầu vào là ArrayBuffer/Uint8Array, đầu ra là Uint8Array (bytes PDF mới).
 * - Góc xoay theo chiều kim đồng hồ, bội số của 90 (như thuộc tính /Rotate của PDF).
 */
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFPage,
  degrees,
  rgb,
  type PDFEmbeddedPage,
} from 'pdf-lib';
import { MAX_PAGE_PT, MM_TO_PT } from './paper';

export type PdfInput = ArrayBuffer | Uint8Array;

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

// ---------------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------------

export async function loadPdf(input: PdfInput): Promise<PDFDocument> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Không đọc được tệp PDF (tệp hỏng hoặc không phải PDF): ${msg}`);
  }
}

export async function savePdf(doc: PDFDocument): Promise<Uint8Array> {
  doc.setProducer('bccHub');
  doc.setModificationDate(new Date());
  return doc.save({ useObjectStreams: true });
}

export async function getPageCount(input: PdfInput): Promise<number> {
  return (await loadPdf(input)).getPageCount();
}

export function normalizeAngle(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}

function assertPages(pages: number[], total: number) {
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 1 || p > total) {
      throw new Error(`Trang ${p} không tồn tại (tài liệu có ${total} trang).`);
    }
  }
}

/** Trang trắng (không có /Contents) không nhúng được -> gán luồng nội dung rỗng */
function ensureContents(page: PDFPage) {
  if (!page.node.get(PDFName.of('Contents'))) {
    page.node.set(PDFName.of('Contents'), page.doc.context.register(page.doc.context.stream('')));
  }
}

async function embedPageSafe(target: PDFDocument, page: PDFPage): Promise<PDFEmbeddedPage> {
  ensureContents(page);
  return target.embedPage(page);
}

async function embedPagesSafe(target: PDFDocument, pages: PDFPage[]): Promise<PDFEmbeddedPage[]> {
  pages.forEach(ensureContents);
  return target.embedPages(pages);
}

/** Kích thước hiển thị của trang (đã tính /Rotate) */
export function visualSize(page: PDFPage): { width: number; height: number } {
  const { width, height } = page.getSize();
  const rot = normalizeAngle(page.getRotation().angle);
  return rot === 90 || rot === 270 ? { width: height, height: width } : { width, height };
}

/** Tạo tài liệu mới chỉ gồm các trang chỉ định (giữ nguyên thứ tự truyền vào, cho phép lặp) */
export async function buildFromPages(
  src: PDFDocument,
  pages: number[],
  rotations?: Record<number, number>
): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  if (pages.length === 0) return out;
  const copied = await out.copyPages(
    src,
    pages.map((p) => p - 1)
  );
  copied.forEach((page, i) => {
    const extra = rotations?.[pages[i]] ?? 0;
    if (extra) page.setRotation(degrees(normalizeAngle(page.getRotation().angle + extra)));
    out.addPage(page);
  });
  return out;
}

/**
 * Vẽ một trang đã nhúng vào khung (x, y, w, h) trên trang đích, giữ tỉ lệ, căn giữa,
 * có tính tới góc xoay gốc của trang nguồn.
 */
export function drawPageFitted(
  target: PDFPage,
  embedded: PDFEmbeddedPage,
  sourceRotation: number,
  box: { x: number; y: number; width: number; height: number },
  mode: 'fit' | 'fill' | 'stretch' = 'fit',
  extraRotation = 0
) {
  const rot = normalizeAngle(sourceRotation + extraRotation);
  const swapped = rot === 90 || rot === 270;
  const vw = swapped ? embedded.height : embedded.width;
  const vh = swapped ? embedded.width : embedded.height;

  let sx: number;
  let sy: number;
  if (mode === 'stretch') {
    sx = box.width / vw;
    sy = box.height / vh;
  } else {
    const s =
      mode === 'fit' ? Math.min(box.width / vw, box.height / vh) : Math.max(box.width / vw, box.height / vh);
    sx = s;
    sy = s;
  }
  // Kích thước hiển thị sau khi co giãn
  const dw = vw * sx;
  const dh = vh * sy;
  const left = box.x + (box.width - dw) / 2;
  const bottom = box.y + (box.height - dh) / 2;
  // Kích thước nội dung chưa xoay sau khi co giãn
  const cw = swapped ? embedded.width * sy : embedded.width * sx;
  const ch = swapped ? embedded.height * sx : embedded.height * sy;

  let x = left;
  let y = bottom;
  if (rot === 90) y = bottom + cw;
  else if (rot === 180) {
    x = left + cw;
    y = bottom + ch;
  } else if (rot === 270) x = left + ch;

  target.drawPage(embedded, {
    x,
    y,
    width: cw,
    height: ch,
    rotate: degrees(-rot),
  });
}

// ---------------------------------------------------------------------------
// Gộp & Tách
// ---------------------------------------------------------------------------

export interface MergeSource {
  bytes: PdfInput;
  /** Trang cần lấy (1-based). Bỏ trống = toàn bộ */
  pages?: number[];
}

export async function mergePdfs(sources: MergeSource[]): Promise<Uint8Array> {
  if (sources.length === 0) throw new Error('Chưa có tệp nào để gộp.');
  const out = await PDFDocument.create();
  for (const s of sources) {
    const src = await loadPdf(s.bytes);
    const total = src.getPageCount();
    const pages = s.pages && s.pages.length ? s.pages : Array.from({ length: total }, (_, i) => i + 1);
    assertPages(pages, total);
    const copied = await out.copyPages(
      src,
      pages.map((p) => p - 1)
    );
    copied.forEach((p) => out.addPage(p));
  }
  return savePdf(out);
}

/** Tách theo các nhóm trang; mỗi nhóm thành 1 tệp */
export async function splitByGroups(
  input: PdfInput,
  groups: number[][],
  baseName: string,
  nameFor?: (group: number[], index: number) => string
): Promise<OutputFile[]> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  const results: OutputFile[] = [];
  const pad = String(groups.length).length;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g.length) continue;
    assertPages(g, total);
    const doc = await buildFromPages(src, g);
    const name = nameFor
      ? nameFor(g, i)
      : `${baseName}_${String(i + 1).padStart(Math.max(2, pad), '0')}.pdf`;
    results.push({ name, bytes: await savePdf(doc) });
  }
  return results;
}

export function groupsEveryN(total: number, n: number): number[][] {
  const size = Math.max(1, Math.floor(n));
  const groups: number[][] = [];
  for (let start = 1; start <= total; start += size) {
    groups.push(Array.from({ length: Math.min(size, total - start + 1) }, (_, i) => start + i));
  }
  return groups;
}

export function groupsIntoParts(total: number, parts: number): number[][] {
  const k = Math.max(1, Math.min(total, Math.floor(parts)));
  const base = Math.floor(total / k);
  const extra = total % k;
  const groups: number[][] = [];
  let page = 1;
  for (let i = 0; i < k; i++) {
    const size = base + (i < extra ? 1 : 0);
    groups.push(Array.from({ length: size }, (_, j) => page + j));
    page += size;
  }
  return groups;
}

/** Tách tại các điểm cắt: cắt SAU các trang chỉ định */
export function groupsFromCutPoints(total: number, cutsAfter: number[]): number[][] {
  const cuts = [...new Set(cutsAfter.filter((c) => c >= 1 && c < total))].sort((a, b) => a - b);
  const groups: number[][] = [];
  let start = 1;
  for (const c of [...cuts, total]) {
    groups.push(Array.from({ length: c - start + 1 }, (_, i) => start + i));
    start = c + 1;
  }
  return groups;
}

export async function extractPages(input: PdfInput, pages: number[]): Promise<Uint8Array> {
  const src = await loadPdf(input);
  assertPages(pages, src.getPageCount());
  if (!pages.length) throw new Error('Chưa chọn trang nào để trích xuất.');
  return savePdf(await buildFromPages(src, pages));
}

/** Trộn xen kẽ trang của nhiều tệp: A1, B1, C1, A2, B2, ... */
export async function alternateMerge(
  sources: { bytes: PdfInput; reverse?: boolean }[]
): Promise<Uint8Array> {
  if (sources.length < 2) throw new Error('Cần ít nhất 2 tệp để trộn xen kẽ.');
  const docs = await Promise.all(sources.map((s) => loadPdf(s.bytes)));
  const out = await PDFDocument.create();
  const orders = docs.map((d, i) => {
    const idx = Array.from({ length: d.getPageCount() }, (_, k) => k);
    return sources[i].reverse ? idx.reverse() : idx;
  });
  const copiedPerDoc = await Promise.all(docs.map((d, i) => out.copyPages(d, orders[i])));
  const maxLen = Math.max(...copiedPerDoc.map((c) => c.length));
  for (let k = 0; k < maxLen; k++) {
    for (const copied of copiedPerDoc) {
      if (k < copied.length) out.addPage(copied[k]);
    }
  }
  return savePdf(out);
}

/**
 * Ghép bản scan 2 mặt: tệp chứa toàn bộ mặt trước rồi toàn bộ mặt sau
 * (mặt sau thường bị ngược thứ tự khi lật xấp giấy).
 */
export async function duplexCollate(
  input: PdfInput,
  options: { reverseBacks: boolean; backsInput?: PdfInput }
): Promise<Uint8Array> {
  const front = await loadPdf(input);
  const out = await PDFDocument.create();
  let fronts: PDFPage[];
  let backs: PDFPage[];
  if (options.backsInput) {
    const back = await loadPdf(options.backsInput);
    fronts = await out.copyPages(front, front.getPageIndices());
    backs = await out.copyPages(back, back.getPageIndices());
  } else {
    const total = front.getPageCount();
    if (total % 2 !== 0) {
      throw new Error(`Tệp có ${total} trang (số lẻ) — không chia đều được mặt trước/mặt sau.`);
    }
    const half = total / 2;
    const all = await out.copyPages(front, front.getPageIndices());
    fronts = all.slice(0, half);
    backs = all.slice(half);
  }
  if (options.reverseBacks) backs = [...backs].reverse();
  const maxLen = Math.max(fronts.length, backs.length);
  for (let i = 0; i < maxLen; i++) {
    if (fronts[i]) out.addPage(fronts[i]);
    if (backs[i]) out.addPage(backs[i]);
  }
  return savePdf(out);
}

// ---------------------------------------------------------------------------
// Lớp phủ
// ---------------------------------------------------------------------------

export type OverlayRepeat = 'first' | 'match' | 'cycle';

/** Chèn trang của tệp phủ lên trên (hoặc xuống dưới) nội dung của tệp gốc */
export async function overlayPdf(
  baseInput: PdfInput,
  overlayInput: PdfInput,
  options: {
    position: 'over' | 'under';
    repeat: OverlayRepeat;
    /** Trang gốc áp dụng (1-based). Bỏ trống = tất cả */
    pages?: number[];
    fit: 'fit' | 'stretch';
  }
): Promise<Uint8Array> {
  const base = await loadPdf(baseInput);
  const overlay = await loadPdf(overlayInput);
  const total = base.getPageCount();
  const ovTotal = overlay.getPageCount();
  if (ovTotal === 0) throw new Error('Tệp phủ không có trang nào.');
  const targets = options.pages && options.pages.length ? options.pages : base.getPageIndices().map((i) => i + 1);
  assertPages(targets, total);

  const embeddedCache = new Map<number, PDFEmbeddedPage>();
  const getEmbedded = async (idx: number) => {
    let e = embeddedCache.get(idx);
    if (!e) {
      e = await embedPageSafe(base, overlay.getPage(idx));
      embeddedCache.set(idx, e);
    }
    return e;
  };

  for (let t = 0; t < targets.length; t++) {
    const pageNo = targets[t];
    let ovIdx: number;
    if (options.repeat === 'first') ovIdx = 0;
    else if (options.repeat === 'match') {
      ovIdx = pageNo - 1;
      if (ovIdx >= ovTotal) continue;
    } else ovIdx = (pageNo - 1) % ovTotal;

    const page = base.getPage(pageNo - 1);
    const embedded = await getEmbedded(ovIdx);
    const ovRotation = overlay.getPage(ovIdx).getRotation().angle;
    const { width, height } = page.getSize();
    // Vẽ theo hệ toạ độ chưa xoay của trang gốc; bù góc xoay để lớp phủ đứng đúng chiều hiển thị
    const baseRot = normalizeAngle(page.getRotation().angle);
    drawPageFitted(page, embedded, ovRotation, { x: 0, y: 0, width, height }, options.fit, -baseRot);

    if (options.position === 'under') moveLastContentStreamToFront(page);
  }
  return savePdf(base);
}

function moveLastContentStreamToFront(page: PDFPage) {
  const contents = page.node.get(PDFName.of('Contents'));
  const arr = contents ? page.node.context.lookup(contents) : undefined;
  if (!(arr instanceof PDFArray) || arr.size() < 2) return;
  const last = arr.get(arr.size() - 1);
  arr.remove(arr.size() - 1);
  arr.insert(0, last);
}

// ---------------------------------------------------------------------------
// Thao tác trang
// ---------------------------------------------------------------------------

export async function deletePages(input: PdfInput, pages: number[]): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  assertPages(pages, total);
  const del = new Set(pages);
  if (del.size >= total) throw new Error('Không thể xóa toàn bộ trang của tài liệu.');
  [...del].sort((a, b) => b - a).forEach((p) => src.removePage(p - 1));
  return savePdf(src);
}

export interface PageRef {
  /** Chỉ số tệp nguồn trong mảng sources */
  source: number;
  /** Trang 1-based trong tệp nguồn; null = trang trắng */
  page: number | null;
  /** Góc xoay thêm (theo chiều kim đồng hồ) */
  rotation?: number;
  /** Kích thước trang trắng [w, h] (pt) */
  blankSize?: [number, number];
}

/** Dựng tài liệu mới từ danh sách tham chiếu trang (sắp xếp, xoay, nhân bản, chèn trang trắng, ghép nhiều tệp) */
export async function composePages(sources: PdfInput[], refs: PageRef[]): Promise<Uint8Array> {
  if (refs.length === 0) throw new Error('Danh sách trang đang trống.');
  const docs = await Promise.all(sources.map((s) => loadPdf(s)));
  const out = await PDFDocument.create();
  for (const ref of refs) {
    if (ref.page === null) {
      const size = ref.blankSize ?? [595.28, 841.89];
      const p = out.addPage(size);
      if (ref.rotation) p.setRotation(degrees(normalizeAngle(ref.rotation)));
      continue;
    }
    const doc = docs[ref.source];
    if (!doc) throw new Error('Tham chiếu tới tệp không tồn tại.');
    assertPages([ref.page], doc.getPageCount());
    const [copied] = await out.copyPages(doc, [ref.page - 1]);
    if (ref.rotation) copied.setRotation(degrees(normalizeAngle(copied.getRotation().angle + ref.rotation)));
    out.addPage(copied);
  }
  return savePdf(out);
}

export type BlankPosition =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'after'; page: number }
  | { kind: 'before'; page: number }
  | { kind: 'every'; step: number };

export async function insertBlankPages(
  input: PdfInput,
  options: { position: BlankPosition; count: number; size?: [number, number] }
): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  const count = Math.max(1, Math.min(500, Math.floor(options.count)));
  const sizeOf = (neighbour: number): [number, number] => {
    if (options.size) return options.size;
    const p = src.getPage(Math.min(Math.max(neighbour, 0), total - 1));
    const v = visualSize(p);
    return [v.width, v.height];
  };
  const insertAt = (index: number, neighbour: number) => {
    for (let i = 0; i < count; i++) src.insertPage(index, sizeOf(neighbour));
  };
  const pos = options.position;
  if (pos.kind === 'start') insertAt(0, 0);
  else if (pos.kind === 'end') insertAt(src.getPageCount(), total - 1);
  else if (pos.kind === 'after' || pos.kind === 'before') {
    assertPages([pos.page], total);
    insertAt(pos.kind === 'after' ? pos.page : pos.page - 1, pos.page - 1);
  } else {
    const step = Math.max(1, Math.floor(pos.step));
    // Chèn từ cuối lên để chỉ số không bị lệch
    for (let p = Math.floor(total / step) * step; p >= step; p -= step) insertAt(p, p - 1);
  }
  return savePdf(src);
}

export async function reversePages(input: PdfInput): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const order = src.getPageIndices().reverse().map((i) => i + 1);
  return savePdf(await buildFromPages(src, order));
}

/** Xoay trang theo bội số 90° (cộng dồn vào góc hiện có) */
export async function rotatePages(input: PdfInput, rotations: Record<number, number>): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  for (const [key, angle] of Object.entries(rotations)) {
    const p = Number(key);
    if (!angle) continue;
    assertPages([p], total);
    if (normalizeAngle(angle) % 90 !== 0) throw new Error('Góc xoay phải là bội số của 90°.');
    const page = src.getPage(p - 1);
    page.setRotation(degrees(normalizeAngle(page.getRotation().angle + angle)));
  }
  return savePdf(src);
}

/**
 * Xoay góc tùy ý theo chiều kim đồng hồ (ví dụ 1.5° để chỉnh bản scan lệch).
 * Trang được vẽ lại vào trang mới; `keepSize` giữ khổ giấy và thu nhỏ nội dung cho vừa.
 */
export async function rotateCustom(
  input: PdfInput,
  options: { angle: number; pages?: number[]; keepSize: boolean }
): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  const targets = new Set(options.pages && options.pages.length ? options.pages : src.getPageIndices().map((i) => i + 1));
  assertPages([...targets], total);
  const out = await PDFDocument.create();
  const userRad = (options.angle * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(userRad));
  const absSin = Math.abs(Math.sin(userRad));

  for (let i = 0; i < total; i++) {
    if (!targets.has(i + 1) || options.angle % 360 === 0) {
      const [copied] = await out.copyPages(src, [i]);
      out.addPage(copied);
      continue;
    }
    const srcPage = src.getPage(i);
    const rot = normalizeAngle(srcPage.getRotation().angle);
    const embedded = await embedPageSafe(out, srcPage);
    const { width: vw, height: vh } = visualSize(srcPage);
    // Khung bao của trang sau khi xoay
    const bw = vw * absCos + vh * absSin;
    const bh = vw * absSin + vh * absCos;
    const pageW = options.keepSize ? vw : bw;
    const pageH = options.keepSize ? vh : bh;
    const scale = options.keepSize ? Math.min(vw / bw, vh / bh) : 1;
    const page = out.addPage([pageW, pageH]);

    // pdf-lib xoay ngược chiều kim đồng hồ với góc dương: bù /Rotate rồi xoay thêm theo chiều kim đồng hồ
    const t = ((-rot - options.angle) * Math.PI) / 180;
    const sw = embedded.width * scale;
    const sh = embedded.height * scale;
    // Đặt tâm nội dung trùng tâm trang
    const rx = (sw / 2) * Math.cos(t) - (sh / 2) * Math.sin(t);
    const ry = (sw / 2) * Math.sin(t) + (sh / 2) * Math.cos(t);
    page.drawPage(embedded, {
      x: pageW / 2 - rx,
      y: pageH / 2 - ry,
      width: sw,
      height: sh,
      rotate: degrees(-rot - options.angle),
    });
  }
  return savePdf(out);
}

export type DivideDirection = 'vertical' | 'horizontal';

/**
 * Chia mỗi trang thành nhiều phần (ví dụ trang scan A3 chứa 2 trang A4).
 * `vertical`: đường chia dọc -> các phần trái/phải. `horizontal`: đường chia ngang -> các phần trên/dưới.
 */
export async function dividePages(
  input: PdfInput,
  options: { direction: DivideDirection; parts: number; pages?: number[]; reverseOrder?: boolean }
): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  const parts = Math.max(2, Math.min(10, Math.floor(options.parts)));
  const targets = new Set(options.pages && options.pages.length ? options.pages : src.getPageIndices().map((i) => i + 1));
  assertPages([...targets], total);
  const out = await PDFDocument.create();

  for (let i = 0; i < total; i++) {
    if (!targets.has(i + 1)) {
      const [copied] = await out.copyPages(src, [i]);
      out.addPage(copied);
      continue;
    }
    const srcPage = src.getPage(i);
    const rot = normalizeAngle(srcPage.getRotation().angle);
    const box = srcPage.getCropBox();
    // Trục và chiều tương ứng với thứ tự hiển thị (trái->phải hoặc trên->dưới)
    let axis: 'x' | 'y';
    let ascending: boolean;
    if (options.direction === 'vertical') {
      axis = rot === 90 || rot === 270 ? 'y' : 'x';
      ascending = rot === 0 || rot === 90;
    } else {
      axis = rot === 90 || rot === 270 ? 'x' : 'y';
      ascending = rot === 90 || rot === 180;
    }
    const length = axis === 'x' ? box.width : box.height;
    const step = length / parts;
    let order = Array.from({ length: parts }, (_, k) => (ascending ? k : parts - 1 - k));
    if (options.reverseOrder) order = order.reverse();
    const copies = await out.copyPages(
      src,
      order.map(() => i)
    );
    order.forEach((k, idx) => {
      const p = copies[idx];
      const x = axis === 'x' ? box.x + k * step : box.x;
      const y = axis === 'y' ? box.y + k * step : box.y;
      const w = axis === 'x' ? step : box.width;
      const h = axis === 'y' ? step : box.height;
      p.setMediaBox(x, y, w, h);
      p.setCropBox(x, y, w, h);
      p.setTrimBox(x, y, w, h);
      p.setBleedBox(x, y, w, h);
      out.addPage(p);
    });
  }
  return savePdf(out);
}

/** Ghép toàn bộ trang thành một trang dài duy nhất */
export async function combineSinglePage(
  input: PdfInput,
  options: { direction: 'vertical' | 'horizontal'; gapMm: number; separator: boolean }
): Promise<{ bytes: Uint8Array; scaled: boolean }> {
  const src = await loadPdf(input);
  const pages = src.getPages();
  if (!pages.length) throw new Error('Tài liệu không có trang.');
  const sizes = pages.map(visualSize);
  const gap = Math.max(0, options.gapMm) * MM_TO_PT;
  const vertical = options.direction === 'vertical';
  let mainLen = sizes.reduce((s, v) => s + (vertical ? v.height : v.width), 0) + gap * (pages.length - 1);
  let crossLen = Math.max(...sizes.map((v) => (vertical ? v.width : v.height)));
  const scale = Math.min(1, MAX_PAGE_PT / mainLen, MAX_PAGE_PT / crossLen);
  mainLen *= scale;
  crossLen *= scale;

  const out = await PDFDocument.create();
  const embedded = await embedPagesSafe(out, pages);
  const page = out.addPage(vertical ? [crossLen, mainLen] : [mainLen, crossLen]);
  let cursor = vertical ? mainLen : 0;
  for (let i = 0; i < pages.length; i++) {
    const w = sizes[i].width * scale;
    const h = sizes[i].height * scale;
    let box: { x: number; y: number; width: number; height: number };
    if (vertical) {
      cursor -= h;
      box = { x: (crossLen - w) / 2, y: cursor, width: w, height: h };
      cursor -= gap * scale;
    } else {
      box = { x: cursor, y: (crossLen - h) / 2, width: w, height: h };
      cursor += w + gap * scale;
    }
    drawPageFitted(page, embedded[i], pages[i].getRotation().angle, box);
    if (options.separator && i < pages.length - 1) {
      const color = rgb(0.6, 0.6, 0.6);
      if (vertical) {
        const yLine = box.y - (gap * scale) / 2;
        page.drawLine({ start: { x: 0, y: yLine }, end: { x: crossLen, y: yLine }, thickness: 0.6, color, dashArray: [4, 3] });
      } else {
        const xLine = box.x + w + (gap * scale) / 2;
        page.drawLine({ start: { x: xLine, y: 0 }, end: { x: xLine, y: crossLen }, thickness: 0.6, color, dashArray: [4, 3] });
      }
    }
  }
  return { bytes: await savePdf(out), scaled: scale < 1 };
}

// ---------------------------------------------------------------------------
// Bố cục & In ấn
// ---------------------------------------------------------------------------

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Cắt lề trang. Lề tính theo chiều hiển thị (đã xoay), đơn vị pt.
 * `perPage` cho phép mỗi trang một lề riêng (ví dụ cắt khoảng trắng tự động).
 */
export async function cropPages(
  input: PdfInput,
  options: { margins: Margins; pages?: number[]; perPage?: Record<number, Margins> }
): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  const targets = options.pages && options.pages.length ? options.pages : src.getPageIndices().map((i) => i + 1);
  assertPages(targets, total);
  for (const pageNo of targets) {
    const page = src.getPage(pageNo - 1);
    const m = options.perPage?.[pageNo] ?? options.margins;
    const rot = normalizeAngle(page.getRotation().angle);
    // Đổi lề hiển thị -> lề theo toạ độ chưa xoay
    let left = m.left;
    let right = m.right;
    let top = m.top;
    let bottom = m.bottom;
    if (rot === 90) [left, top, right, bottom] = [m.bottom, m.left, m.top, m.right];
    else if (rot === 180) [left, top, right, bottom] = [m.right, m.bottom, m.left, m.top];
    else if (rot === 270) [left, top, right, bottom] = [m.top, m.right, m.bottom, m.left];
    const box = page.getCropBox();
    const w = box.width - left - right;
    const h = box.height - top - bottom;
    if (w < 10 || h < 10) throw new Error(`Lề cắt quá lớn ở trang ${pageNo}.`);
    const x = box.x + left;
    const y = box.y + bottom;
    page.setCropBox(x, y, w, h);
    page.setMediaBox(x, y, w, h);
    page.setTrimBox(x, y, w, h);
    page.setBleedBox(x, y, w, h);
  }
  return savePdf(src);
}

export interface NUpOptions {
  perSheet: 2 | 4 | 6 | 8 | 9 | 12 | 16;
  /** [w, h] tờ in đầu ra (pt); null = tự tính theo trang đầu */
  sheet: [number, number] | null;
  marginMm: number;
  gapMm: number;
  border: boolean;
  order: 'row' | 'column';
}

function gridFor(perSheet: number, landscape: boolean): [number, number] {
  const table: Record<number, [number, number]> = {
    2: [2, 1],
    4: [2, 2],
    6: [3, 2],
    8: [4, 2],
    9: [3, 3],
    12: [4, 3],
    16: [4, 4],
  };
  const [a, b] = table[perSheet] ?? [2, 2];
  // [cột, hàng]
  return landscape ? [a, b] : [b, a];
}

export async function nUp(input: PdfInput, options: NUpOptions): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const pages = src.getPages();
  if (!pages.length) throw new Error('Tài liệu không có trang.');
  const first = visualSize(pages[0]);
  const srcLandscape = first.width > first.height;
  let sheetW: number;
  let sheetH: number;
  if (options.sheet) [sheetW, sheetH] = options.sheet;
  else {
    // Tự động: 2 và 8 trang -> tờ xoay ngang so với trang gốc
    const swap = options.perSheet === 2 || options.perSheet === 8 || options.perSheet === 6 || options.perSheet === 12;
    sheetW = swap ? first.height : first.width;
    sheetH = swap ? first.width : first.height;
    if (srcLandscape && swap) [sheetW, sheetH] = [first.height, first.width];
  }
  const [cols, rows] = gridFor(options.perSheet, sheetW > sheetH);
  const margin = options.marginMm * MM_TO_PT;
  const gap = options.gapMm * MM_TO_PT;
  const cellW = (sheetW - 2 * margin - gap * (cols - 1)) / cols;
  const cellH = (sheetH - 2 * margin - gap * (rows - 1)) / rows;
  if (cellW <= 5 || cellH <= 5) throw new Error('Lề hoặc khoảng cách quá lớn so với tờ in.');

  const out = await PDFDocument.create();
  const embedded = await embedPagesSafe(out, pages);
  for (let start = 0; start < pages.length; start += options.perSheet) {
    const sheet = out.addPage([sheetW, sheetH]);
    for (let k = 0; k < options.perSheet && start + k < pages.length; k++) {
      const col = options.order === 'row' ? k % cols : Math.floor(k / rows);
      const row = options.order === 'row' ? Math.floor(k / cols) : k % rows;
      const box = {
        x: margin + col * (cellW + gap),
        y: sheetH - margin - (row + 1) * cellH - row * gap,
        width: cellW,
        height: cellH,
      };
      drawPageFitted(sheet, embedded[start + k], pages[start + k].getRotation().angle, box);
      if (options.border) {
        sheet.drawRectangle({ ...box, borderColor: rgb(0.55, 0.55, 0.55), borderWidth: 0.6 });
      }
    }
  }
  return savePdf(out);
}

/** Thứ tự trang cho sách gấp giữa (saddle-stitch). Trả về các cặp [trái, phải] theo từng mặt tờ, null = trang trắng */
export function bookletOrder(pageCount: number): [number | null, number | null][] {
  const n = Math.ceil(pageCount / 4) * 4;
  const real = (p: number) => (p <= pageCount ? p : null);
  const sides: [number | null, number | null][] = [];
  for (let i = 0; i < n / 4; i++) {
    sides.push([real(n - 2 * i), real(2 * i + 1)]);
    sides.push([real(2 * i + 2), real(n - 2 * i - 1)]);
  }
  return sides;
}

export async function booklet(
  input: PdfInput,
  options: { sheet: [number, number] | null; binding: 'left' | 'right'; creepMarks: boolean }
): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const pages = src.getPages();
  if (!pages.length) throw new Error('Tài liệu không có trang.');
  const first = visualSize(pages[0]);
  const [sheetW, sheetH] = options.sheet ?? [first.width * 2, first.height];
  const out = await PDFDocument.create();
  const embedded = await embedPagesSafe(out, pages);
  for (const [l, r] of bookletOrder(pages.length)) {
    const [left, right] = options.binding === 'right' ? [r, l] : [l, r];
    const sheet = out.addPage([sheetW, sheetH]);
    const half = sheetW / 2;
    [left, right].forEach((p, side) => {
      if (p === null) return;
      drawPageFitted(sheet, embedded[p - 1], pages[p - 1].getRotation().angle, {
        x: side * half,
        y: 0,
        width: half,
        height: sheetH,
      });
    });
    if (options.creepMarks) {
      const c = rgb(0.6, 0.6, 0.6);
      sheet.drawLine({ start: { x: half, y: sheetH }, end: { x: half, y: sheetH - 14 }, thickness: 0.5, color: c });
      sheet.drawLine({ start: { x: half, y: 0 }, end: { x: half, y: 14 }, thickness: 0.5, color: c });
    }
  }
  return savePdf(out);
}

/** In poster: phóng to mỗi trang ra nhiều tờ nhỏ để ghép lại */
export async function posterize(
  input: PdfInput,
  options: { cols: number; rows: number; sheet: [number, number]; overlapMm: number; cutMarks: boolean; pages?: number[] }
): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const total = src.getPageCount();
  const targets = options.pages && options.pages.length ? options.pages : src.getPageIndices().map((i) => i + 1);
  assertPages(targets, total);
  const cols = Math.max(1, Math.min(10, Math.floor(options.cols)));
  const rows = Math.max(1, Math.min(10, Math.floor(options.rows)));
  const [tileW, tileH] = options.sheet;
  const overlap = Math.max(0, options.overlapMm) * MM_TO_PT;
  const out = await PDFDocument.create();

  for (const pageNo of targets) {
    const srcPage = src.getPage(pageNo - 1);
    const embedded = await embedPageSafe(out, srcPage);
    const vis = visualSize(srcPage);
    // Kích thước poster = lưới tờ trừ phần chồng mép
    const posterW = cols * tileW - (cols - 1) * overlap;
    const posterH = rows * tileH - (rows - 1) * overlap;
    const scale = Math.min(posterW / vis.width, posterH / vis.height);
    const drawW = vis.width * scale;
    const drawH = vis.height * scale;
    const offX = (posterW - drawW) / 2;
    const offY = (posterH - drawH) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = out.addPage([tileW, tileH]);
        // Góc trái-dưới của tờ này trong hệ toạ độ poster (hàng 0 là hàng trên cùng)
        const tileX = c * (tileW - overlap);
        const tileY = posterH - tileH - r * (tileH - overlap);
        drawPageFitted(tile, embedded, srcPage.getRotation().angle, {
          x: offX - tileX,
          y: offY - tileY,
          width: drawW,
          height: drawH,
        });
        if (options.cutMarks && overlap > 0) {
          const color = rgb(0.5, 0.5, 0.5);
          if (c > 0) tile.drawLine({ start: { x: overlap, y: 0 }, end: { x: overlap, y: tileH }, thickness: 0.4, color, dashArray: [3, 3] });
          if (r > 0) tile.drawLine({ start: { x: 0, y: tileH - overlap }, end: { x: tileW, y: tileH - overlap }, thickness: 0.4, color, dashArray: [3, 3] });
        }
        // Font chuẩn của PDF không có dấu tiếng Việt -> nhãn ghép tờ dùng ASCII
        tile.drawText(`Trang ${pageNo} - hang ${r + 1}/${rows} - cot ${c + 1}/${cols}`, {
          x: 6,
          y: 4,
          size: 6,
          color: rgb(0.55, 0.55, 0.55),
        });
      }
    }
  }
  return savePdf(out);
}

export type FitMode = 'fit' | 'fill' | 'stretch';

/** Chuẩn hóa khổ giấy cho mọi trang */
export async function fixPageSize(
  input: PdfInput,
  options: { size: [number, number]; matchOrientation: boolean; mode: FitMode; marginMm: number }
): Promise<Uint8Array> {
  const src = await loadPdf(input);
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const embedded = await embedPagesSafe(out, pages);
  const margin = Math.max(0, options.marginMm) * MM_TO_PT;
  pages.forEach((srcPage, i) => {
    const vis = visualSize(srcPage);
    let [w, h] = options.size;
    if (options.matchOrientation && (vis.width > vis.height) !== (w > h)) [w, h] = [h, w];
    const page = out.addPage([w, h]);
    drawPageFitted(
      page,
      embedded[i],
      srcPage.getRotation().angle,
      { x: margin, y: margin, width: w - 2 * margin, height: h - 2 * margin },
      options.mode
    );
  });
  return savePdf(out);
}

export interface PageDimension {
  page: number;
  width: number;
  height: number;
  rotation: number;
}

export async function getPageDimensions(input: PdfInput): Promise<PageDimension[]> {
  const src = await loadPdf(input);
  return src.getPages().map((p, i) => {
    const v = visualSize(p);
    return { page: i + 1, width: v.width, height: v.height, rotation: normalizeAngle(p.getRotation().angle) };
  });
}
