import React, { useState, useEffect } from 'react';
import { Archive, Save, Check, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { ExportProgress } from '../types/pdf';

interface ExportActionBarProps {
  validRuleCount: number;
  totalAssignedPages: number;
  unassignedPagesCount: number;
  hasErrors: boolean;
  onExportZip: (zipName: string) => void;
  onSaveDraft?: () => void | Promise<void>;
  exportProgress: ExportProgress;
  defaultZipName: string;
}

export const ExportActionBar: React.FC<ExportActionBarProps> = ({
  validRuleCount,
  totalAssignedPages,
  unassignedPagesCount,
  hasErrors,
  onExportZip,
  onSaveDraft,
  exportProgress,
  defaultZipName,
}) => {
  const [zipName, setZipName] = useState(defaultZipName);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const isBusy = exportProgress.status !== 'idle' && exportProgress.status !== 'done' && exportProgress.status !== 'error';

  useEffect(() => {
    setZipName(defaultZipName);
  }, [defaultZipName]);

  // If there are 0 valid rules and no ongoing export process, DO NOT render the footer at all!
  // This eliminates visual clutter and prevents blocking the viewport when starting up or configuring templates.
  if (validRuleCount === 0 && !isBusy) {
    return null;
  }

  // Floating collapsed pill badge when user minimizes the footer
  if (isCollapsed && !isBusy) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '18px',
          right: '24px',
          zIndex: 500,
          animation: 'fadeIn 0.2s ease',
        }}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="btn btn-primary btn-sm"
          style={{
            boxShadow: '0 8px 25px rgba(2, 132, 199, 0.45)',
            borderRadius: '30px',
            padding: '9px 18px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.84rem',
            fontWeight: 700,
            border: '1.5px solid rgba(255, 255, 255, 0.25)',
          }}
          title="Bấm để mở rộng thanh xuất file PDF/ZIP"
        >
          <Archive size={16} />
          <span>Sẵn sàng xuất: {validRuleCount} file ({totalAssignedPages} trang)</span>
          <ChevronUp size={15} />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border-medium)',
        boxShadow: '0 -6px 30px rgba(0, 0, 0, 0.15)',
        padding: '10px 24px',
        color: 'var(--text-main)',
        transition: 'background-color var(--transition-smooth), border-color var(--transition-smooth)',
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{
          maxWidth: '1480px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Left: Summary & Diagnostics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Sẵn sàng xuất: <span style={{ color: 'var(--border-active)' }}>{validRuleCount} file PDF</span>
              </span>
              <span className="badge badge-cyan" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                {totalAssignedPages} trang
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '2px' }}>
              {unassignedPagesCount > 0 ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-amber)' }}>
                  <AlertTriangle size={13} /> Còn {unassignedPagesCount} trang chưa gán
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-emerald)' }}>
                  <CheckCircle2 size={13} /> Tất cả các trang đã được gán
                </span>
              )}

              {hasErrors && (
                <span style={{ color: 'var(--accent-rose)' }}>
                  • Có quy tắc chưa hợp lệ
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Live Progress Bar (if processing) */}
        {isBusy && (
          <div style={{ flex: 1, maxWidth: '360px', margin: '0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-main)', marginBottom: '4px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                {exportProgress.message}
              </span>
              <span>{exportProgress.total > 0 ? `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` : ''}</span>
            </div>
            <div style={{ height: '6px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #0284c7, #10b981)',
                  width: `${exportProgress.total > 0 ? Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100)) : 10}%`,
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* ZIP Filename config */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 10px',
            }}
          >
            <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginRight: '6px', whiteSpace: 'nowrap' }}>Tên ZIP:</span>
            <input
              type="text"
              value={zipName}
              onChange={(e) => setZipName(e.target.value)}
              disabled={isBusy}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                outline: 'none',
                width: '160px',
              }}
            />
          </div>

          {/* Action 1: Save Draft Button */}
          {onSaveDraft && (
            <button
              type="button"
              onClick={async () => {
                await onSaveDraft();
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 2200);
              }}
              disabled={isBusy}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '0.82rem',
                color: draftSaved ? 'var(--accent-emerald)' : 'var(--text-main)',
                borderColor: draftSaved ? 'var(--accent-emerald)' : undefined,
                transition: 'all 0.2s ease',
              }}
              title="Lưu nháp phiên làm việc hiện tại vào bộ nhớ trình duyệt để tiếp tục sau"
            >
              {draftSaved ? <Check size={15} style={{ color: 'var(--accent-emerald)' }} /> : <Save size={15} />}
              <span>{draftSaved ? 'Đã lưu nháp' : 'Lưu nháp'}</span>
            </button>
          )}

          {/* Action 2: Download as ZIP */}
          <button
            type="button"
            onClick={() => onExportZip(zipName)}
            disabled={isBusy || validRuleCount === 0}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 18px', fontWeight: 700 }}
            title="Đóng gói và tải về tất cả các file con dưới dạng tệp nén .ZIP"
          >
            <Archive size={16} />
            <span>Tải file .ZIP</span>
          </button>

          {/* Collapse Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--text-muted)', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Thu gọn thanh xuất file xuống góc màn hình"
          >
            <ChevronDown size={15} />
            <span style={{ fontSize: '0.75rem' }}>Thu gọn</span>
          </button>
        </div>
      </div>
    </div>
  );
};
