/**
 * Thao tác cấu trúc PDF mức thấp (pdf-lib): metadata, chú thích, nhãn trang, bookmark,
 * tệp đính kèm, lớp nội dung (OCG), làm sạch mã độc.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFObject,
} from 'pdf-lib';
import { loadPdf, savePdf, type PdfInput } from './ops';
import { compactPdf } from './qpdf';

const N = (s: string) => PDFName.of(s);

function lookup(doc: PDFDocument, obj: PDFObject | undefined): PDFObject | undefined {
  return obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
}
function lookupDict(doc: PDFDocument, obj: PDFObject | undefined): PDFDict | undefined {
  const v = lookup(doc, obj);
  return v instanceof PDFDict ? v : undefined;
}
function lookupArray(doc: PDFDocument, obj: PDFObject | undefined): PDFArray | undefined {
  const v = lookup(doc, obj);
  return v instanceof PDFArray ? v : undefined;
}
export function textOf(obj: PDFObject | undefined): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  if (obj instanceof PDFName) return obj.decodeText();
  return obj ? obj.toString() : '';
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: Date | null;
  modificationDate: Date | null;
}

export interface PdfInfo extends PdfMetadata {
  pageCount: number;
  version: string;
  encrypted: boolean;
  hasXmp: boolean;
  formFields: number;
  attachments: number;
  hasJavaScript: boolean;
  layers: number;
  fileSize: number;
}

export async function readInfo(input: PdfInput): Promise<PdfInfo> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const doc = await loadPdf(bytes);
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 16));
  const version = /%PDF-(\d\.\d)/.exec(header)?.[1] ?? '?';
  let formFields = 0;
  try {
    formFields = doc.getForm().getFields().length;
  } catch {
    formFields = 0;
  }
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    creationDate: doc.getCreationDate() ?? null,
    modificationDate: doc.getModificationDate() ?? null,
    pageCount: doc.getPageCount(),
    version,
    encrypted: doc.isEncrypted,
    hasXmp: !!doc.catalog.get(N('Metadata')),
    formFields,
    attachments: listAttachmentsIn(doc).length,
    hasJavaScript: findJavaScript(doc).length > 0,
    layers: listLayersIn(doc).length,
    fileSize: bytes.byteLength,
  };
}

export async function writeMetadata(input: PdfInput, meta: Partial<PdfMetadata>): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  if (meta.title !== undefined) doc.setTitle(meta.title, { showInWindowTitleBar: !!meta.title });
  if (meta.author !== undefined) doc.setAuthor(meta.author);
  if (meta.subject !== undefined) doc.setSubject(meta.subject);
  if (meta.keywords !== undefined) doc.setKeywords(meta.keywords.split(/[,;]\s*/).filter(Boolean));
  if (meta.creator !== undefined) doc.setCreator(meta.creator);
  if (meta.creationDate) doc.setCreationDate(meta.creationDate);
  // XMP cũ có thể mâu thuẫn với thông tin mới -> bỏ
  doc.catalog.delete(N('Metadata'));
  const bytes = await doc.save({ useObjectStreams: true });
  // savePdf ghi đè Producer; ở đây giữ Producer người dùng nhập
  if (meta.producer !== undefined) {
    const again = await loadPdf(bytes);
    again.setProducer(meta.producer);
    return again.save({ useObjectStreams: true });
  }
  return bytes;
}

export async function removeMetadata(input: PdfInput, options: { removeId: boolean }): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const infoRef = doc.context.trailerInfo.Info;
  const info = lookupDict(doc, infoRef);
  if (info) for (const key of info.keys()) info.delete(key);
  doc.catalog.delete(N('Metadata'));
  for (const page of doc.getPages()) page.node.delete(N('Metadata'));
  if (options.removeId) doc.context.trailerInfo.ID = undefined;
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  // pdf-lib tự thêm Producer/ModDate khi lưu -> xóa lại ở bản cuối
  const clean = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const info2 = lookupDict(clean, clean.context.trailerInfo.Info);
  if (info2) for (const key of info2.keys()) info2.delete(key);
  return compactPdf(await clean.save({ useObjectStreams: true }));
}

// ---------------------------------------------------------------------------
// Chú thích (annotations)
// ---------------------------------------------------------------------------
export const ANNOT_LABELS: Record<string, string> = {
  Link: 'Liên kết',
  Text: 'Ghi chú (sticky note)',
  FreeText: 'Hộp chữ',
  Highlight: 'Tô sáng',
  Underline: 'Gạch chân',
  StrikeOut: 'Gạch ngang',
  Squiggly: 'Gạch sóng',
  Ink: 'Nét vẽ tay',
  Square: 'Hình chữ nhật',
  Circle: 'Hình tròn',
  Line: 'Đường thẳng',
  Polygon: 'Đa giác',
  PolyLine: 'Đường gấp khúc',
  Stamp: 'Con dấu',
  FileAttachment: 'Tệp đính kèm',
  Popup: 'Cửa sổ ghi chú',
  Widget: 'Trường biểu mẫu',
  Caret: 'Dấu chèn',
  Sound: 'Âm thanh',
  Redact: 'Che thông tin',
};

export async function countAnnotations(input: PdfInput): Promise<Record<string, number>> {
  const doc = await loadPdf(input);
  const counts: Record<string, number> = {};
  for (const page of doc.getPages()) {
    const annots = lookupArray(doc, page.node.get(N('Annots')));
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const a = lookupDict(doc, annots.get(i));
      const sub = textOf(a?.get(N('Subtype'))) || 'Khác';
      counts[sub] = (counts[sub] ?? 0) + 1;
    }
  }
  return counts;
}

/** Xóa chú thích theo loại (bỏ trống types = xóa tất cả trừ trường biểu mẫu) */
export async function removeAnnotations(
  input: PdfInput,
  options: { types: string[] | null; pages?: number[] }
): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const targets = new Set(options.pages && options.pages.length ? options.pages : doc.getPageIndices().map((i) => i + 1));
  const types = options.types ? new Set(options.types) : null;
  doc.getPages().forEach((page, i) => {
    if (!targets.has(i + 1)) return;
    const annots = lookupArray(doc, page.node.get(N('Annots')));
    if (!annots) return;
    const keep: PDFObject[] = [];
    for (let k = 0; k < annots.size(); k++) {
      const ref = annots.get(k);
      const sub = textOf(lookupDict(doc, ref)?.get(N('Subtype')));
      const remove = types ? types.has(sub) : sub !== 'Widget';
      if (!remove) keep.push(ref);
    }
    if (keep.length) page.node.set(N('Annots'), doc.context.obj(keep));
    else page.node.delete(N('Annots'));
  });
  if (types?.has('Widget')) doc.catalog.delete(N('AcroForm'));
  return compactPdf(await savePdf(doc));
}

// ---------------------------------------------------------------------------
// Nhãn trang (Page Labels)
// ---------------------------------------------------------------------------
export type LabelStyle = 'D' | 'r' | 'R' | 'a' | 'A' | 'none';

export interface PageLabelRange {
  /** Trang bắt đầu (1-based) */
  startPage: number;
  style: LabelStyle;
  prefix: string;
  /** Số bắt đầu */
  start: number;
}

export async function setPageLabels(input: PdfInput, ranges: PageLabelRange[]): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const total = doc.getPageCount();
  const sorted = [...ranges].filter((r) => r.startPage >= 1 && r.startPage <= total).sort((a, b) => a.startPage - b.startPage);
  if (!sorted.length) {
    doc.catalog.delete(N('PageLabels'));
    return savePdf(doc);
  }
  if (sorted[0].startPage !== 1) sorted.unshift({ startPage: 1, style: 'D', prefix: '', start: 1 });
  const nums: PDFObject[] = [];
  for (const r of sorted) {
    const dict: Record<string, PDFObject> = {};
    if (r.style !== 'none') dict.S = N(r.style);
    if (r.prefix) dict.P = PDFHexString.fromText(r.prefix);
    if (r.start !== 1) dict.St = PDFNumber.of(Math.max(1, Math.floor(r.start)));
    nums.push(PDFNumber.of(r.startPage - 1), doc.context.obj(dict));
  }
  doc.catalog.set(N('PageLabels'), doc.context.obj({ Nums: nums }));
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// Bookmark (Outline)
// ---------------------------------------------------------------------------
export interface OutlineNode {
  title: string;
  /** Trang đích 1-based */
  page: number;
  children: OutlineNode[];
  /** Mở sẵn nhánh con */
  open?: boolean;
}

/** Ghi lại toàn bộ bookmark (thay thế bookmark cũ) */
export function writeOutlineInto(doc: PDFDocument, nodes: OutlineNode[]) {
  const pages = doc.getPages();
  if (!nodes.length) {
    doc.catalog.delete(N('Outlines'));
    return;
  }
  const rootRef = doc.context.nextRef();
  const build = (items: OutlineNode[], parentRef: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = items.map(() => doc.context.nextRef());
    let visible = 0;
    items.forEach((item, i) => {
      const page = pages[Math.min(Math.max(item.page, 1), pages.length) - 1];
      const dict: Record<string, PDFObject> = {
        Title: PDFHexString.fromText(item.title || 'Không tên'),
        Parent: parentRef,
        Dest: doc.context.obj([page.ref, N('XYZ'), null, null, null]),
      };
      if (i > 0) dict.Prev = refs[i - 1];
      if (i < items.length - 1) dict.Next = refs[i + 1];
      if (item.children.length) {
        const sub = build(item.children, refs[i]);
        dict.First = sub.first;
        dict.Last = sub.last;
        dict.Count = PDFNumber.of(item.open === false ? -sub.count : sub.count);
        if (item.open !== false) visible += sub.count;
      }
      doc.context.assign(refs[i], doc.context.obj(dict));
      visible += 1;
    });
    return { first: refs[0], last: refs[refs.length - 1], count: visible };
  };
  const top = build(nodes, rootRef);
  doc.context.assign(
    rootRef,
    doc.context.obj({ Type: N('Outlines'), First: top.first, Last: top.last, Count: PDFNumber.of(top.count) })
  );
  doc.catalog.set(N('Outlines'), rootRef);
  doc.catalog.set(N('PageMode'), N('UseOutlines'));
}

export async function writeOutline(input: PdfInput, nodes: OutlineNode[]): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  writeOutlineInto(doc, nodes);
  return savePdf(doc);
}

/** Dựng cây từ danh sách phẳng có cấp (level 0 = gốc) */
export function treeFromFlat(items: { title: string; page: number; level: number }[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: { level: number; node: OutlineNode }[] = [];
  for (const it of items) {
    const node: OutlineNode = { title: it.title, page: it.page, children: [] };
    while (stack.length && stack[stack.length - 1].level >= it.level) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else root.push(node);
    stack.push({ level: it.level, node });
  }
  return root;
}

// ---------------------------------------------------------------------------
// Tệp đính kèm
// ---------------------------------------------------------------------------
export interface AttachmentInfo {
  name: string;
  description: string;
  size: number;
  /** 'doc' = đính kèm cấp tài liệu, 'page' = chú thích FileAttachment trên trang */
  scope: 'doc' | 'page';
  page?: number;
  data: () => Uint8Array;
}

function streamBytes(doc: PDFDocument, obj: PDFObject | undefined): Uint8Array {
  const s = lookup(doc, obj);
  if (s instanceof PDFRawStream) return decodePDFRawStream(s).decode();
  if (s instanceof PDFStream) return s.getContents();
  return new Uint8Array();
}

function fileSpecInfo(doc: PDFDocument, specObj: PDFObject | undefined, fallbackName: string) {
  const spec = lookupDict(doc, specObj);
  if (!spec) return null;
  const name = textOf(spec.get(N('UF'))) || textOf(spec.get(N('F'))) || fallbackName;
  const ef = lookupDict(doc, spec.get(N('EF')));
  const fileRef = ef?.get(N('UF')) ?? ef?.get(N('F'));
  if (!fileRef) return null;
  const stream = lookup(doc, fileRef);
  let size = 0;
  if (stream instanceof PDFStream) {
    const params = lookupDict(doc, stream.dict.get(N('Params')));
    const s = params?.get(N('Size'));
    size = s instanceof PDFNumber ? s.asNumber() : 0;
  }
  return { name, description: textOf(spec.get(N('Desc'))), size, data: () => streamBytes(doc, fileRef) };
}

function walkNameTree(doc: PDFDocument, node: PDFDict | undefined, out: [string, PDFObject][]) {
  if (!node) return;
  const names = lookupArray(doc, node.get(N('Names')));
  if (names) for (let i = 0; i + 1 < names.size(); i += 2) out.push([textOf(lookup(doc, names.get(i))), names.get(i + 1)]);
  const kids = lookupArray(doc, node.get(N('Kids')));
  if (kids) for (let i = 0; i < kids.size(); i++) walkNameTree(doc, lookupDict(doc, kids.get(i)), out);
}

function embeddedFilesTree(doc: PDFDocument): PDFDict | undefined {
  const names = lookupDict(doc, doc.catalog.get(N('Names')));
  return lookupDict(doc, names?.get(N('EmbeddedFiles')));
}

export function listAttachmentsIn(doc: PDFDocument): AttachmentInfo[] {
  const result: AttachmentInfo[] = [];
  const entries: [string, PDFObject][] = [];
  walkNameTree(doc, embeddedFilesTree(doc), entries);
  for (const [key, spec] of entries) {
    const info = fileSpecInfo(doc, spec, key);
    if (info) result.push({ ...info, scope: 'doc' });
  }
  doc.getPages().forEach((page, i) => {
    const annots = lookupArray(doc, page.node.get(N('Annots')));
    if (!annots) return;
    for (let k = 0; k < annots.size(); k++) {
      const a = lookupDict(doc, annots.get(k));
      if (textOf(a?.get(N('Subtype'))) !== 'FileAttachment') continue;
      const info = fileSpecInfo(doc, a!.get(N('FS')), `tep-trang-${i + 1}`);
      if (info) result.push({ ...info, scope: 'page', page: i + 1 });
    }
  });
  return result;
}

export async function listAttachments(input: PdfInput): Promise<AttachmentInfo[]> {
  return listAttachmentsIn(await loadPdf(input));
}

export async function addAttachments(
  input: PdfInput,
  files: { name: string; bytes: Uint8Array; mimeType?: string; description?: string }[]
): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  for (const f of files) {
    await doc.attach(f.bytes, f.name, {
      mimeType: f.mimeType || 'application/octet-stream',
      description: f.description,
      creationDate: new Date(),
      modificationDate: new Date(),
    });
  }
  return savePdf(doc);
}

/** Giữ lại các tệp đính kèm cấp tài liệu theo danh sách (tên mới), xóa phần còn lại */
export async function rewriteAttachments(
  input: PdfInput,
  keep: { originalName: string; newName: string; description: string }[],
  removePageAttachments: boolean
): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const entries: [string, PDFObject][] = [];
  walkNameTree(doc, embeddedFilesTree(doc), entries);
  const byName = new Map(entries.map(([k, v]) => [fileSpecInfo(doc, v, k)?.name ?? k, v]));
  const newNames: PDFObject[] = [];
  for (const k of keep) {
    const specObj = byName.get(k.originalName);
    const spec = lookupDict(doc, specObj);
    if (!spec || !specObj) continue;
    spec.set(N('F'), PDFString.of(k.newName.replace(/[^\x20-\x7e]/g, '_')));
    spec.set(N('UF'), PDFHexString.fromText(k.newName));
    if (k.description) spec.set(N('Desc'), PDFHexString.fromText(k.description));
    else spec.delete(N('Desc'));
    newNames.push(PDFHexString.fromText(k.newName), specObj);
  }
  const namesDict = lookupDict(doc, doc.catalog.get(N('Names')));
  if (newNames.length) {
    const tree = doc.context.obj({ Names: newNames });
    if (namesDict) namesDict.set(N('EmbeddedFiles'), tree);
    else doc.catalog.set(N('Names'), doc.context.obj({ EmbeddedFiles: tree }));
  } else namesDict?.delete(N('EmbeddedFiles'));
  if (removePageAttachments) {
    for (const page of doc.getPages()) {
      const annots = lookupArray(doc, page.node.get(N('Annots')));
      if (!annots) continue;
      const kept: PDFObject[] = [];
      for (let i = 0; i < annots.size(); i++) {
        if (textOf(lookupDict(doc, annots.get(i))?.get(N('Subtype'))) !== 'FileAttachment') kept.push(annots.get(i));
      }
      if (kept.length) page.node.set(N('Annots'), doc.context.obj(kept));
      else page.node.delete(N('Annots'));
    }
  }
  return compactPdf(await savePdf(doc));
}

// ---------------------------------------------------------------------------
// Lớp nội dung (Optional Content Groups)
// ---------------------------------------------------------------------------
export interface LayerInfo {
  index: number;
  name: string;
  visible: boolean;
  locked: boolean;
}

function ocProps(doc: PDFDocument) {
  const props = lookupDict(doc, doc.catalog.get(N('OCProperties')));
  const ocgs = lookupArray(doc, props?.get(N('OCGs')));
  const d = lookupDict(doc, props?.get(N('D')));
  return { props, ocgs, d };
}

function refKey(o: PDFObject | undefined) {
  return o instanceof PDFRef ? `${o.objectNumber} ${o.generationNumber}` : String(o);
}

export function listLayersIn(doc: PDFDocument): LayerInfo[] {
  const { ocgs, d } = ocProps(doc);
  if (!ocgs) return [];
  const off = new Set<string>();
  const locked = new Set<string>();
  const offArr = lookupArray(doc, d?.get(N('OFF')));
  const lockArr = lookupArray(doc, d?.get(N('Locked')));
  offArr?.asArray().forEach((o) => off.add(refKey(o)));
  lockArr?.asArray().forEach((o) => locked.add(refKey(o)));
  const baseOff = textOf(d?.get(N('BaseState'))) === 'OFF';
  const onArr = new Set((lookupArray(doc, d?.get(N('ON')))?.asArray() ?? []).map(refKey));
  return ocgs.asArray().map((ref, index) => {
    const g = lookupDict(doc, ref);
    const key = refKey(ref);
    return {
      index,
      name: textOf(g?.get(N('Name'))) || `Lớp ${index + 1}`,
      visible: baseOff ? onArr.has(key) : !off.has(key),
      locked: locked.has(key),
    };
  });
}

export async function listLayers(input: PdfInput): Promise<LayerInfo[]> {
  return listLayersIn(await loadPdf(input));
}

export async function updateLayers(input: PdfInput, layers: { index: number; name: string; visible: boolean }[]): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const { props, ocgs } = ocProps(doc);
  if (!props || !ocgs) throw new Error('Tệp không có lớp nội dung.');
  const refs = ocgs.asArray();
  const off: PDFObject[] = [];
  const on: PDFObject[] = [];
  for (const l of layers) {
    const ref = refs[l.index];
    const g = lookupDict(doc, ref);
    if (!g) continue;
    g.set(N('Name'), PDFHexString.fromText(l.name));
    (l.visible ? on : off).push(ref);
  }
  let d = lookupDict(doc, props.get(N('D')));
  if (!d) {
    d = doc.context.obj({});
    props.set(N('D'), d);
  }
  d.set(N('BaseState'), N('ON'));
  d.set(N('ON'), doc.context.obj(on));
  d.set(N('OFF'), doc.context.obj(off));
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// Làm sạch (JavaScript, hành động tự chạy, tệp nhúng, liên kết ngoài)
// ---------------------------------------------------------------------------
export function findJavaScript(doc: PDFDocument): string[] {
  const found: string[] = [];
  const names = lookupDict(doc, doc.catalog.get(N('Names')));
  if (names?.get(N('JavaScript'))) found.push('JavaScript cấp tài liệu');
  if (doc.catalog.get(N('OpenAction'))) {
    const a = lookupDict(doc, doc.catalog.get(N('OpenAction')));
    if (a && textOf(a.get(N('S'))) === 'JavaScript') found.push('JavaScript tự chạy khi mở');
  }
  if (doc.catalog.get(N('AA'))) found.push('Hành động tự động của tài liệu');
  return found;
}

export interface SanitizeOptions {
  javascript: boolean;
  embeddedFiles: boolean;
  externalLinks: boolean;
  metadata: boolean;
  forms: boolean;
  annotations: boolean;
}

export interface SanitizeReport {
  removed: string[];
}

export async function sanitizePdf(input: PdfInput, o: SanitizeOptions): Promise<{ bytes: Uint8Array; report: SanitizeReport }> {
  const doc = await loadPdf(input);
  const removed: string[] = [];
  const names = lookupDict(doc, doc.catalog.get(N('Names')));
  if (o.javascript) {
    if (names?.get(N('JavaScript'))) {
      names.delete(N('JavaScript'));
      removed.push('JavaScript cấp tài liệu');
    }
    if (doc.catalog.get(N('OpenAction'))) {
      doc.catalog.delete(N('OpenAction'));
      removed.push('Hành động khi mở tệp');
    }
    if (doc.catalog.get(N('AA'))) {
      doc.catalog.delete(N('AA'));
      removed.push('Hành động tự động của tài liệu');
    }
    const acro = lookupDict(doc, doc.catalog.get(N('AcroForm')));
    if (acro?.get(N('XFA'))) {
      acro.delete(N('XFA'));
      removed.push('Biểu mẫu XFA (có thể chứa script)');
    }
  }
  if (o.embeddedFiles && names?.get(N('EmbeddedFiles'))) {
    names.delete(N('EmbeddedFiles'));
    removed.push('Tệp nhúng cấp tài liệu');
  }
  if (o.forms && doc.catalog.get(N('AcroForm'))) {
    try {
      doc.getForm().flatten();
    } catch {
      /* biểu mẫu lỗi -> xóa thẳng */
    }
    doc.catalog.delete(N('AcroForm'));
    removed.push('Biểu mẫu (đã làm phẳng)');
  }
  let annotRemoved = 0;
  let jsActions = 0;
  let links = 0;
  for (const page of doc.getPages()) {
    if (o.javascript && page.node.get(N('AA'))) {
      page.node.delete(N('AA'));
      jsActions++;
    }
    const annots = lookupArray(doc, page.node.get(N('Annots')));
    if (!annots) continue;
    const kept: PDFObject[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const a = lookupDict(doc, ref);
      const sub = textOf(a?.get(N('Subtype')));
      if (o.annotations && sub !== 'Widget' && sub !== 'Link') {
        annotRemoved++;
        continue;
      }
      if (o.embeddedFiles && sub === 'FileAttachment') {
        annotRemoved++;
        continue;
      }
      const action = lookupDict(doc, a?.get(N('A')));
      const s = textOf(action?.get(N('S')));
      if (o.javascript && (s === 'JavaScript' || a?.get(N('AA')))) {
        a?.delete(N('A'));
        a?.delete(N('AA'));
        jsActions++;
      }
      if (o.externalLinks && (s === 'URI' || s === 'Launch' || s === 'GoToR' || s === 'SubmitForm' || s === 'ImportData')) {
        if (sub === 'Link') {
          links++;
          continue;
        }
        a?.delete(N('A'));
        links++;
      }
      kept.push(ref);
    }
    if (kept.length) page.node.set(N('Annots'), doc.context.obj(kept));
    else page.node.delete(N('Annots'));
  }
  if (annotRemoved) removed.push(`${annotRemoved} chú thích`);
  if (jsActions) removed.push(`${jsActions} hành động JavaScript trên trang/chú thích`);
  if (links) removed.push(`${links} liên kết ra ngoài / mở chương trình`);
  if (o.metadata) {
    const info = lookupDict(doc, doc.context.trailerInfo.Info);
    if (info) for (const k of info.keys()) info.delete(k);
    doc.catalog.delete(N('Metadata'));
    removed.push('Thông tin tài liệu (metadata)');
  }
  return { bytes: await compactPdf(await savePdf(doc)), report: { removed } };
}
