import React, { useState, useEffect } from 'react';
import { Archive, HardDrive, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { ExportProgress } from '../types/pdf';
import { isDirectoryPickerSupported } from '../services/exportService';

interface ExportActionBarProps {
  validRuleCount: number;
  totalAssignedPages: number;
  unassignedPagesCount: number;
  hasErrors: boolean;
  onExportZip: (zipName: string) => void;
  onSaveToDisk: () => void;
  exportProgress: ExportProgress;
  defaultZipName: string;
}

export const ExportActionBar: React.FC<ExportActionBarProps> = ({
  validRuleCount,
  totalAssignedPages,
  unassignedPagesCount,
  hasErrors,
  onExportZip,
  onSaveToDisk,
  exportProgress,
  defaultZipName,
}) => {
  const [zipName, setZipName] = useState(defaultZipName);
  const isBusy = exportProgress.status !== 'idle' && exportProgress.status !== 'done' && exportProgress.status !== 'error';
  const hasDirectoryApi = isDirectoryPickerSupported();

  useEffect(() => {
    setZipName(defaultZipName);
  }, [defaultZipName]);

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
        boxShadow: '0 -4px 25px rgba(0, 0, 0, 0.1)',
        padding: '12px 24px',
        color: 'var(--text-main)',
        transition: 'background-color var(--transition-smooth), border-color var(--transition-smooth)',
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
          gap: '14px',
        }}
      >
        {/* Left: Summary & Diagnostics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* ZIP Filename config */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px'
          }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginRight: '6px', whiteSpace: 'nowrap' }}>Tên ZIP:</span>
            <input
              type="text"
              value={zipName}
              onChange={(e) => setZipName(e.target.value)}
              disabled={isBusy}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-main)',
                fontSize: '0.84rem',
                fontFamily: 'monospace',
                outline: 'none',
                width: '180px',
              }}
            />
          </div>

          {/* Action 1: Download as ZIP */}
          <button
            type="button"
            onClick={() => onExportZip(zipName)}
            disabled={isBusy || validRuleCount === 0}
            className="btn btn-primary btn-lg"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Archive size={18} />
            <span>Tải file .ZIP</span>
          </button>

          {/* Action 2: Direct Directory Save */}
          <button
            type="button"
            onClick={onSaveToDisk}
            disabled={isBusy || validRuleCount === 0}
            className="btn btn-success btn-lg"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            title={hasDirectoryApi ? 'Ghi trực tiếp các file và thư mục con vào ổ đĩa máy tính' : 'Tính năng khả dụng trên Chrome, Edge, Cốc Cốc'}
          >
            <HardDrive size={18} />
            <span>Lưu thẳng vào Ổ đĩa</span>
          </button>
        </div>
      </div>
    </div>
  );
};
