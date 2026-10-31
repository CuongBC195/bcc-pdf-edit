import { useCallback, useMemo } from 'react';
import { parsePageRange, formatPagesToRange } from '../../utils/pageUtils';
import { fileSignature } from '../core/fileStore';
import type { LoadedFile } from './useToolFiles';
import { useToolState } from './hooks';

export { formatPagesToRange };

export function fileScope(f: LoadedFile | null): string {
  return f ? fileSignature(f.file) : '';
}

/**
 * Tập trang được chọn (1-based) của tệp hiện tại, lưu theo từng tệp.
 * Trả về các hàm tiện ích cho PdfPageGrid / SelectionToolbar / ô nhập dải trang.
 */
export function usePageSelection(toolId: string, file: LoadedFile | null, key = 'selected') {
  const [list, setList] = useToolState<number[]>(toolId, key, [], fileScope(file));
  const total = file?.pageCount ?? 0;
  const selected = useMemo(() => new Set(list.filter((p) => p >= 1 && p <= total)), [list, total]);
  const keys = useMemo(() => new Set([...selected].map(String)), [selected]);

  const setPages = useCallback(
    (pages: number[] | 'invert') => {
      setList((prev) => {
        if (pages === 'invert') {
          const cur = new Set(prev);
          return Array.from({ length: total }, (_, i) => i + 1).filter((p) => !cur.has(p));
        }
        return [...new Set(pages)].sort((a, b) => a - b);
      });
    },
    [setList, total]
  );

  /** Dùng cho PdfPageGrid.onToggle (key là số trang dạng chuỗi) */
  const toggle = useCallback(
    (key: string, range: string[] | null) => {
      setList((prev) => {
        const cur = new Set(prev);
        if (range) {
          range.forEach((k) => cur.add(Number(k)));
        } else {
          const p = Number(key);
          if (cur.has(p)) cur.delete(p);
          else cur.add(p);
        }
        return [...cur].sort((a, b) => a - b);
      });
    },
    [setList]
  );

  const sorted = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  return { selected, keys, sorted, setPages, toggle, rangeText: formatPagesToRange(sorted) };
}

/** Đọc dải trang người dùng nhập; trả về lỗi tiếng Việt nếu sai */
export function parseRange(text: string, total: number): { pages: number[]; error?: string } {
  if (!text.trim()) return { pages: [] };
  const r = parsePageRange(text, total);
  return r.isValid ? { pages: r.pages } : { pages: [], error: r.error };
}

