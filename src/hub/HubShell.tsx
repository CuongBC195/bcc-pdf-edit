import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Moon, Search, Sun } from 'lucide-react';
import { TOTAL_TOOL_COUNT } from '../catalog';
import { BccLogo } from '../components/BccLogo';
import { useHubPreferences } from '../utils/hubStorage';
import { CategorySidebar } from './CategorySidebar';
import { LauncherEmbedContext } from './LauncherEmbedContext';
import { SearchModal } from './SearchModal';

interface HubShellProps {
  children: React.ReactNode;
  hideSidebar?: boolean;
}

export const HubShell: React.FC<HubShellProps> = ({ children, hideSidebar = false }) => {
  const isEmbedded = useContext(LauncherEmbedContext);
  const { theme, toggleTheme, recordVisit } = useHubPreferences();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [isSearchOpen, setIsSearchOpen] = useState(
    () => new URLSearchParams(window.location.search).get('search') === '1'
  );

  useEffect(() => {
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.classList.add('notranslate');
    const iconLink = document.querySelector<HTMLLinkElement>('link[rel*="icon"]');
    if (iconLink && !iconLink.href.includes('bcc-logo.svg')) {
      iconLink.href = '/bcc-logo.svg?v=3';
    }
    if (isEmbedded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEmbedded]);

  if (isEmbedded) {
    return <div className="raycast-embedded-content">{children}</div>;
  }

  return (
    <div className="app-container">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 0',
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
            color: 'var(--text-main)',
          }}
        >
          <BccLogo size={38} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1
                style={{
                  fontSize: '1.28rem',
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: '-0.03em',
                }}
              >
                bcc<span style={{ color: 'var(--accent-cyan)' }}>Hub</span>
              </h1>
              <span
                className="badge badge-cyan"
                style={{ fontSize: '0.66rem', padding: '2px 8px' }}
              >
                {TOTAL_TOOL_COUNT} công cụ
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Cổng tiện ích Văn phòng, PDF & Mã QR • Xử lý 100% trực tiếp trên trình duyệt
            </p>
          </div>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isHome && (
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="btn btn-secondary btn-sm"
              style={{
                padding: '6px 11px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
              }}
              title="Tìm kiếm nhanh (Ctrl+K)"
            >
              <Search size={14} color="var(--border-active)" />
              <span>Tìm nhanh</span>
              <kbd
                style={{
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Ctrl K
              </kbd>
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="btn btn-secondary btn-sm"
            style={{
              padding: '6px 11px',
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
                <span>Sáng</span>
              </>
            ) : (
              <>
                <Moon size={15} color="#6366f1" />
                <span>Tối</span>
              </>
            )}
          </button>
        </div>
      </header>

      <div className={hideSidebar ? 'hub-workspace hub-workspace--single' : 'hub-workspace'}>
        {!hideSidebar && <CategorySidebar />}
        <main className="hub-main">{children}</main>
      </div>

      <footer
        style={{
          marginTop: 'auto',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '0.8rem',
          color: 'var(--text-dim)',
        }}
      >
        <div>
          <strong style={{ color: 'var(--text-muted)' }}>bccHub</strong> — Toàn bộ tài liệu, văn bản
          và hình ảnh được xử lý 100% trên trình duyệt của bạn, không tải lên máy chủ.
        </div>
        <div>
          Hệ sinh thái tiện ích văn phòng thông minh • Nhấn <kbd>Ctrl + K</kbd> để mở nhanh mọi công cụ
        </div>
      </footer>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onOpenTool={recordVisit}
      />
    </div>
  );
};
