/**
 * Parses user string input like "1-5, 8, 11-15" into an array of unique sorted 1-indexed numbers.
 */
export function parsePageRange(rangeStr: string, maxPages: number): { pages: number[]; isValid: boolean; error?: string } {
  const trimmed = rangeStr.trim();
  if (!trimmed) {
    return { pages: [], isValid: false, error: 'Chưa nhập số trang (Ví dụ: 1-5 hoặc 1, 3, 7)' };
  }

  const parts = trimmed.split(/[,;\s]+/).filter(Boolean);
  const pageSet = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const sub = part.split('-');
      if (sub.length !== 2) {
        return { pages: [], isValid: false, error: `Dải trang "${part}" sai cú pháp. Cần nhập dạng số "từ-đến" (ví dụ: 1-5)` };
      }
      const [startStr, endStr] = sub;
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end)) {
        return { pages: [], isValid: false, error: `Dải trang "${part}" chứa ký tự không hợp lệ. Vui lòng chỉ nhập số (ví dụ: 1-5)` };
      }
      if (start < 1) {
        return { pages: [], isValid: false, error: `Trang bắt đầu phải từ trang 1 trở lên (tài liệu không có trang ${start})` };
      }
      if (start > end) {
        return { pages: [], isValid: false, error: `Dải trang ngược: "${part}". Số trang bắt đầu (${start}) phải nhỏ hơn hoặc bằng trang kết thúc (${end})` };
      }
      if (end > maxPages) {
        return { pages: [], isValid: false, error: `Trang kết thúc (${end}) vượt quá tổng số ${maxPages} trang của tệp gốc` };
      }

      for (let i = start; i <= end; i++) {
        pageSet.add(i);
      }
    } else {
      const p = parseInt(part, 10);
      if (isNaN(p)) {
        return { pages: [], isValid: false, error: `Ký tự "${part}" không phải là số trang hợp lệ. Vui lòng chỉ nhập số (ví dụ: 1, 3, 5-8)` };
      }
      if (p < 1) {
        return { pages: [], isValid: false, error: `Số trang phải từ trang 1 trở lên (không có trang ${p})` };
      }
      if (p > maxPages) {
        return { pages: [], isValid: false, error: `Trang ${p} không tồn tại trong tệp PDF gốc (Tệp gốc chỉ có ${maxPages} trang)` };
      }
      pageSet.add(p);
    }
  }

  const pages = Array.from(pageSet).sort((a, b) => a - b);
  if (pages.length === 0) {
    return { pages: [], isValid: false, error: 'Chưa có trang hợp lệ nào được chọn cho file con này' };
  }

  return { pages, isValid: true };
}

/**
 * Formats a list of sorted numbers [1, 2, 3, 5, 7, 8, 9] into "1-3, 5, 7-9"
 */
export function formatPagesToRange(pages: number[]): string {
  if (!pages || pages.length === 0) return '';
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];

  let start = sorted[0];
  let prev = start;

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

/**
 * Sanitizes path and ensures ends with .pdf
 * Preserves forward slashes for relative folder paths: e.g. "HopDong/01_Chinh.pdf"
 */
export function sanitizeRelativePath(inputPath: string, defaultName: string = 'document.pdf'): string {
  let cleaned = inputPath.trim().replace(/\\/g, '/');
  // Remove leading slashes to prevent absolute paths
  cleaned = cleaned.replace(/^\/+/, '');

  if (!cleaned) {
    cleaned = defaultName;
  }

  // Split by folder segments and sanitize each segment
  const segments = cleaned.split('/').map((seg) => {
    // Remove illegal file name characters: < > : " / \ | ? *
    return seg.replace(/[<>:"/\\|?*]/g, '_').trim();
  }).filter(Boolean);

  if (segments.length === 0) {
    segments.push(defaultName);
  }

  // Ensure last segment ends with .pdf
  let lastSeg = segments[segments.length - 1];
  if (!lastSeg.toLowerCase().endsWith('.pdf')) {
    lastSeg += '.pdf';
  }
  segments[segments.length - 1] = lastSeg;

  return segments.join('/');
}

export const DEFAULT_PATTERN_STORAGE_KEY = 'bccpdf_default_naming_pattern';
export const DEFAULT_START_STORAGE_KEY = 'bccpdf_default_naming_start';
export const DEFAULT_DIGITS_STORAGE_KEY = 'bccpdf_default_naming_digits';

export interface NamingPatternOptions {
  startIndex?: number; // default: 1
  defaultDigits?: number; // default: 3 (e.g. 001 for {cs})
  originalPdfName?: string;
  rule?: {
    pageRangeStr?: string;
    pages?: number[];
  };
}

/**
 * Evaluates a naming template string with placeholders:
 * - {cs} or {stt}: Padded counter (default 3 digits e.g. 001, 002... according to VN Archival Standard)
 * - {cs:N} or {stt:N}: Padded counter to N digits (e.g. {cs:4} -> 0001, {cs:2} -> 01)
 * - {index}: Raw counter without leading zeroes (1, 2, 3...)
 * - {index:02d} / {index:03d} / {index:04d}: Python-style format
 * - {original}: Original PDF file name (without extension)
 * - {range}: Page range string (e.g. "1-5" or "1, 3, 5-8")
 * - {pages}: Total number of pages in this rule
 */
export function evaluateNamingPattern(
  template: string,
  zeroBasedIndex: number,
  options?: NamingPatternOptions
): string {
  if (!template || !template.trim()) {
    const idx = (options?.startIndex ?? 1) + zeroBasedIndex;
    return `TepCon_${idx < 10 ? '0' + idx : idx}.pdf`;
  }

  const start = options?.startIndex ?? 1;
  const currentNum = start + zeroBasedIndex;
  const defaultDigits = options?.defaultDigits ?? 3;

  const baseOriginal = (options?.originalPdfName || 'document').replace(/\.[^/.]+$/, '');
  const range = options?.rule?.pageRangeStr || (options?.rule?.pages ? formatPagesToRange(options.rule.pages) : '1');
  const pagesCount = `${options?.rule?.pages?.length ?? 1}`;

  let result = template;

  // Replace {cs:N} or {stt:N} with custom padding N
  result = result.replace(/\{(?:cs|stt):(\d+)\}/gi, (_, digits) => {
    const pad = parseInt(digits, 10) || defaultDigits;
    return String(currentNum).padStart(pad, '0');
  });

  // Replace {cs} or {stt} with default digits (3 digits by default: 001, 002...)
  result = result.replace(/\{(?:cs|stt)\}/gi, () => {
    return String(currentNum).padStart(defaultDigits, '0');
  });

  // Replace {index:0?(\d+)d} or {index:(\d+)}
  result = result.replace(/\{index:0?(\d+)d?\}/gi, (_, digits) => {
    const pad = parseInt(digits, 10) || 2;
    return String(currentNum).padStart(pad, '0');
  });

  // Replace raw {index}
  result = result.replace(/\{index\}/gi, `${currentNum}`);

  // Replace {original}
  result = result.replace(/\{original\}/gi, baseOriginal);

  // Replace {range}
  result = result.replace(/\{range\}/gi, range);

  // Replace {pages}
  result = result.replace(/\{pages\}/gi, pagesCount);

  // Clean and ensure .pdf extension
  let sanitized = result.trim().replace(/\\/g, '/');
  if (!sanitized.toLowerCase().endsWith('.pdf')) {
    sanitized += '.pdf';
  }

  return sanitized;
}

export function getDefaultNamingPattern(): string {
  return (
    localStorage.getItem(DEFAULT_PATTERN_STORAGE_KEY) ||
    localStorage.getItem('bccpdf_naming_pattern') ||
    ''
  );
}

export function setDefaultNamingPattern(pattern: string): void {
  const trimmed = (pattern || '').trim();
  if (trimmed) {
    localStorage.setItem(DEFAULT_PATTERN_STORAGE_KEY, trimmed);
    localStorage.setItem('bccpdf_naming_pattern', trimmed);
  } else {
    localStorage.removeItem(DEFAULT_PATTERN_STORAGE_KEY);
    localStorage.removeItem('bccpdf_naming_pattern');
  }
}

export function getDefaultNamingStart(): number {
  const saved = localStorage.getItem(DEFAULT_START_STORAGE_KEY);
  const num = parseInt(saved || '1', 10);
  return isNaN(num) || num < 1 ? 1 : num;
}

export function setDefaultNamingStart(start: number): void {
  localStorage.setItem(DEFAULT_START_STORAGE_KEY, String(Math.max(1, start)));
}

export function getDefaultNamingDigits(): number {
  const saved = localStorage.getItem(DEFAULT_DIGITS_STORAGE_KEY);
  const num = parseInt(saved || '3', 10);
  return isNaN(num) || num < 1 ? 3 : num;
}

export function setDefaultNamingDigits(digits: number): void {
  localStorage.setItem(DEFAULT_DIGITS_STORAGE_KEY, String(Math.max(1, Math.min(6, digits))));
}

