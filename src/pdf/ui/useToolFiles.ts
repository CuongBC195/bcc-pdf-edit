import { useCallback, useEffect, useRef, useState } from 'react';
import { getPdfDocumentProxy } from '../../services/thumbnailService';
import {
  DEFAULT_SLOT,
  MAX_FILE_BYTES,
  acceptsFile,
  addRecentFiles,
  clearSession,
  loadSession,
  saveSession,
} from '../core/fileStore';

export const PDF_ACCEPT = '.pdf,application/pdf';

export interface LoadedFile {
  id: string;
  file: File;
  buffer: ArrayBuffer;
  /** Số trang (chỉ với PDF), null khi chưa đọc xong */
  pageCount: number | null;
  error?: string;
}

interface Options {
  multiple?: boolean;
  accept?: string;
  slot?: string;
  /** Có đọc số trang PDF không (mặc định: có nếu accept chứa .pdf) */
  readPages?: boolean;
}

let idCounter = 0;
const newId = () => `f${Date.now().toString(36)}${(idCounter++).toString(36)}`;

async function readFile(file: File, readPages: boolean): Promise<LoadedFile> {
  const buffer = await file.arrayBuffer();
  const loaded: LoadedFile = { id: newId(), file, buffer, pageCount: null };
  if (readPages) {
    try {
      const doc = await getPdfDocumentProxy(buffer);
      loaded.pageCount = doc.numPages;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      loaded.error = /password/i.test(msg)
        ? 'Tệp có mật khẩu — hãy mở khóa trước (công cụ Mở khóa PDF).'
        : 'Không đọc được tệp PDF (tệp hỏng hoặc không phải PDF).';
    }
  }
  return loaded;
}

/**
 * Quản lý tệp đầu vào của một công cụ: chọn/kéo-thả, đọc số trang, sắp xếp,
 * tự lưu vào IndexedDB để quay lại / F5 vẫn còn, và ghi vào "Tệp gần đây".
 */
export function useToolFiles(toolId: string, options: Options = {}) {
  const { multiple = false, accept = PDF_ACCEPT, slot = DEFAULT_SLOT } = options;
  const readPages = options.readPages ?? /\.pdf|application\/pdf/.test(accept);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [restored, setRestored] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const hydrated = useRef(false);

  // Khôi phục phiên trước
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSession(toolId, slot);
      if (cancelled) return;
      if (saved.length) {
        const list = await Promise.all((multiple ? saved : saved.slice(-1)).map((f) => readFile(f, readPages)));
        if (cancelled) return;
        setFiles(list);
        setRestored(true);
      }
      hydrated.current = true;
      setLoading(false);
    })().catch(() => {
      hydrated.current = true;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [toolId, slot, multiple, readPages]);

  // Lưu mỗi khi danh sách thay đổi (sau khi đã khôi phục xong)
  useEffect(() => {
    if (!hydrated.current) return;
    saveSession(
      toolId,
      slot,
      files.map((f) => f.file)
    ).catch(() => undefined);
  }, [files, toolId, slot]);

  const addFiles = useCallback(
    async (input: FileList | File[]) => {
      const all = Array.from(input);
      const valid = all.filter((f) => acceptsFile(accept, f) && f.size > 0 && f.size <= MAX_FILE_BYTES);
      const skipped = all.length - valid.length;
      setRejected(
        skipped
          ? `Đã bỏ qua ${skipped} tệp không đúng định dạng hoặc lớn hơn ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`
          : null
      );
      if (!valid.length) return;
      setLoading(true);
      try {
        const chosen = multiple ? valid : valid.slice(0, 1);
        const loaded = await Promise.all(chosen.map((f) => readFile(f, readPages)));
        setRestored(false);
        setFiles((prev) => (multiple ? [...prev, ...loaded] : loaded));
        addRecentFiles(toolId, chosen).catch(() => undefined);
      } finally {
        setLoading(false);
      }
    },
    [accept, multiple, readPages, toolId]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const moveFile = useCallback((from: number, to: number) => {
    setFiles((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const setOrder = useCallback((next: LoadedFile[]) => setFiles(next), []);

  const clear = useCallback(() => {
    setFiles([]);
    setRestored(false);
    clearSession(toolId, slot).catch(() => undefined);
  }, [toolId, slot]);

  return {
    files,
    file: files[0] ?? null,
    loading,
    restored,
    rejected,
    multiple,
    accept,
    addFiles,
    removeFile,
    moveFile,
    setOrder,
    clear,
    dismissRestored: () => setRestored(false),
  };
}

export type ToolFiles = ReturnType<typeof useToolFiles>;

