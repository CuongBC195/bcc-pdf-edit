import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronDown, ChevronRight, FolderTree, LayoutGrid } from 'lucide-react';
import {
  findToolLocation,
  getCategoryHref,
  getToolHref,
  resolveToolId,
  ROOT_CATEGORIES,
  TOTAL_TOOL_COUNT,
  type CategoryNode,
} from '../catalog';
import { recordRecentTool } from '../utils/hubStorage';

export const CategorySidebar: React.FC = () => {
  const location = useLocation();

  // Xác định đường dẫn danh mục đang mở (từ /c/... hoặc từ công cụ /t/:toolId)
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
  }, [location]);

  // Danh sách các danh mục gốc đang mở rộng trong Sidebar
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>(() => ({
    'xu-ly-pdf': true,
    'ma-qr-ma-vach': true,
  }));

  // Danh mục cấp 2 đang mở rộng (bên trong Xử lý PDF)
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>(() => ({
    'xu-ly-pdf/sap-xep-quan-ly': true,
  }));

  const isRootExpanded = (slug: string) => {
    if (slug in expandedRoots) return expandedRoots[slug];
    return activeContext.rootSlug === slug;
  };

  const isSubExpanded = (subKey: string) => {
    if (subKey in expandedSubs) return expandedSubs[subKey];
    const activeSubKey =
      activeContext.rootSlug && activeContext.subSlug
        ? `${activeContext.rootSlug}/${activeContext.subSlug}`
        : '';
    return activeSubKey === subKey;
  };

  const toggleRoot = (slug: string) => {
    const current = isRootExpanded(slug);
    setExpandedRoots((prev) => ({ ...prev, [slug]: !current }));
  };

  const toggleSub = (pathKey: string) => {
    const current = isSubExpanded(pathKey);
    setExpandedSubs((prev) => ({ ...prev, [pathKey]: !current }));
  };

  const renderSubCategory = (sub: CategoryNode) => {
    const subKey = sub.path.join('/');
    const isSubActive =
      activeContext.activeCategoryPath === subKey ||
      activeContext.activeCategoryPath.startsWith(`${subKey}/`);
    const isExpanded = isSubExpanded(subKey);
    const hasNested = sub.children.length > 0;

    return (
      <div key={subKey} className="hub-side-sub">
        <div className={`hub-side-sub__row ${isSubActive ? 'is-active' : ''}`}>
          <Link
            to={getCategoryHref(sub)}
            onClick={() => {
              if (hasNested) {
                setExpandedSubs((prev) => ({ ...prev, [subKey]: true }));
              }
            }}
            className="hub-side-sub__link"
          >
            <i className={`ph ${sub.icon}`} style={{ color: sub.accent }} />
            <span className="hub-side-sub__name">{sub.name}</span>
            <span className="hub-side-count">{sub.totalTools}</span>
          </Link>
          {hasNested && (
            <button
              type="button"
              onClick={() => toggleSub(subKey)}
              className="hub-side-chevron"
              aria-label={`Mở rộng ${sub.name}`}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
        </div>

        {hasNested && isExpanded && (
          <div className="hub-side-leaf-list">
            {sub.children.map((leaf) => {
              const leafKey = leaf.path.join('/');
              const isLeafActive =
                activeContext.activeCategoryPath === leafKey ||
                activeContext.activeCategoryPath.startsWith(`${leafKey}/`);
              return (
                <Link
                  key={leafKey}
                  to={getCategoryHref(leaf)}
                  className={`hub-side-leaf ${isLeafActive ? 'is-active' : ''}`}
                >
                  <span className="hub-side-leaf__dot" />
                  <span className="hub-side-leaf__name">{leaf.name}</span>
                  <span className="hub-side-count">{leaf.totalTools}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="hub-sidebar" aria-label="Danh mục tiện ích bccHub">
      <div className="bento-card hub-sidebar__card">
        <div className="hub-sidebar__head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderTree size={17} color="var(--accent-cyan)" />
            <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>Danh mục tiện ích</span>
          </div>
          <span className="badge badge-cyan" style={{ fontSize: '0.66rem', padding: '2px 7px' }}>
            {TOTAL_TOOL_COUNT}
          </span>
        </div>

        <Link
          to="/"
          className={`hub-side-home ${location.pathname === '/' ? 'is-active' : ''}`}
        >
          <LayoutGrid size={15} />
          <span>Tất cả tiện ích & Nổi bật</span>
        </Link>

        <div className="hub-sidebar__tree">
          {ROOT_CATEGORIES.map((root) => {
            const isRootActive = activeContext.rootSlug === root.slug;
            const isExpanded = isRootExpanded(root.slug);

            return (
              <div
                key={root.slug}
                className={`hub-side-group ${isRootActive ? 'is-active' : ''}`}
                style={{ '--side-accent': root.accent } as React.CSSProperties}
              >
                <div className="hub-side-root">
                  <Link
                    to={getCategoryHref(root)}
                    onClick={() =>
                      setExpandedRoots((prev) => ({ ...prev, [root.slug]: true }))
                    }
                    className="hub-side-root__link"
                  >
                    <span
                      className="hub-side-root__icon"
                      style={{
                        color: root.accent,
                        background: `${root.accent}1a`,
                        borderColor: `${root.accent}38`,
                      }}
                    >
                      <i className={`ph ${root.icon}`} />
                    </span>
                    <span className="hub-side-root__name">{root.name}</span>
                    <span className="hub-side-count">{root.totalTools}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleRoot(root.slug)}
                    className="hub-side-chevron"
                    aria-label={`Thu phóng ${root.name}`}
                  >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="hub-side-body">
                    {root.children.length > 0
                      ? root.children.map(renderSubCategory)
                      : root.tools.map((tool) => {
                          const isToolActive = activeContext.activeToolId === tool.id;
                          return (
                            <Link
                              key={tool.id}
                              to={getToolHref(tool)}
                              onClick={() => recordRecentTool(tool.id)}
                              className={`hub-side-tool ${isToolActive ? 'is-active' : ''}`}
                            >
                              <i className={`ph ${tool.icon}`} style={{ color: root.accent }} />
                              <span className="hub-side-tool__name">{tool.name}</span>
                            </Link>
                          );
                        })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
