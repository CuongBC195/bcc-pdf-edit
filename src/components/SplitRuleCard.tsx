import React from 'react';
import { Folder, FileText, Trash2, Copy, AlertCircle, CheckCircle2, Check, MousePointerClick, Info } from 'lucide-react';
import type { SplitRule } from '../types/pdf';
import { PRESET_COLORS } from '../types/pdf';

interface SplitRuleCardProps {
  rule: SplitRule;
  index: number;
  totalSourcePages: number;
  isActive: boolean;
  onSelectRule: (id: string) => void;
  onHoverRule: (id: string | null) => void;
  onChangeName: (id: string, name: string) => void;
  onChangeRange: (id: string, rangeStr: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export const SplitRuleCard: React.FC<SplitRuleCardProps> = ({
  rule,
  index,
  totalSourcePages: _,
  isActive,
  onSelectRule,
  onHoverRule,
  onChangeName,
  onChangeRange,
  onChangeColor,
  onDelete,
  onDuplicate,
}) => {
  // Parse folder and filename for instant visual feedback
  const segments = rule.name.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = segments.pop() || 'untitled.pdf';
  const folderPath = segments.join('/');

  return (
    <div
      className="bento-card animate-fade-in"
      style={{
        padding: '16px',
        marginBottom: '14px',
        background: isActive ? 'var(--bg-surface)' : 'var(--bg-surface-elevated)',
        borderLeft: `5px solid ${rule.color}`,
        borderTop: isActive ? `2px solid ${rule.color}` : '1px solid var(--border-subtle)',
        borderRight: isActive ? `2px solid ${rule.color}` : '1px solid var(--border-subtle)',
        borderBottom: isActive ? `2px solid ${rule.color}` : '1px solid var(--border-subtle)',
        boxShadow: isActive
          ? `0 0 0 1px ${rule.color}, 0 6px 20px ${rule.color}25`
          : 'var(--shadow-sm)',
        transition: 'all var(--transition-fast)',
        cursor: 'default',
      }}
      onMouseEnter={() => onHoverRule(rule.id)}
      onMouseLeave={() => onHoverRule(null)}
    >
      {/* Card Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: rule.color,
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {index + 1}
          </div>

          <button
            type="button"
            onClick={() => onSelectRule(rule.id)}
            className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              fontSize: '0.75rem',
              padding: '2px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: isActive ? rule.color : 'transparent',
              borderColor: isActive ? rule.color : 'var(--border-medium)',
              color: isActive ? '#ffffff' : 'var(--text-main)',
            }}
            title="Nhấp để kích hoạt chỉnh sửa trang bằng cách nhấp trên hình thumbnail"
          >
            {isActive ? (
              <>
                <Check size={13} strokeWidth={2.5} />
                <span>Đang chọn</span>
              </>
            ) : (
              <>
                <MousePointerClick size={13} />
                <span>Chọn gán trang</span>
              </>
            )}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
            {PRESET_COLORS.slice(0, 6).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChangeColor(rule.id, c)}
                style={{
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  background: c,
                  border: c === rule.color ? '2px solid #ffffff' : 'none',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: c === rule.color ? 1 : 0.4,
                  transition: 'all 0.15s ease',
                }}
                title="Đổi màu nhận diện"
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span
            className={`badge ${rule.isValid ? 'badge-emerald' : 'badge-rose'}`}
            style={{
              fontSize: '0.72rem',
              background: rule.isValid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: rule.isValid ? '#059669' : '#e11d48',
              border: `1px solid ${rule.isValid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            }}
          >
            {rule.isValid ? (
              <>
                <CheckCircle2 size={12} /> {rule.pages.length} trang
              </>
            ) : (
              <>
                <AlertCircle size={12} /> Lỗi cú pháp
              </>
            )}
          </span>

          <button
            type="button"
            onClick={() => onDuplicate(rule.id)}
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 6px', color: 'var(--text-muted)' }}
            title="Nhân bản tệp này"
          >
            <Copy size={14} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(rule.id)}
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 6px', color: 'var(--accent-rose)' }}
            title="Xóa tệp này"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Active rule hint banner */}
      {isActive && (
        <div
          style={{
            fontSize: '0.74rem',
            color: rule.color,
            background: `${rule.color}15`,
            border: `1px solid ${rule.color}35`,
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem' }}>
            <Info size={14} color={rule.color} style={{ flexShrink: 0 }} />
            <span>Đang kích hoạt: Nhấp trực tiếp vào các trang ở cột bên trái để thêm/bớt.</span>
          </div>
          <button
            type="button"
            onClick={() => onSelectRule(rule.id)}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.7rem', padding: '1px 6px', height: 'auto' }}
          >
            Xong
          </button>
        </div>
      )}

      {/* Inputs Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* File Name & Subfolder path input */}
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
            Tên tệp & Đường dẫn thư mục (hỗ trợ "/")
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={rule.name}
              onChange={(e) => onChangeName(rule.id, e.target.value)}
              placeholder="ví dụ: 01_PhapLy/HopDongChinh.pdf"
              className="input-field"
              style={{
                fontFamily: 'monospace',
                fontSize: '0.84rem',
                paddingLeft: '32px',
              }}
            />
            <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}>
              {folderPath ? <Folder size={15} color="var(--accent-amber)" /> : <FileText size={15} />}
            </div>
          </div>

          {/* Directory Hierarchy Preview */}
          {folderPath && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.73rem', color: 'var(--accent-cyan)', marginTop: '4px' }}>
              <Folder size={12} />
              <span>Thư mục ảo: <strong>{folderPath}/</strong></span>
              <span>• File: <strong>{fileName}</strong></span>
            </div>
          )}
        </div>

        {/* Page range input */}
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
            Dải trang cần cắt (ví dụ: <code>1-5</code> hoặc <code>1, 3, 5-8</code>)
          </label>
          <input
            type="text"
            value={rule.pageRangeStr}
            onChange={(e) => onChangeRange(rule.id, e.target.value)}
            placeholder="ví dụ: 1-5"
            className={`input-field ${!rule.isValid ? 'input-error' : ''}`}
            style={{ fontFamily: 'monospace', fontSize: '0.84rem' }}
          />

          {!rule.isValid && rule.errorMsg && (
            <div style={{ fontSize: '0.73rem', color: 'var(--accent-rose)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertCircle size={12} />
              <span>{rule.errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
