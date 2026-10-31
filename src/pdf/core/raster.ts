/**
 * Raster hóa trang PDF (pdf.js) -> xử lý điểm ảnh -> dựng lại PDF (pdf-lib).
 * Dùng cho: thang xám, đảo màu, chỉnh màu, hiệu ứng scan, nén mạnh, chuyển chữ thành hình.
 */
import { PDFDocument } from 'pdf-lib';
import { getPdfDocumentProxy } from '../../services/thumbnailService';
import { savePdf } from './ops';

export type PixelFilter = (data: Uint8ClampedArray, width: number, height: number) => void;

export interface RasterOptions {
  dpi: number;
  format: 'jpeg' | 'png';
  /** 0..1 (chỉ JPEG) */
  quality?: number;
  /** Trang cần raster (1-based); bỏ trống = tất cả. Trang khác được giữ nguyên dạng vector. */
  pages?: number[];
  filter?: PixelFilter;
  /** Biến đổi canvas trước khi lấy ảnh (ví dụ xoay nhẹ cho hiệu ứng scan) */
  postProcess?: (canvas: HTMLCanvasElement) => HTMLCanvasElement;
  onProgress?: (done: number, total: number) => void;
}

function canvasToBytes(canvas: HTMLCanvasElement, format: 'jpeg' | 'png', quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Không tạo được ảnh từ trang.'));
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      format === 'png' ? 'image/png' : 'image/jpeg',
      quality
    );
  });
}

/** Vẽ một trang ra canvas theo DPI (đã tính /Rotate) */
export async function renderAtDpi(buffer: ArrayBuffer, pageNumber: number, dpi: number): Promise<HTMLCanvasElement> {
  const pdf = await getPdfDocumentProxy(buffer);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const maxSide = 12000;
  const scale = Math.min(1, maxSide / Math.max(viewport.width, viewport.height));
  const vp = scale < 1 ? page.getViewport({ scale: (dpi / 72) * scale }) : viewport;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas;
}

export async function rasterizePdf(buffer: ArrayBuffer, options: RasterOptions): Promise<Uint8Array> {
  const src = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
  const total = src.getPageCount();
  const targets = new Set(options.pages && options.pages.length ? options.pages : Array.from({ length: total }, (_, i) => i + 1));
  const out = await PDFDocument.create();
  for (let i = 0; i < total; i++) {
    const pageNo = i + 1;
    if (!targets.has(pageNo)) {
      const [copied] = await out.copyPages(src, [i]);
      out.addPage(copied);
      options.onProgress?.(pageNo, total);
      continue;
    }
    const srcPage = src.getPage(i);
    const box = srcPage.getCropBox();
    const rot = ((srcPage.getRotation().angle % 360) + 360) % 360;
    const [w, h] = rot === 90 || rot === 270 ? [box.height, box.width] : [box.width, box.height];
    let canvas = await renderAtDpi(buffer, pageNo, options.dpi);
    if (options.filter) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      options.filter(img.data, canvas.width, canvas.height);
      ctx.putImageData(img, 0, 0);
    }
    if (options.postProcess) canvas = options.postProcess(canvas);
    const bytes = await canvasToBytes(canvas, options.format, options.quality ?? 0.82);
    const image = options.format === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const page = out.addPage([w, h]);
    page.drawImage(image, { x: 0, y: 0, width: w, height: h });
    // Giải phóng bộ nhớ canvas sớm
    canvas.width = 0;
    canvas.height = 0;
    options.onProgress?.(pageNo, total);
  }
  return savePdf(out);
}

// ---------------------------------------------------------------------------
// Bộ lọc điểm ảnh
// ---------------------------------------------------------------------------
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export const grayscaleFilter: PixelFilter = (d) => {
  for (let i = 0; i < d.length; i += 4) {
    const y = lum(d[i], d[i + 1], d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
};

/** Đen trắng tuyệt đối (ngưỡng 0..255) */
export const thresholdFilter =
  (t: number): PixelFilter =>
  (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const v = lum(d[i], d[i + 1], d[i + 2]) >= t ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  };

export const invertFilter: PixelFilter = (d) => {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
};

/** Đảo độ sáng nhưng giữ sắc màu (chế độ tối dễ đọc) */
export const invertLightnessFilter: PixelFilter = (d) => {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const shift = 255 - max - min;
    d[i] = r + shift;
    d[i + 1] = g + shift;
    d[i + 2] = b + shift;
  }
};

export interface ColorAdjust {
  /** -100..100 */
  brightness: number;
  /** -100..100 */
  contrast: number;
  /** -100..100 */
  saturation: number;
  /** 0.2..3 */
  gamma: number;
}

export const adjustFilter =
  (a: ColorAdjust): PixelFilter =>
  (d) => {
    const b = a.brightness * 2.55;
    const c = (259 * (a.contrast * 2.55 + 255)) / (255 * (259 - a.contrast * 2.55));
    const s = 1 + a.saturation / 100;
    const g = 1 / Math.max(0.05, a.gamma);
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let x = c * (v - 128) + 128 + b;
      x = 255 * Math.pow(Math.min(255, Math.max(0, x)) / 255, g);
      lut[v] = x;
    }
    for (let i = 0; i < d.length; i += 4) {
      let r = lut[d[i]];
      let gg = lut[d[i + 1]];
      let bb = lut[d[i + 2]];
      if (s !== 1) {
        const y = lum(r, gg, bb);
        r = y + (r - y) * s;
        gg = y + (gg - y) * s;
        bb = y + (bb - y) * s;
      }
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = bb;
    }
  };

/** Thay vùng gần trắng bằng màu nền */
export const replaceWhiteFilter =
  (color: [number, number, number], tolerance = 30): PixelFilter =>
  (d) => {
    const [cr, cg, cb] = color.map((v) => v * 255);
    for (let i = 0; i < d.length; i += 4) {
      const y = lum(d[i], d[i + 1], d[i + 2]);
      if (y >= 255 - tolerance) {
        // Trộn theo độ trắng để mép chữ mượt
        const t = (y - (255 - tolerance)) / tolerance;
        d[i] = d[i] * (1 - t) + cr * t;
        d[i + 1] = d[i + 1] * (1 - t) + cg * t;
        d[i + 2] = d[i + 2] * (1 - t) + cb * t;
      }
    }
  };

/** Hiệu ứng giấy scan: ngả màu giấy, nhiễu hạt, giảm tương phản nhẹ */
export const scannerFilter =
  (o: { grayscale: boolean; noise: number; tint: number; seed?: number }): PixelFilter =>
  (d) => {
    let seed = o.seed ?? 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      if (o.grayscale) r = g = b = lum(r, g, b);
      const n = (rand() - 0.5) * o.noise;
      r = r * 0.94 + 8 + n;
      g = g * 0.94 + 8 + n;
      b = b * 0.94 + 8 + n - o.tint;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  };

/** Xoay nhẹ + làm mờ canvas (giả lập bản scan) */
export function tiltCanvas(angleDeg: number, blurPx: number) {
  return (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  };
}

