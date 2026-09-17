import React, { useState, useEffect } from 'react';
import { X, Check, ArrowRight, Star, Sparkles, Hash } from 'lucide-react';
import type { SplitRule } from '../types/pdf';
import {
  evaluateNamingPattern,
  getDefaultNamingPattern,
  setDefaultNamingPattern,
  getDefaultNamingStart,
  setDefaultNamingStart,
  getDefaultNamingDigits,
  setDefaultNamingDigits,
} from '../utils/pageUtils';

interface BatchRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: SplitRule[];
  originalPdfName: string;
  onApplyPattern: (pattern: string, startFrom?: number, digits?: number) => void;
  onDefaultPatternChange?: (pattern: string) => void;
}

export const BatchRenameModal: React.FC<BatchRenameModalProps> = ({
  isOpen,
  onClose,
  rules,
  originalPdfName,
  onApplyPattern,
  onDefaultPatternChange,
}) => {
  const [pattern, setPattern] = useState(() => {
    return (
      getDefaultNamingPattern() ||
      localStorage.getItem('bccpdf_naming_pattern') ||
      'A38-011-07-0123-{cs}-BC-0001-1998'
    );
  });

  const [startIndex, setStartIndex] = useState<number>(() => getDefaultNamingStart());
  const [digits, setDigits] = useState<number>(() => getDefaultNamingDigits());
  const [isDefault, setIsDefault] = useState<boolean>(() => {
    const currDefault = getDefaultNamingPattern();
    return Boolean(currDefault);
  });

  // Sync state when opening
  useEffect(() => {
    if (isOpen) {
      const savedDefault = getDefaultNamingPattern();
      if (savedDefault) {
        setPattern(savedDefault);
        setIsDefault(true);
      }
      setStartIndex(getDefaultNamingStart());
      setDigits(getDefaultNamingDigits());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const baseOriginal = originalPdfName.replace(/\.[^/.]+$/, '');

  const samplePresets = [
    {
      label: '★ Tiêu chuẩn Lưu trữ VN (Ảnh mẫu)',
      val: 'A38-011-07-0123-{cs}-BC-0001-1998',
      desc: 'Mã số - P - ML - ĐVBQ - STT - BC - Số - Năm',
      suggestedDigits: 3,
    },
    {
      label: 'Lưu trữ VN rút gọn',
      val: 'A38-011-07-0123-{cs}',
      desc: 'Mã định danh + 3 số {cs} (001, 002...)',
      suggestedDigits: 3,
    },
    {
      label: 'Số thứ tự + Tên gốc',
      val: '{cs}_{original}',
      desc: '001_TenGoc.pdf',
      suggestedDigits: 2,
    },
    {
      label: 'Thư mục + Số thứ tự',
      val: '{original}/Part_{cs}',
      desc: 'Tự động tạo thư mục con',
      suggestedDigits: 2,
    },
    {
      label: 'Kèm dải trang',
      val: '{cs}_Trang_{range}',
      desc: '001_Trang_1-5.pdf',
      suggestedDigits: 3,
    },
  ];

  const handleApply = (saveAsDefault: boolean) => {
    const trimmed = pattern.trim();
    if (!trimmed) return;

    if (saveAsDefault) {
      setDefaultNamingPattern(trimmed);
      setDefaultNamingStart(startIndex);
      setDefaultNamingDigits(digits);
      if (onDefaultPatternChange) {
        onDefaultPatternChange(trimmed);
      }
    } else if (isDefault && !saveAsDefault) {
      setDefaultNamingPattern('');
      if (onDefaultPatternChange) {
        onDefaultPatternChange('');
      }
    }

    localStorage.setItem('bccpdf_naming_pattern', trimmed);
    onApplyPattern(trimmed, startIndex, digits);
    onClose();
  };

  const insertTag = (tag: string) => {
    setPattern((prev) => prev + tag);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        className="bento-card animate-popup-scale"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--bg-surface)',
          padding: '24px 28px',
          borderRadius: '20px',
          boxShadow: '0 25px 70px -10px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-medium)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(2, 132, 199, 0.12)',
                  border: '1px solid rgba(2, 132, 199, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-cyan)',
                }}
              >
                <Sparkles size={18} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                Cấu hình Mẫu tên tệp tự động ({rules.length} file)
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '6px 0 0 40px' }}>
              Hỗ trợ ký hiệu <code>{'{cs}'}</code> tự động đánh số chuẩn Lưu trữ Nhà nước (ví dụ:{' '}
              <strong style={{ color: 'var(--text-main)' }}>A38-011-07-0123-{'{cs}'}-BC-0001-1998</strong>)
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Presets Grid */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
            Mẫu có sẵn gợi ý:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
            {samplePresets.map((p) => {
              const isSelected = pattern === p.val;
              return (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => {
                    setPattern(p.val);
                    setDigits(p.suggestedDigits);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(2, 132, 199, 0.14)' : 'var(--bg-surface-elevated)',
                    border: isSelected ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isSelected ? 'var(--accent-cyan)' : 'var(--text-main)', marginBottom: '2px' }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                    {p.val}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pattern Input with Monospace Styling */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Cú pháp tên file (Pattern):
            </label>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Dùng <code>{'{cs}'}</code> để hệ thống tự động điền số thứ tự
            </span>
          </div>

          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="input-field"
            placeholder="A38-011-07-0123-{cs}-BC-0001-1998"
            style={{
              fontFamily: 'monospace',
              fontSize: '0.96rem',
              fontWeight: 600,
              letterSpacing: '0.02em',
              padding: '10px 14px',
              border: '1.5px solid var(--border-medium)',
              borderRadius: '10px',
            }}
          />

          {/* Quick Insert Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginRight: '2px' }}>Bấm chèn nhanh:</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => insertTag('{cs}')}
              style={{ fontSize: '0.74rem', padding: '3px 8px', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}
              title="Chèn ký hiệu đánh số thứ tự (ví dụ: 001, 002...)"
            >
              + {'{cs}'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => insertTag('{original}')}
              style={{ fontSize: '0.74rem', padding: '3px 8px', fontFamily: 'monospace' }}
              title="Chèn tên file PDF gốc"
            >
              + {'{original}'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => insertTag('{range}')}
              style={{ fontSize: '0.74rem', padding: '3px 8px', fontFamily: 'monospace' }}
              title="Chèn dải trang (vd: 1-5)"
            >
              + {'{range}'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => insertTag('{pages}')}
              style={{ fontSize: '0.74rem', padding: '3px 8px', fontFamily: 'monospace' }}
              title="Chèn số lượng trang"
            >
              + {'{pages}'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => insertTag('/')}
              style={{ fontSize: '0.74rem', padding: '3px 8px', fontFamily: 'monospace', color: 'var(--accent-amber)' }}
              title="Tự động gom vào thư mục con"
            >
              + / (Thư mục)
            </button>
          </div>
        </div>

        {/* Configuration Row: Start Index & Digits Padding */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px',
            marginBottom: '18px',
            padding: '12px 16px',
            background: 'var(--bg-surface-elevated)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
              Số thứ tự bắt đầu:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Hash size={15} style={{ color: 'var(--text-dim)' }} />
              <input
                type="number"
                min={1}
                max={99999}
                value={startIndex}
                onChange={(e) => setStartIndex(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '90px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-main)',
                  fontWeight: 'bold',
                }}
              />
              <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                (vd: 1 $\rightarrow$ 001, 002...)
              </span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
              Số chữ số của {'{cs}'} (Padding):
            </label>
            <select
              value={digits}
              onChange={(e) => setDigits(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <option value={3}>3 chữ số (001, 002, 003...) - Chuẩn Lưu trữ VN</option>
              <option value={2}>2 chữ số (01, 02, 03...)</option>
              <option value={4}>4 chữ số (0001, 0002...)</option>
              <option value={1}>Không thêm số 0 (1, 2, 3...)</option>
            </select>
          </div>
        </div>

        {/* Set as Default Option */}
        <div
          style={{
            marginBottom: '18px',
            padding: '10px 14px',
            borderRadius: '12px',
            background: isDefault ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface-elevated)',
            border: isDefault ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0, userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent-amber)', cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Star size={14} style={{ color: 'var(--accent-amber)', fill: isDefault ? 'var(--accent-amber)' : 'none' }} />
                <span>Đặt làm mẫu tên mặc định cho toàn bộ tệp mới thêm</span>
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>
                Mỗi khi bạn thêm file con mới, chia đều hay tách trang, hệ thống sẽ tự động dùng công thức này.
              </p>
            </div>
          </label>
        </div>

        {/* Live Preview Container */}
        <div style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Xem trước kết quả thực tế ({Math.min(5, rules.length)}/{rules.length} file):
            </label>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
              ✓ Đã tự động cập nhật
            </span>
          </div>

          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '10px 14px',
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            {rules.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
                Ví dụ mẫu: {evaluateNamingPattern(pattern, 0, { startIndex, defaultDigits: digits, originalPdfName: baseOriginal })}
              </div>
            ) : (
              rules.slice(0, 5).map((r, i) => {
                const sampleName = evaluateNamingPattern(pattern, i, {
                  startIndex,
                  defaultDigits: digits,
                  originalPdfName: baseOriginal,
                  rule: r,
                });
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-dim)', minWidth: '28px', fontSize: '0.76rem' }}>
                      #{startIndex + i}
                    </span>
                    <ArrowRight size={13} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-main)', wordBreak: 'break-all', fontWeight: 600 }}>
                      {sampleName}
                    </span>
                  </div>
                );
              })
            )}
            {rules.length > 5 && (
              <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.74rem', marginTop: '2px' }}>
                ... và {rules.length - 5} file khác tiếp tục được đánh số tự động
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Hủy
          </button>

          <button
            type="button"
            onClick={() => handleApply(isDefault)}
            className="btn btn-primary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            <Check size={16} />
            <span>
              {rules.length > 0
                ? `Áp dụng ngay cho ${rules.length} file con`
                : 'Lưu mẫu mặc định'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
