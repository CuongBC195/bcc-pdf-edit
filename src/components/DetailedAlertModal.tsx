import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Info, X, ChevronRight } from 'lucide-react';

export interface DetailedAlertData {
  title: string;
  message: string;
  type?: 'error' | 'warning' | 'info';
  details?: string[];
  actionLabel?: string;
  onAction?: () => void;
}

interface DetailedAlertModalProps {
  alert: DetailedAlertData | null;
  onClose: () => void;
}

export const DetailedAlertModal: React.FC<DetailedAlertModalProps> = ({ alert, onClose }) => {
  if (!alert) return null;

  const isError = alert.type === 'error' || !alert.type;
  const isWarning = alert.type === 'warning';

  const themeColors = isError
    ? {
        accent: 'var(--accent-rose)',
        bgBadge: 'rgba(244, 63, 94, 0.12)',
        borderBadge: 'rgba(244, 63, 94, 0.28)',
        borderCard: 'rgba(244, 63, 94, 0.35)',
        glow: '0 20px 60px -10px rgba(244, 63, 94, 0.25)',
      }
    : isWarning
    ? {
        accent: 'var(--accent-amber)',
        bgBadge: 'rgba(245, 158, 11, 0.12)',
        borderBadge: 'rgba(245, 158, 11, 0.28)',
        borderCard: 'rgba(245, 158, 11, 0.35)',
        glow: '0 20px 60px -10px rgba(245, 158, 11, 0.25)',
      }
    : {
        accent: 'var(--accent-cyan)',
        bgBadge: 'rgba(2, 132, 199, 0.12)',
        borderBadge: 'rgba(2, 132, 199, 0.28)',
        borderCard: 'rgba(2, 132, 199, 0.35)',
        glow: '0 20px 60px -10px rgba(2, 132, 199, 0.25)',
      };

  return createPortal(
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
        zIndex: 1000000,
        padding: '20px',
        animation: 'fadeIn 0.18s ease',
      }}
      onClick={onClose}
    >
      <div
        className="bento-card animate-popup-scale"
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-surface)',
          padding: '24px 28px',
          borderRadius: '20px',
          boxShadow: themeColors.glow,
          border: `1.5px solid ${themeColors.borderCard}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Icon */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: themeColors.bgBadge,
                border: `1.5px solid ${themeColors.borderBadge}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: themeColors.accent,
                flexShrink: 0,
              }}
            >
              {isError ? <AlertCircle size={22} /> : isWarning ? <AlertTriangle size={22} /> : <Info size={22} />}
            </div>
            <div>
              <span
                style={{
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 800,
                  color: themeColors.accent,
                }}
              >
                {isError ? 'Lỗi cần xử lý' : isWarning ? 'Cảnh báo quan trọng' : 'Thông tin'}
              </span>
              <h3 style={{ fontSize: '1.18rem', fontWeight: 800, margin: '2px 0 0', color: 'var(--text-main)' }}>
                {alert.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ padding: '6px', color: 'var(--text-dim)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* High-level summary message */}
        <div
          style={{
            fontSize: '0.88rem',
            color: 'var(--text-main)',
            lineHeight: 1.55,
            marginBottom: alert.details && alert.details.length > 0 ? '16px' : '22px',
          }}
        >
          {alert.message}
        </div>

        {/* Detailed Items / Actionable Steps */}
        {alert.details && alert.details.length > 0 && (
          <div style={{ marginBottom: '22px' }}>
            <div
              style={{
                fontSize: '0.76rem',
                fontWeight: 700,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              Chi tiết các điểm cần lưu ý:
            </div>
            <div
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            >
              {alert.details.map((detail, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', lineHeight: 1.45 }}>
                  <ChevronRight size={14} style={{ color: themeColors.accent, flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>
                    {detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
          {alert.actionLabel && alert.onAction && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                alert.onAction?.();
                onClose();
              }}
            >
              {alert.actionLabel}
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              fontWeight: 700,
              fontSize: '0.86rem',
              background: isError ? 'var(--accent-rose)' : undefined,
              borderColor: isError ? 'var(--accent-rose)' : undefined,
            }}
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
