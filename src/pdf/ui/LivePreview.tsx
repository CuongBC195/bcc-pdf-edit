import React, { useEffect, useState } from 'react';
import { Thumbnail } from './components';
import { useAsyncResult } from './useAsyncResult';

/** Giá trị trễ (debounce) để không dựng lại xem trước liên tục khi đang gõ */
export function useDebounced<T>(value: T, ms = 450): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Xem trước kết quả: dựng tệp tạm theo tùy chọn hiện tại và hiển thị trang chỉ định.
 * `optionsKey` đổi -> dựng lại (có trễ).
 */
export const LivePreview: React.FC<{
  optionsKey: string;
  build: () => Promise<Uint8Array>;
  page?: number;
  width?: number;
  caption?: string;
}> = ({ optionsKey, build, page = 1, width = 300, caption }) => {
  const key = useDebounced(optionsKey);
  const { value, error } = useAsyncResult(key, async () => {
    const bytes = await build();
    return bytes.slice().buffer as ArrayBuffer;
  });
  return (
    <figure style={{ margin: 0 }}>
      <div className="pdft-preview" style={{ minHeight: 160 }}>
        <div style={{ width }}>
          {value ? (
            <Thumbnail buffer={value} page={page} width={width} />
          ) : error ? (
            <div className="pdft-empty">Không xem trước được: {error}</div>
          ) : (
            <div className="pdft-empty">Đang dựng bản xem trước...</div>
          )}
        </div>
      </div>
      <figcaption style={{ fontSize: '0.76rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: 6 }}>
        {caption ?? `Xem trước trang ${page}`}
      </figcaption>
    </figure>
  );
};

