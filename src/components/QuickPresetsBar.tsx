import React, { useState } from 'react';
import { Bookmark, Split, Copy, Edit3, Trash2 } from 'lucide-react';
import type { PDFBookmarkItem } from '../types/pdf';

interface QuickPresetsBarProps {
  bookmarks: PDFBookmarkItem[];
  totalSourcePages: number;
  onApplyBookmarks: () => void;
  onSplitEveryNPages: (n: number) => void;
  onSplitEveryPage: () => void;
  onOpenBatchRename: () => void;
  onClearRules: () => void;
  ruleCount: number;
  defaultPattern?: string;
}

export const QuickPresetsBar: React.FC<QuickPresetsBarProps> = ({
  bookmarks,
  totalSourcePages,
  onApplyBookmarks,
  onSplitEveryNPages,
  onSplitEveryPage,
  onOpenBatchRename,
  onClearRules,
  ruleCount,
  defaultPattern,
}) => {
  const [customN, setCustomN] = useState<number>(2);
  const [showNPrompt, setShowNPrompt] = useState(false);

  return (
    <div
      className="bento-card"
      style={{
        padding: '12px 18px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'var(--bg-surface-elevated)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' }}>
          Gợi ý nhanh:
        </span>

        {bookmarks && bookmarks.length > 0 && (
          <button
            type="button"
            onClick={onApplyBookmarks}
            className="btn btn-primary btn-sm"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
              boxShadow: '0 2px 10px rgba(139, 92, 246, 0.3)',
            }}
            title="Tự động tạo các file con theo cây mục lục của PDF"
          >
            <Bookmark size={14} />
            <span>Tách theo Mục lục ({bookmarks.length} mục)</span>
          </button>
        )}

        {showNPrompt ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mỗi</span>
            <input
              type="number"
              min={1}
              max={totalSourcePages}
              value={customN}
              onChange={(e) => setCustomN(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                width: '45px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                fontWeight: 'bold',
                textAlign: 'center',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>trang/file</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
              onClick={() => {
                onSplitEveryNPages(customN);
                setShowNPrompt(false);
              }}
            >
              Áp dụng
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px', fontSize: '0.75rem' }}
              onClick={() => setShowNPrompt(false)}
            >
              Hủy
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNPrompt(true)}
            className="btn btn-secondary btn-sm"
            title="Chia đều tài liệu, cứ mỗi N trang thành 1 file riêng biệt"
          >
            <Split size={14} />
            <span>Chia đều N trang</span>
          </button>
        )}

        <button
          type="button"
          onClick={onSplitEveryPage}
          className="btn btn-secondary btn-sm"
          title="Tách tất cả các trang thành từng file 1 trang độc lập"
        >
          <Copy size={14} />
          <span>Tách từng trang ({totalSourcePages} file)</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onOpenBatchRename}
          className="btn btn-secondary btn-sm"
          style={{
            borderColor: defaultPattern ? 'rgba(245, 158, 11, 0.4)' : undefined,
            background: defaultPattern ? 'rgba(245, 158, 11, 0.08)' : undefined,
          }}
          title="Thiết lập mẫu đặt tên file tự động theo chuẩn lưu trữ ({cs})"
        >
          <Edit3 size={14} style={{ color: defaultPattern ? 'var(--accent-amber)' : 'inherit' }} />
          <span>
            {defaultPattern
              ? `Mẫu: ${defaultPattern.length > 22 ? defaultPattern.slice(0, 22) + '...' : defaultPattern}`
              : 'Cài đặt mẫu tên file ({cs})'}
          </span>
        </button>

        {ruleCount > 0 && (
          <button
            type="button"
            onClick={onClearRules}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--accent-rose)' }}
            title="Xóa hết danh sách quy tắc đang có"
          >
            <Trash2 size={14} />
            <span>Xóa hết</span>
          </button>
        )}
      </div>
    </div>
  );
};
