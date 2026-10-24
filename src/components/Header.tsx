import React from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Moon, Sun, FolderOpen } from 'lucide-react';
import { BccLogo } from './BccLogo';

interface HeaderProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  recentCount?: number;
  onOpenRecentModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  recentCount,
  onOpenRecentModal,
}) => {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '16px 0',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link
          to="/"
          className="btn btn-secondary btn-sm"
          style={{
            padding: '7px 12px',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
          }}
          title="Quay về Cổng công cụ BCCPDF Hub"
        >
          <ArrowLeft size={15} />
          <span>Tất cả công cụ</span>
        </Link>
        <BccLogo size={38} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
              bcc<span style={{ color: 'var(--accent-cyan)' }}>Hub</span>
            </h1>
            <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
              Multi-Split Pro
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Tách 1 file PDF tổng thành nhiều file nhỏ đồng thời & tùy biến tên/thư mục
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {recentCount !== undefined && recentCount > 0 && onOpenRecentModal && (
          <button
            onClick={onOpenRecentModal}
            className="btn btn-secondary btn-sm animate-fade-in"
            style={{
              padding: '7px 12px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
            }}
            title="Mở popup danh sách các tệp PDF đã lưu trong trình duyệt"
          >
            <FolderOpen size={15} color="var(--border-active)" />
            <span>Danh sách tệp ({recentCount})</span>
          </button>
        )}

        <button
          onClick={onToggleTheme}
          className="btn btn-secondary btn-sm"
          style={{
            padding: '7px 12px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
          }}
          title={theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <>
              <Sun size={15} color="#f59e0b" />
              <span>Giao diện Sáng</span>
            </>
          ) : (
            <>
              <Moon size={15} color="#6366f1" />
              <span>Giao diện Tối</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
