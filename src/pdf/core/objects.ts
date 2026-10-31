/**
 * Đối tượng vẽ thêm lên trang (chữ, hình, ảnh, nét vẽ tay, trường biểu mẫu) dùng chung cho
 * Chỉnh sửa PDF, Ký PDF, Đóng dấu, Sửa chữ, Tạo biểu mẫu.
 *
 * Toạ độ chuẩn hóa 0..1 theo trang hiển thị, gốc ở góc trái-trên (giống màn hình).
 */
import { PDFDocument, PDFPage, degrees, rgb, type PDFImage } from 'pdf-lib';
import { drawTextBox, inVisualSpace, visualMatrix, type Align } from './draw';
import { embedFont, hexToRgb, styleOf, type FontFamily } from './fonts';
import { loadPdf, normalizeAngle, savePdf, type PdfInput } from './ops';

export type ObjectKind =
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'highlight'
  | 'whiteout'
  | 'image'
  | 'ink'
  | 'field';

export type FieldType = 'text' | 'multiline' | 'checkbox' | 'dropdown' | 'radio' | 'signature';

export interface EditorObject {
  id: string;
  page: number;
  kind: ObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  /** Cỡ chữ (pt) */
  fontSize?: number;
  family?: FontFamily;
  bold?: boolean;
  italic?: boolean;
  align?: Align;
  /** Màu chữ / nét (#rrggbb) */
  color?: string;
  /** Màu tô (#rrggbb) hoặc null = không tô */
  fill?: string | null;
  strokeWidth?: number;
  opacity?: number;
  /** Ảnh dạng data URL (PNG/JPEG) */
  image?: string;
  /** Nét vẽ tay: các điểm chuẩn hóa theo trang */
  points?: [number, number][][];
  /** Đường thẳng: đi từ góc trên-phải xuống dưới-trái thay vì trên-trái xuống dưới-phải */
  flip?: boolean;
  field?: { type: FieldType; name: string; options?: string[]; required?: boolean; defaultValue?: string };
}

let seq = 0;
export const newObjectId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

function dataUrlBytes(url: string): { bytes: Uint8Array; type: 'png' | 'jpg' } {
  const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(url);
  if (!m) throw new Error('Ảnh không hợp lệ (chỉ hỗ trợ PNG/JPEG).');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type: m[1].toLowerCase() === 'png' ? 'png' : 'jpg' };
}

const color = (hex: string | undefined, fallback: [number, number, number] = [0, 0, 0]) => {
  const c = hex ? hexToRgb(hex) : fallback;
  return rgb(c[0], c[1], c[2]);
};

/** Đổi khung hiển thị chuẩn hóa -> khung toạ độ người dùng (cho widget biểu mẫu) */
export function visualRectToUser(page: PDFPage, o: { x: number; y: number; w: number; h: number }) {
  const box = page.getCropBox();
  const rot = normalizeAngle(page.getRotation().angle);
  const vw = rot === 90 || rot === 270 ? box.height : box.width;
  const vh = rot === 90 || rot === 270 ? box.width : box.height;
  const [a, b, c, d, e, f] = visualMatrix(page);
  const corners = [
    [o.x * vw, (1 - o.y) * vh],
    [(o.x + o.w) * vw, (1 - o.y - o.h) * vh],
  ].map(([X, Y]) => [a * X + c * Y + e, b * X + d * Y + f]);
  const x = Math.min(corners[0][0], corners[1][0]);
  const y = Math.min(corners[0][1], corners[1][1]);
  return { x, y, width: Math.abs(corners[0][0] - corners[1][0]), height: Math.abs(corners[0][1] - corners[1][1]), rotation: rot };
}

async function drawObject(doc: PDFDocument, page: PDFPage, obj: EditorObject, images: Map<string, PDFImage>) {
  if (obj.kind === 'field') return;
  const fontNeeded = obj.kind === 'text';
  const font = fontNeeded ? await embedFont(doc, obj.family ?? 'sans', styleOf(obj.bold, obj.italic)) : undefined;
  let image: PDFImage | undefined;
  if (obj.kind === 'image' && obj.image) {
    image = images.get(obj.image);
    if (!image) {
      const { bytes, type } = dataUrlBytes(obj.image);
      image = type === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      images.set(obj.image, image);
    }
  }
  inVisualSpace(page, (geo) => {
    const X = obj.x * geo.width;
    const top = (1 - obj.y) * geo.height;
    const W = obj.w * geo.width;
    const H = obj.h * geo.height;
    const opacity = obj.opacity ?? 1;
    switch (obj.kind) {
      case 'text':
        if (obj.fill) page.drawRectangle({ x: X, y: top - H, width: W, height: H, color: color(obj.fill), opacity });
        drawTextBox(page, obj.text ?? '', {
          x: X + 2,
          top: top - 1,
          width: Math.max(4, W - 4),
          font: font!,
          size: obj.fontSize ?? 12,
          color: hexToRgb(obj.color ?? '#000000'),
          opacity,
          align: obj.align ?? 'left',
        });
        break;
      case 'rect':
      case 'whiteout':
      case 'highlight': {
        const isWhite = obj.kind === 'whiteout';
        const isHl = obj.kind === 'highlight';
        page.drawRectangle({
          x: X,
          y: top - H,
          width: W,
          height: H,
          color: isWhite ? rgb(1, 1, 1) : isHl ? color(obj.fill ?? '#ffeb3b') : obj.fill ? color(obj.fill) : undefined,
          opacity: isHl ? (obj.opacity ?? 0.38) : opacity,
          borderColor: isWhite || isHl ? undefined : obj.strokeWidth ? color(obj.color) : undefined,
          borderWidth: isWhite || isHl ? 0 : obj.strokeWidth ?? 0,
          borderOpacity: opacity,
        });
        break;
      }
      case 'ellipse':
        page.drawEllipse({
          x: X + W / 2,
          y: top - H / 2,
          xScale: W / 2,
          yScale: H / 2,
          color: obj.fill ? color(obj.fill) : undefined,
          opacity,
          borderColor: obj.strokeWidth ? color(obj.color) : undefined,
          borderWidth: obj.strokeWidth ?? 0,
          borderOpacity: opacity,
        });
        break;
      case 'line':
      case 'arrow': {
        const start = obj.flip ? { x: X + W, y: top } : { x: X, y: top };
        const end = obj.flip ? { x: X, y: top - H } : { x: X + W, y: top - H };
        const thickness = obj.strokeWidth ?? 2;
        page.drawLine({ start, end, thickness, color: color(obj.color), opacity });
        if (obj.kind === 'arrow') {
          const ang = Math.atan2(end.y - start.y, end.x - start.x);
          const len = Math.max(8, thickness * 4);
          for (const side of [-1, 1]) {
            const a2 = ang + Math.PI - side * 0.45;
            page.drawLine({ start: end, end: { x: end.x + len * Math.cos(a2), y: end.y + len * Math.sin(a2) }, thickness, color: color(obj.color), opacity });
          }
        }
        break;
      }
      case 'image':
        if (image) page.drawImage(image, { x: X, y: top - H, width: W, height: H, opacity });
        break;
      case 'ink':
        for (const stroke of obj.points ?? []) {
          if (stroke.length < 2) continue;
          const path = stroke
            .map(([px, py], i) => `${i ? 'L' : 'M'} ${(px * geo.width).toFixed(2)} ${(py * geo.height).toFixed(2)}`)
            .join(' ');
          page.drawSvgPath(path, { x: 0, y: geo.height, borderColor: color(obj.color), borderWidth: obj.strokeWidth ?? 2, borderOpacity: opacity });
        }
        break;
    }
  });
}

async function addField(doc: PDFDocument, page: PDFPage, obj: EditorObject) {
  const f = obj.field!;
  const form = doc.getForm();
  const rect = visualRectToUser(page, obj);
  const font = await embedFont(doc, obj.family ?? 'sans', 'regular');
  const opts = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotate: degrees(rect.rotation),
    font,
    borderColor: rgb(0.45, 0.45, 0.45),
    borderWidth: 1,
    backgroundColor: rgb(1, 1, 1),
  };
  const name = f.name.trim() || obj.id;
  switch (f.type) {
    case 'text':
    case 'multiline':
    case 'signature': {
      const field = form.createTextField(name);
      if (f.type === 'multiline') field.enableMultiline();
      if (f.defaultValue) field.setText(f.defaultValue);
      if (obj.fontSize) field.setFontSize(obj.fontSize);
      if (f.required) field.enableRequired();
      field.addToPage(page, opts);
      break;
    }
    case 'checkbox': {
      const field = form.createCheckBox(name);
      if (f.required) field.enableRequired();
      field.addToPage(page, { ...opts, font: undefined } as never);
      if (f.defaultValue === 'true') field.check();
      break;
    }
    case 'dropdown': {
      const field = form.createDropdown(name);
      field.addOptions(f.options?.length ? f.options : ['Lựa chọn 1']);
      if (f.defaultValue) field.select(f.defaultValue);
      if (f.required) field.enableRequired();
      field.addToPage(page, opts);
      break;
    }
    case 'radio': {
      // Mỗi đối tượng radio là một lựa chọn; cùng tên = cùng nhóm
      let group;
      try {
        group = form.getRadioGroup(name);
      } catch {
        group = form.createRadioGroup(name);
      }
      group.addOptionToPage(f.defaultValue || obj.id, page, { ...opts, font: undefined } as never);
      break;
    }
  }
}

/** Áp toàn bộ đối tượng lên tệp PDF */
export async function applyObjects(input: PdfInput, objects: EditorObject[]): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const pages = doc.getPages();
  const images = new Map<string, PDFImage>();
  // Che trắng / tô sáng vẽ trước, rồi tới hình, ảnh, chữ (chữ luôn nằm trên cùng)
  const order: Record<ObjectKind, number> = {
    whiteout: 0,
    highlight: 1,
    rect: 2,
    ellipse: 2,
    image: 3,
    ink: 4,
    line: 4,
    arrow: 4,
    text: 5,
    field: 6,
  };
  const sorted = [...objects].sort((a, b) => order[a.kind] - order[b.kind]);
  for (const obj of sorted) {
    const page = pages[obj.page - 1];
    if (!page) continue;
    if (obj.kind === 'field') await addField(doc, page, obj);
    else await drawObject(doc, page, obj, images);
  }
  if (objects.some((o) => o.kind === 'field')) {
    const font = await embedFont(doc, 'sans', 'regular');
    doc.getForm().updateFieldAppearances(font);
  }
  return savePdf(doc);
}

