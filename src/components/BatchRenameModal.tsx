import React, { useState } from 'react';
import { X, Check, HelpCircle, ArrowRight } from 'lucide-react';
import type { SplitRule } from '../types/pdf';

interface BatchRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: SplitRule[];
  originalPdfName: string;
  onApplyPattern: (pattern: string) => void;
}

export const BatchRenameModal: React.FC<BatchRenameModalProps> = ({
  isOpen,
  onClose,
  rules,
  originalPdfName,
  onApplyPattern,
}) => {
  const [pattern, setPattern] = useState(() => {
    return localStorage.getItem('bccpdf_naming_pattern') || '{index:02d}_{original}_Trang_{range}';
  });

  if (!isOpen) return null;

  const baseOriginal = originalPdfName.replace(/\.[^/.]+$/, '');

  const evaluatePattern = (template: string, index: number, rule: SplitRule): string => {
    const idx1 = index + 1;
    const idx02 = idx1 < 10 ? `0${idx1}` : `${idx1}`;
    const range = rule.pageRangeStr || `${rule.pages[0] || 1}-${rule.pages[rule.pages.length - 1] || 1}`;
    const pageCount = `${rule.pages.length}`;

    let res = template
      .replace(/\{index:02d\}/g, idx02)
      .replace(/\{index\}/g, `${idx1}`)
      .replace(/\{original\}/g, baseOriginal)
      .replace(/\{range\}/g, range)
      .replace(/\{pages\}/g, pageCount);

    if (!res.toLowerCase().endsWith('.pdf')) {
      res += '.pdf';
    }
    return res;
  };

  const samplePresets = [
    { label: 'Số thứ tự + Tên gốc', val: '{index:02d}_{original}' },
    { label: 'Thư mục + Số thứ tự', val: '{original}/Part_{index:02d}' },
    { label: 'Kèm Dải trang', val: '{index:02d}_Trang_{range}' },
    { label: 'Phần + Số lượng trang', val: 'Phan_{index}_{pages}Trang' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="bento-card"
        style={{
          width: '100%',
          maxWidth: '640px',
          background: 'var(--bg-surface)',
          padding: '24px',
          borderRadius: 'var(--radius-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Đổi tên & Thư mục hàng loạt</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Đặt tên tự động cho toàn bộ {rules.length} file con theo công thức
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Pattern Input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
            Mẫu đặt tên (Pattern):
          </label>
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="input-field"
            style={{ fontFamily: 'monospace', fontSize: '0.92rem' }}
          />
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
          {samplePresets.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              onClick={() => setPattern(p.val)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Tokens Helper */}
        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.78rem',
            color: 'var(--text-dim)',
            marginBottom: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-muted)' }}>
            <HelpCircle size={13} /> Các biến có thể sử dụng:
          </div>
          <div><code>{'{index:02d}'}</code>: 01, 02... | <code>{'{index}'}</code>: 1, 2...</div>
          <div><code>{'{original}'}</code>: {baseOriginal}</div>
          <div><code>{'{range}'}</code>: dải trang (vd: 1-5) | <code>{'{pages}'}</code>: tổng số trang</div>
          <div>Chèn <code>/</code> để tự động gom vào thư mục con (vd: <code>HoSo/{'{index:02d}'}</code>)</div>
        </div>

        {/* Live Preview List */}
        <div style={{ marginBottom: '22px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
            Xem trước kết quả ({rules.slice(0, 4).length}/{rules.length} file đầu tiên):
          </label>
          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {rules.slice(0, 4).map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text-dim)', minWidth: '24px' }}>#{i + 1}</span>
                <ArrowRight size={13} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>
                  {evaluatePattern(pattern, i, r)}
                </span>
              </div>
            ))}
            {rules.length > 4 && (
              <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.74rem' }}>
                ... và {rules.length - 4} file khác
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('bccpdf_naming_pattern', pattern);
              onApplyPattern(pattern);
              onClose();
            }}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Check size={16} />
            <span>Áp dụng cho tất cả ({rules.length} file)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
