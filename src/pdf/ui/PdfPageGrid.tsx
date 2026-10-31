import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, RotateCw, Trash2 } from 'lucide-react';
import { PageDetailModal } from '../../components/PageDetailModal';
import { Thumbnail } from './components';

export interface GridItem {
  key: string;
  /** null = trang trắng chèn thêm */
  buffer: ArrayBuffer | null;
  /** Trang 1-based trong tệp nguồn */
  page: number;
  /** Tổng số trang của tệp nguồn (để chuyển trang khi xem trước) */
  sourcePageCount: number;
  /** Góc xoay hiển thị (độ, theo chiều kim đồng hồ) */
  rotation?: number;
  label: string;
  badge?: { text: string; tone?: 'cyan' | 'rose' | 'amber' };
  /** Đánh dấu (ví dụ: sẽ bị xóa) */
  marked?: boolean;
}

interface Props {
  items: GridItem[];
  selected?: ReadonlySet<string>;
  /** Bấm vào trang: chọn/bỏ chọn. `range` = các key từ lần bấm trước tới đây (Shift) */
  onToggle?: (key: string, range: string[] | null) => void;
  onReorder?: (from: number, to: number) => void;
  onRotate?: (key: string) => void;
  onDelete?: (key: string) => void;
  renderActions?: (item: GridItem, index: number) => React.ReactNode;
  thumbWidth?: number;
  emptyText?: string;
}

/**
 * Lưới trang dùng chung: ảnh thu nhỏ vẽ khi cuộn tới, chọn (Shift để chọn dải),
 * kéo-thả sắp xếp, xem trước phóng to bằng phím Space / nút mắt.
 */
export const PdfPageGrid: React.FC<Props> = ({
  items,
  selected,
  onToggle,
  onReorder,
  onRotate,
  onDelete,
  renderActions,
  thumbWidth = 132,
  emptyText = 'Không có trang nào.',
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ index: number; after: boolean } | null>(null);
  const [preview, setPreview] = useState<{ buffer: ArrayBuffer; page: number; total: number } | null>(null);
  const lastClicked = useRef<number | null>(null);
  const hovered = useRef<number | null>(null);

  const handleClick = (index: number, shift: boolean) => {
    if (!onToggle) return;
    const item = items[index];
    if (shift && lastClicked.current !== null) {
      const [a, b] = [Math.min(lastClicked.current, index), Math.max(lastClicked.current, index)];
      onToggle(item.key, items.slice(a, b + 1).map((i) => i.key));
    } else {
      onToggle(item.key, null);
    }
    lastClicked.current = index;
  };

  const openPreview = useCallback(
    (index: number) => {
      const item = items[index];
      if (item?.buffer) setPreview({ buffer: item.buffer, page: item.page, total: item.sourcePageCount });
    },
    [items]
  );

  // Space: xem trước trang đang trỏ chuột / đang focus
  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      const focusedIndex = Number((document.activeElement as HTMLElement)?.dataset?.gridIndex);
      const index = Number.isInteger(focusedIndex) ? focusedIndex : hovered.current;
      if (index === null || index === undefined || !items[index]?.buffer) return;
      e.preventDefault();
      openPreview(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, preview, openPreview]);

  if (!items.length) return <div className="pdft-empty">{emptyText}</div>;

  const previewItem = preview ? items.find((i) => i.buffer === preview.buffer && i.page === preview.page) : undefined;

  return (
    <>
      <div className="pdft-grid" style={{ ['--pdft-thumb' as string]: `${thumbWidth}px` }}>
        {items.map((item, index) => {
          const isSelected = selected?.has(item.key) ?? false;
          const dropCls = drop && drop.index === index && dragIndex !== index ? (drop.after ? 'is-drop-after' : 'is-drop-before') : '';
          return (
            <div
              key={item.key}
              data-grid-index={index}
              role={onToggle ? 'checkbox' : undefined}
              aria-checked={onToggle ? isSelected : undefined}
              aria-label={item.label}
              tabIndex={0}
              className={`pdft-page ${isSelected ? 'is-selected' : ''} ${item.marked ? 'is-marked' : ''} ${dragIndex === index ? 'is-dragging' : ''} ${dropCls}`}
              onClick={(e) => handleClick(index, e.shiftKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleClick(index, e.shiftKey);
                }
              }}
              onDoubleClick={() => openPreview(index)}
              onMouseEnter={() => (hovered.current = index)}
              onMouseLeave={() => {
                if (hovered.current === index) hovered.current = null;
              }}
              draggable={!!onReorder}
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                setDrop({ index, after: e.clientX > rect.left + rect.width / 2 });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && drop && onReorder) {
                  let to = drop.after ? drop.index + 1 : drop.index;
                  if (dragIndex < to) to -= 1;
                  if (to !== dragIndex) onReorder(dragIndex, to);
                }
                setDragIndex(null);
                setDrop(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDrop(null);
              }}
            >
              {item.badge && (
                <span className={`pdft-page__badge ${item.badge.tone && item.badge.tone !== 'cyan' ? `pdft-page__badge--${item.badge.tone}` : ''}`}>
                  {item.badge.text}
                </span>
              )}
              {onToggle && (
                <input
                  type="checkbox"
                  className="pdft-page__check"
                  checked={isSelected}
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleClick(index, (e.nativeEvent as MouseEvent).shiftKey)}
                />
              )}
              {item.buffer ? (
                <Thumbnail buffer={item.buffer} page={item.page} width={thumbWidth} rotation={item.rotation} />
              ) : (
                <div className="pdft-page__frame">
                  <div className="pdft-page__blank" style={{ transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined }}>
                    Trang trắng
                  </div>
                </div>
              )}
              <div className="pdft-page__label">{item.label}</div>
              <div className="pdft-page__actions" onClick={(e) => e.stopPropagation()}>
                {item.buffer && (
                  <button type="button" className="pdft-icon-btn" aria-label={`Xem trước ${item.label}`} title="Xem trước (Space)" onClick={() => openPreview(index)}>
                    <Eye size={14} />
                  </button>
                )}
                {onRotate && (
                  <button type="button" className="pdft-icon-btn" aria-label={`Xoay ${item.label}`} title="Xoay 90°" onClick={() => onRotate(item.key)}>
                    <RotateCw size={14} />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="pdft-icon-btn pdft-icon-btn--danger"
                    aria-label={`Xóa ${item.label}`}
                    title="Xóa trang"
                    onClick={() => onDelete(item.key)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {renderActions?.(item, index)}
              </div>
            </div>
          );
        })}
      </div>

      {preview && (
        <PageDetailModal
          isOpen
          sourceBuffer={preview.buffer}
          pageNumber={preview.page}
          totalPageCount={preview.total}
          pageRotations={{ [preview.page]: previewItem?.rotation ?? 0 }}
          onRotatePage={() => previewItem && onRotate?.(previewItem.key)}
          onDeletePage={
            onDelete && previewItem
              ? () => {
                  onDelete(previewItem.key);
                  setPreview(null);
                }
              : undefined
          }
          onNavigatePage={(p) => setPreview((prev) => (prev ? { ...prev, page: p } : prev))}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
};

/** Bộ chọn trang nhanh: tất cả / bỏ chọn / chẵn / lẻ / đảo chọn */
export const SelectionToolbar: React.FC<{
  total: number;
  selectedCount: number;
  onSelect: (pages: number[] | 'invert') => void;
  children?: React.ReactNode;
}> = ({ total, selectedCount, onSelect, children }) => {
  const all = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="pdft-toolbar">
      <strong style={{ color: 'var(--text-main)' }}>
        Đã chọn {selectedCount}/{total}
      </strong>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect(all)}>
        Chọn hết
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect([])}>
        Bỏ chọn
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect(all.filter((p) => p % 2 === 1))}>
        Trang lẻ
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect(all.filter((p) => p % 2 === 0))}>
        Trang chẵn
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelect('invert')}>
        Đảo chọn
      </button>
      <span className="pdft-toolbar__spacer" />
      {children}
    </div>
  );
};
