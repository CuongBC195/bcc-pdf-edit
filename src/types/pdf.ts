export interface SplitRule {
  id: string;
  name: string; // e.g., "01_PhapLy/HopDong.pdf"
  pageRangeStr: string; // e.g., "1-5", "1, 3, 6-9"
  pages: number[]; // Array of 1-indexed page numbers [1, 2, 3, 4, 5]
  color: string; // Hex color for badge and thumbnail border
  isValid: boolean;
  errorMsg?: string;
}

export interface PDFMetadata {
  name: string;
  size: number;
  pageCount: number;
  arrayBuffer: ArrayBuffer;
}

export interface PDFPageThumbnail {
  pageNumber: number; // 1-indexed
  dataUrl?: string;
  width: number;
  height: number;
  isLoading: boolean;
}

export interface PDFBookmarkItem {
  title: string;
  pageNumber: number; // 1-indexed
  level: number;
}

export interface ExportProgress {
  status: 'idle' | 'preparing' | 'processing' | 'zipping' | 'saving' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
}

export const PRESET_COLORS = [
  '#10b981', // Emerald green
  '#f59e0b', // Amber orange
  '#8b5cf6', // Violet purple
  '#06b6d4', // Cyan
  '#f43f5e', // Rose pink
  '#3b82f6', // Blue
  '#d946ef', // Fuchsia
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#6366f1', // Indigo
];
