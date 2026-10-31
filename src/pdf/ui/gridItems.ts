import type { GridItem } from './PdfPageGrid';

/** Dựng danh sách GridItem cho toàn bộ trang của một tệp */
export function pagesOf(
  buffer: ArrayBuffer,
  pageCount: number,
  opts: { rotations?: Record<number, number>; marked?: ReadonlySet<number>; badge?: (p: number) => GridItem['badge'] } = {}
): GridItem[] {
  return Array.from({ length: pageCount }, (_, i) => {
    const page = i + 1;
    return {
      key: String(page),
      buffer,
      page,
      sourcePageCount: pageCount,
      rotation: opts.rotations?.[page] ?? 0,
      label: `Trang ${page}`,
      marked: opts.marked?.has(page),
      badge: opts.badge?.(page),
    };
  });
}
