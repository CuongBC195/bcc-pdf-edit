/**
 * Khổ giấy chuẩn và quy đổi đơn vị (1 pt = 1/72 inch).
 */

export const MM_TO_PT = 72 / 25.4;
export const PT_TO_MM = 25.4 / 72;
/** Kích thước trang lớn nhất PDF cho phép (không dùng UserUnit) */
export const MAX_PAGE_PT = 14400;

export type PaperId = 'A3' | 'A4' | 'A5' | 'B5' | 'Letter' | 'Legal' | 'Tabloid';

export interface PaperSize {
  id: PaperId;
  label: string;
  /** Khổ đứng, đơn vị pt */
  width: number;
  height: number;
}

const mm = (w: number, h: number) => [w * MM_TO_PT, h * MM_TO_PT] as const;

export const PAPER_SIZES: readonly PaperSize[] = [
  { id: 'A4', label: 'A4 (210 × 297 mm)', width: mm(210, 297)[0], height: mm(210, 297)[1] },
  { id: 'A3', label: 'A3 (297 × 420 mm)', width: mm(297, 420)[0], height: mm(297, 420)[1] },
  { id: 'A5', label: 'A5 (148 × 210 mm)', width: mm(148, 210)[0], height: mm(148, 210)[1] },
  { id: 'B5', label: 'B5 (176 × 250 mm)', width: mm(176, 250)[0], height: mm(176, 250)[1] },
  { id: 'Letter', label: 'Letter (8.5 × 11 in)', width: 612, height: 792 },
  { id: 'Legal', label: 'Legal (8.5 × 14 in)', width: 612, height: 1008 },
  { id: 'Tabloid', label: 'Tabloid (11 × 17 in)', width: 792, height: 1224 },
];

export function getPaper(id: PaperId): PaperSize {
  return PAPER_SIZES.find((p) => p.id === id) ?? PAPER_SIZES[0];
}

export type Orientation = 'portrait' | 'landscape';

/** Trả về [w, h] của khổ giấy theo hướng */
export function paperDims(id: PaperId, orientation: Orientation): [number, number] {
  const p = getPaper(id);
  return orientation === 'landscape' ? [p.height, p.width] : [p.width, p.height];
}

/** Nhận diện khổ giấy gần đúng (sai số 2%), không phân biệt hướng */
export function detectPaperName(width: number, height: number): string | null {
  const a = Math.min(width, height);
  const b = Math.max(width, height);
  for (const p of PAPER_SIZES) {
    if (Math.abs(a - p.width) / p.width < 0.02 && Math.abs(b - p.height) / p.height < 0.02) {
      return p.id;
    }
  }
  return null;
}

export function formatMm(pt: number): string {
  return `${(pt * PT_TO_MM).toFixed(1).replace(/\.0$/, '')}`;
}

