import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutputFile } from '../core/ops';

const PREFIX = 'bcchub_pdftool::';

/**
 * Trạng thái tùy chọn của công cụ, lưu vào localStorage để quay lại vẫn giữ.
 * `scope` (ví dụ chữ ký tệp) tách riêng trạng thái theo từng tệp; đổi scope thì nạp lại giá trị tương ứng.
 */
export function useToolState<T>(toolId: string, key: string, initial: T, scope = '') {
  const storageKey = `${PREFIX}${toolId}::${key}${scope ? `::${scope}` : ''}`;
  const read = useCallback((): T => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
    // initial chỉ dùng làm giá trị mặc định
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const [state, setState] = useState<{ key: string; value: T }>(() => ({ key: storageKey, value: read() }));
  // Đổi scope (ví dụ mở tệp khác) -> nạp giá trị của scope mới ngay trong lần render này
  const current = state.key === storageKey ? state.value : read();
  if (state.key !== storageKey) setState({ key: storageKey, value: current });

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const base = prev.key === storageKey ? prev.value : read();
        const value = typeof next === 'function' ? (next as (p: T) => T)(base) : next;
        // Không đổi -> giữ nguyên state (tránh vòng lặp render)
        if (prev.key === storageKey && Object.is(value, prev.value)) return prev;
        try {
          localStorage.setItem(storageKey, JSON.stringify(value));
        } catch {
          /* hết dung lượng / chế độ riêng tư */
        }
        return { key: storageKey, value };
      });
    },
    [storageKey, read]
  );

  return [current, setValue] as const;
}

export interface TaskState {
  busy: boolean;
  error: string | null;
  progress: number | null;
  message: string | null;
  outputs: OutputFile[];
  note: string | null;
}

/** Chạy tác vụ xử lý: trạng thái bận, tiến trình, lỗi và tệp kết quả */
export function useTask() {
  const [state, setState] = useState<TaskState>({
    busy: false,
    error: null,
    progress: null,
    message: null,
    outputs: [],
    note: null,
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const report = useCallback((progress: number | null, message?: string) => {
    if (!mounted.current) return;
    setState((s) => ({ ...s, progress, message: message ?? s.message }));
  }, []);

  const run = useCallback(
    async (
      fn: (report: (progress: number | null, message?: string) => void) => Promise<OutputFile[] | { outputs: OutputFile[]; note?: string }>
    ) => {
      setState({ busy: true, error: null, progress: null, message: 'Đang xử lý...', outputs: [], note: null });
      // Nhường luồng để giao diện kịp hiển thị trạng thái bận
      await new Promise((r) => setTimeout(r, 30));
      try {
        const result = await fn(report);
        const outputs = Array.isArray(result) ? result : result.outputs;
        const note = Array.isArray(result) ? null : (result.note ?? null);
        if (mounted.current) setState({ busy: false, error: null, progress: null, message: null, outputs, note });
        return outputs;
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        if (mounted.current) setState({ busy: false, error: msg, progress: null, message: null, outputs: [], note: null });
        return [];
      }
    },
    [report]
  );

  const reset = useCallback(
    () => setState({ busy: false, error: null, progress: null, message: null, outputs: [], note: null }),
    []
  );

  return { ...state, run, reset };
}
