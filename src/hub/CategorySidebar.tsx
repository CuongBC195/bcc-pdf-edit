import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronRight, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  findToolLocation,
  getCategoryHref,
  getToolHref,
  resolveToolId,
  ROOT_CATEGORIES,
  type CategoryNode,
} from '../catalog';
import { recordRecentTool } from '../utils/hubStorage';

interface CategorySidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenCommandPalette?: () => void;
}

interface FlyoutState {
  root: CategoryNode;
  top: number;
  left: number;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  collapsed = false,
  onToggleCollapse,
}) => {
  const location = useLocation();

  // Xác định danh mục / công cụ đang mở
  const activeContext = useMemo(() => {
    const { pathname } = location;
    if (pathname.startsWith('/c/')) {
      const slugPath = pathname.replace(/^\/c\/+/, '').replace(/\/+$/, '');
      const parts = slugPath.split('/').filter(Boolean);
      return {
        activeCategoryPath: slugPath,
        rootSlug: parts[0] ?? null,
        subSlug: parts[1] ?? null,
        activeToolId: null as string | null,
      };
    }
    if (pathname.startsWith('/t/')) {
      const rawId = pathname.replace(/^\/t\/+/, '').split('/')[0];
      const toolId = resolveToolId(rawId);
      const loc = findToolLocation(toolId);
      const trail = loc?.trail ?? [];
      const catPath = trail.length > 0 ? trail[trail.length - 1].path.join('/') : '';
      return {
        activeCategoryPath: catPath,
        rootSlug: trail[0]?.slug ?? null,
        subSlug: trail[1]?.slug ?? null,
        activeToolId: toolId,
      };
    }
    return {
      activeCategoryPath: '',
      rootSlug: null,
      subSlug: null,
      activeToolId: null,
    };
  }, [location.pathname]);

  // Cho phép mở đồng thời nhiều cụm (không tự đóng cụm cũ khi mở cụm mới)
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>(() => ({
    'xu-ly-pdf': true,
    ...(activeContext.rootSlug ? { [activeContext.rootSlug]: true } : {}),
  }));

  // Khi điều hướng sang một công cụ/danh mục thuộc cụm mới, tự động mở thêm cụm đó (giữ nguyên các cụm đang mở)
  useEffect(() => {
    if (activeContext.rootSlug) {
      setExpandedRoots((prev) =>
        prev[activeContext.rootSlug!] ? prev : { ...prev, [activeContext.rootSlug!]: true }
      );
    }
  }, [activeContext.rootSlug]);

  const isRootExpanded = (slug: string) => Boolean(expandedRoots[slug]);

  const toggleRoot = (slug: string) => {
    setExpandedRoots((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  // State điều khiển Pop-up Flyout khi hover vào icon lúc đóng Sidebar
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleCloseFlyout = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setFlyout(null);
    }, 140);
  };

  const handleOpenFlyout = (root: CategoryNode, el: HTMLElement) => {
    clearCloseTimer();
    const rect = el.getBoundingClientRect();
    const maxTop = Math.max(12, window.innerHeight - 420);
    setFlyout({
      root,
      top: Math.min(Math.max(12, rect.top - 6), maxTop),
      left: rect.right + 8,
    });
  };

  useEffect(() => {
    setFlyout(null);
  }, [location.pathname, collapsed]);

  // Chế độ thu gọn (Icon Rail + Hover Pop-up hiển thị danh sách tính năng)
  if (collapsed) {
    return (
      <aside className="hub-sidebar hub-sidebar--rail" aria-label="Điều hướng thu gọn">
        <div className="hub-rail">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hub-rail__btn"
              title="Mở rộng danh mục"
              aria-label="Mở rộng danh mục"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}

          <Link
            to="/"
            className={`hub-rail__btn ${location.pathname === '/' ? 'is-active' : ''}`}
            title="Tất cả tiện ích"
            aria-label="Tất cả tiện ích"
          >
            <LayoutGrid size={18} />
          </Link>

          <div className="hub-rail__divider" />

          <div className="hub-rail__groups">
            {ROOT_CATEGORIES.map((root) => {
              const isRootActive = activeContext.rootSlug === root.slug;
              const isHovered = flyout?.root.slug === root.slug;
              return (
                <Link
                  key={root.slug}
                  to={getCategoryHref(root)}
                  onMouseEnter={(e) => handleOpenFlyout(root, e.currentTarget)}
                  onMouseLeave={scheduleCloseFlyout}
                  onFocus={(e) => handleOpenFlyout(root, e.currentTarget)}
                  className={`hub-rail__group-btn ${isRootActive || isHovered ? 'is-active' : ''}`}
                  style={{ '--rail-accent': root.accent } as React.CSSProperties}
                  aria-label={root.name}
                >
                  <i className={`ph ${root.icon}`} style={{ color: root.accent }} />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Pop-up hiển thị tính năng khi hover vào icon ở chế độ đóng Sidebar */}
        {flyout && (
          <div
            className="hub-rail-flyout"
            style={{ top: flyout.top, left: flyout.left }}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleCloseFlyout}
          >
            <div className="hub-rail-flyout__head">
              <Link
                to={getCategoryHref(flyout.root)}
                onClick={() => setFlyout(null)}
                className="hub-rail-flyout__title"
              >
                <i className={`ph ${flyout.root.icon}`} style={{ color: flyout.root.accent }} />
                <span>{flyout.root.name}</span>
              </Link>
              <span className="hub-rail-flyout__badge">{flyout.root.totalTools}</span>
            </div>

            <div className="hub-rail-flyout__body">
              {flyout.root.children.length > 0 ? (
                flyout.root.children.map((sub) => {
                  const subKey = sub.path.join('/');
                  const isSubActive =
                    activeContext.activeCategoryPath === subKey ||
                    activeContext.activeCategoryPath.startsWith(`${subKey}/`);
                  return (
                    <div key={subKey} className="hub-rail-flyout__group">
                      <Link
                        to={getCategoryHref(sub)}
                        onClick={() => setFlyout(null)}
                        className={`hub-rail-flyout__sub ${isSubActive ? 'is-active' : ''}`}
                      >
                        <i className={`ph ${sub.icon}`} style={{ color: sub.accent }} />
                        <span className="hub-rail-flyout__sub-name">{sub.name}</span>
                        <span className="hub-rail-flyout__count">{sub.totalTools}</span>
                      </Link>
                      {sub.children.length > 0 && (
                        <div className="hub-rail-flyout__chips">
                          {sub.children.map((leaf) => {
                            const leafKey = leaf.path.join('/');
                            const isLeafActive = activeContext.activeCategoryPath === leafKey;
                            return (
                              <Link
                                key={leafKey}
                                to={getCategoryHref(leaf)}
                                onClick={() => setFlyout(null)}
                                className={`hub-rail-flyout__chip ${isLeafActive ? 'is-active' : ''}`}
                              >
                                {leaf.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="hub-rail-flyout__list">
                  {flyout.root.tools.map((tool) => {
                    const isToolActive = activeContext.activeToolId === tool.id;
                    return (
                      <Link
                        key={tool.id}
                        to={getToolHref(tool)}
                        onClick={() => {
                          recordRecentTool(tool.id);
                          setFlyout(null);
                        }}
                        className={`hub-rail-flyout__item ${isToolActive ? 'is-active' : ''}`}
                      >
                        <i
                          className={`ph ${tool.icon}`}
                          style={{ color: isToolActive ? 'var(--accent-cyan)' : flyout.root.accent }}
                        />
                        <span>{tool.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="hub-sidebar" aria-label="Danh mục tiện ích">
      <nav className="hub-sidebar__panel">
        {/* Hàng trên cùng: Tất cả tiện ích + nút thu gọn */}
        <div className="hub-sidebar__top-row">
          <Link
            to="/"
            className={`hub-nav-overview ${location.pathname === '/' ? 'is-active' : ''}`}
          >
            <LayoutGrid size={17} className="hub-nav-overview__icon" />
            <span>Tất cả tiện ích</span>
          </Link>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hub-sidebar__collapse-btn"
              title="Thu gọn thanh bên"
              aria-label="Thu gọn thanh bên"
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>

        <div className="hub-sidebar__divider" />

        {/* Cây danh mục: chữ rõ, khoảng cách tinh gọn, mở nhiều cụm độc lập */}
        <div className="hub-nav-tree">
          {ROOT_CATEGORIES.map((root) => {
            const isRootActive = activeContext.rootSlug === root.slug;
            const isExpanded = isRootExpanded(root.slug);

            return (
              <div key={root.slug} className="hub-nav-group">
                <div className={`hub-nav-root ${isRootActive ? 'is-active' : ''}`}>
                  <Link
                    to={getCategoryHref(root)}
                    onClick={() =>
                      setExpandedRoots((prev) => ({ ...prev, [root.slug]: true }))
                    }
                    className="hub-nav-root__link"
                  >
                    <i
                      className={`ph ${root.icon} hub-nav-root__glyph`}
                      style={{ color: root.accent }}
                    />
                    <span className="hub-nav-root__name">{root.name}</span>
                    <span className="hub-nav-count">{root.totalTools}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleRoot(root.slug)}
                    className={`hub-nav-chevron ${isExpanded ? 'is-open' : ''}`}
                    aria-label={`Thu phóng ${root.name}`}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="hub-nav-children">
                    {root.children.length > 0
                      ? root.children.map((sub) => {
                          const subKey = sub.path.join('/');
                          const isSubActive =
                            activeContext.activeCategoryPath === subKey ||
                            activeContext.activeCategoryPath.startsWith(`${subKey}/`);
                          return (
                            <Link
                              key={subKey}
                              to={getCategoryHref(sub)}
                              className={`hub-nav-child ${isSubActive ? 'is-active' : ''}`}
                            >
                              <i
                                className={`ph ${sub.icon} hub-nav-child__icon`}
                                style={{ color: sub.accent }}
                              />
                              <span className="hub-nav-child__name">{sub.name}</span>
                              <span className="hub-nav-child__count">{sub.totalTools}</span>
                            </Link>
                          );
                        })
                      : root.tools.map((tool) => {
                          const isToolActive = activeContext.activeToolId === tool.id;
                          return (
                            <Link
                              key={tool.id}
                              to={getToolHref(tool)}
                              onClick={() => recordRecentTool(tool.id)}
                              className={`hub-nav-child ${isToolActive ? 'is-active' : ''}`}
                            >
                              <i
                                className={`ph ${tool.icon} hub-nav-child__icon`}
                                style={{ color: isToolActive ? 'var(--accent-cyan)' : root.accent }}
                              />
                              <span className="hub-nav-child__name">{tool.name}</span>
                            </Link>
                          );
                        })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};
