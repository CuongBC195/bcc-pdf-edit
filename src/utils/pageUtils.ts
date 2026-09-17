/**
 * Parses user string input like "1-5, 8, 11-15" into an array of unique sorted 1-indexed numbers.
 */
export function parsePageRange(rangeStr: string, maxPages: number): { pages: number[]; isValid: boolean; error?: string } {
  const trimmed = rangeStr.trim();
  if (!trimmed) {
    return { pages: [], isValid: false, error: 'Chưa nhập dải trang' };
  }

  const parts = trimmed.split(/[,;\s]+/).filter(Boolean);
  const pageSet = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end)) {
        return { pages: [], isValid: false, error: `Dải trang không hợp lệ: "${part}"` };
      }
      if (start > end) {
        return { pages: [], isValid: false, error: `Trang bắt đầu lớn hơn trang kết thúc: "${part}"` };
      }
      if (start < 1 || end > maxPages) {
        return { pages: [], isValid: false, error: `Trang nằm ngoài phạm vi 1-${maxPages}: "${part}"` };
      }

      for (let i = start; i <= end; i++) {
        pageSet.add(i);
      }
    } else {
      const p = parseInt(part, 10);
      if (isNaN(p)) {
        return { pages: [], isValid: false, error: `Số trang không hợp lệ: "${part}"` };
      }
      if (p < 1 || p > maxPages) {
        return { pages: [], isValid: false, error: `Trang ${p} nằm ngoài phạm vi 1-${maxPages}` };
      }
      pageSet.add(p);
    }
  }

  const pages = Array.from(pageSet).sort((a, b) => a - b);
  if (pages.length === 0) {
    return { pages: [], isValid: false, error: 'Chưa có trang nào được chọn' };
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
