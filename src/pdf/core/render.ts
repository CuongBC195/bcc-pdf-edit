/**
 * Vẽ trang PDF bằng pdf.js (Apache-2.0) trên trình duyệt: ảnh thu nhỏ, phân tích trang trắng,
 * dò vùng nội dung để cắt lề tự động.
 */
import { getPdfDocumentProxy } from '../../services/thumbnailService';

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  /** Tỉ lệ pixel / pt */
  scale: number;
}

export async function renderPageToCanvas(
  buffer: ArrayBuffer,
  pageNumber: number,
  targetWidth: number
): Promise<RenderedPage> {
  const pdf = await getPdfDocumentProxy(buffer);
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { canvas, scale };
}

// ---------------------------------------------------------------------------
// Ảnh thu nhỏ: cache theo buffer + hàng đợi tuần tự để không làm đơ trang khi tài liệu dài
// ---------------------------------------------------------------------------
const thumbCache = new WeakMap<ArrayBuffer, Map<string, string>>();
let queue: Promise<unknown> = Promise.resolve();

export function getCachedThumbnail(buffer: ArrayBuffer, page: number, width: number): string | undefined {
  return thumbCache.get(buffer)?.get(`${page}@${width}`);
}

export function getThumbnail(buffer: ArrayBuffer, page: number, width: number): Promise<string> {
  const cached = getCachedThumbnail(buffer, page, width);
  if (cached) return Promise.resolve(cached);
  const task = queue.then(async () => {
    const again = getCachedThumbnail(buffer, page, width);
    if (again) return again;
    // Vẽ gấp đôi độ phân giải cho màn hình Retina
    const { canvas } = await renderPageToCanvas(buffer, page, width * Math.min(2, window.devicePixelRatio || 1));
    let url = canvas.toDataURL('image/webp', 0.82);
    if (url.length < 50) url = canvas.toDataURL('image/jpeg', 0.82);
    let map = thumbCache.get(buffer);
    if (!map) {
      map = new Map();
      thumbCache.set(buffer, map);
    }
    map.set(`${page}@${width}`, url);
    return url;
  });
  queue = task.catch(() => undefined);
  return task;
}

// ---------------------------------------------------------------------------
// Phân tích điểm ảnh
// ---------------------------------------------------------------------------

/** Tỉ lệ điểm ảnh "có mực" (0..1). Bỏ qua viền 2% để tránh vết mép scan. */
export function inkRatio(canvas: HTMLCanvasElement, whiteThreshold = 235): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const { width, height } = canvas;
  const mx = Math.floor(width * 0.02);
  const my = Math.floor(height * 0.02);
  const data = ctx.getImageData(mx, my, Math.max(1, width - 2 * mx), Math.max(1, height - 2 * my)).data;
  let ink = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < whiteThreshold) ink++;
  }
  return total ? ink / total : 0;
}

/** Khung chứa nội dung (pixel) hoặc null nếu trang trắng */
export function contentBounds(
  canvas: HTMLCanvasElement,
  whiteThreshold = 235
): { left: number; top: number; right: number; bottom: number } | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < whiteThreshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

