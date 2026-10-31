import { useEffect, useState } from 'react';

/**
 * Chạy tác vụ bất đồng bộ theo `key` (ví dụ chữ ký tệp + tùy chọn) và trả kết quả của đúng key hiện tại.
 * Đổi key -> kết quả cũ tự bị bỏ qua (trả undefined) cho tới khi tác vụ mới xong.
 * `fn` nhận hàm báo tiến trình (0..100) và cờ hủy.
 */
export function useAsyncResult<T>(
  key: string | null,
  fn: (report: (progress: number) => void, isCancelled: () => boolean) => Promise<T>
): { value: T | undefined; progress: number | null; error: string | null } {
  const [state, setState] = useState<{ key: string | null; value?: T; progress: number | null; error: string | null }>({
    key: null,
    progress: null,
    error: null,
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    fn(
      (progress) => {
        if (!cancelled) setState((s) => (s.key === key && s.value !== undefined ? s : { key, progress, error: null }));
      },
      isCancelled
    )
      .then((value) => {
        if (!cancelled) setState({ key, value, progress: null, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ key, progress: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
    // fn được coi là thuần theo key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null || state.key !== key) return { value: undefined, progress: null, error: null };
  return { value: state.value, progress: state.progress, error: state.error };
}

