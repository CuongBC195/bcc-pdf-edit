import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, ChevronRight, Folder, Home } from 'lucide-react';
import {
  collectCategoryTools,
  findCategoryByPath,
  getCategoryHref,
} from '../catalog';
import { useHubPreferences } from '../utils/hubStorage';
import { ToolCard } from './CatalogCards';
import { HubShell } from './HubShell';

export const CategoryPage: React.FC = () => {
  const params = useParams();
  const splat = params['*'] ?? '';
  const { favorites, toggleFavorite, recordVisit } = useHubPreferences();
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const resolved = useMemo(() => findCategoryByPath(splat), [splat]);

  if (!resolved) {
    return (
      <HubShell>
        <div
          className="bento-card"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '10px' }}>
            Không tìm thấy danh mục
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
            Đường dẫn danh mục <code>/c/{splat}</code> không tồn tại hoặc đã thay đổi.
          </p>
          <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={16} />
            <span>Quay về Trang chủ bccHub</span>
          </Link>
        </div>
      </HubShell>
    );
  }

  const { node, trail } = resolved;
  const parentNode = trail.length > 1 ? trail[trail.length - 2] : null;
  const parentHref = parentNode ? getCategoryHref(parentNode) : '/';

  return (
    <HubShell>
      {/* Breadcrumb nhiều cấp + nút Quay lại */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        <nav aria-label="Breadcrumb" className="hub-breadcrumb">
          <Link to="/">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <Home size={14} />
              <span>Trang chủ</span>
            </span>
          </Link>
          {trail.map((item, idx) => {
            const isLast = idx === trail.length - 1;
            return (
              <React.Fragment key={item.path.join('/')}>
                <ChevronRight size={14} color="var(--text-dim)" />
                {isLast ? (
                  <span
                    aria-current="page"
                    style={{
                      fontWeight: 700,
                      color: 'var(--text-main)',
                      padding: '4px 8px',
                    }}
                  >
                    {item.name}
                  </span>
                ) : (
                  <Link to={getCategoryHref(item)}>{item.name}</Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        <Link
          to={parentHref}
          className="btn btn-secondary btn-sm"
          style={{ textDecoration: 'none' }}
        >
          <ArrowLeft size={14} />
          <span>{parentNode ? `Quay lại ${parentNode.name}` : 'Về Trang chủ'}</span>
        </Link>
      </div>

      {/* Tiêu đề Danh mục gọn + thanh nhảy nhanh nhánh con (nếu có) */}
      <section
        className="bento-card"
        style={{
          padding: '18px 22px',
          marginBottom: '20px',
          borderLeft: `4px solid ${node.accent}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              className="hub-icon-box"
              style={{
                width: '44px',
                height: '44px',
                fontSize: '1.45rem',
                color: node.accent,
                background: `${node.accent}1a`,
                borderColor: `${node.accent}40`,
              }}
            >
              <i className={`ph ${node.icon}`} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.28rem', fontWeight: 800, marginBottom: '2px' }}>
                {node.name}
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
                {node.description}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: node.accent,
              background: `${node.accent}18`,
              border: `1px solid ${node.accent}35`,
            }}
          >
            <Folder size={14} />
            <span>{node.totalTools} công cụ</span>
          </div>
        </div>

        {node.children.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {node.children.map((sub) => (
              <Link
                key={sub.slug}
                to={getCategoryHref(sub)}
                className="hub-pill"
                style={{ fontSize: '0.77rem', padding: '5px 11px' }}
              >
                <i className={`ph ${sub.icon}`} style={{ color: sub.accent }} />
                <span>{sub.name}</span>
                <span style={{ opacity: 0.7 }}>({sub.totalTools})</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Công cụ trực tiếp ở cấp hiện tại */}
      {node.tools.length > 0 && (
        <section style={{ marginBottom: '26px' }}>
          <div className="hub-grid">
            {node.tools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                accent={node.accent}
                isFavorite={favoriteSet.has(tool.id)}
                onToggleFavorite={toggleFavorite}
                onOpenTool={recordVisit}
              />
            ))}
          </div>
        </section>
      )}

      {/* Liệt kê trực tiếp các công cụ bên trong từng nhánh con để bấm mở 1 chạm */}
      {node.children.length > 0 && (
        <section>
          {node.children.map((sub) => {
            const subTools = collectCategoryTools(sub);
            return (
              <div key={sub.slug} style={{ marginBottom: '26px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '11px',
                  }}
                >
                  <Link
                    to={getCategoryHref(sub)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      textDecoration: 'none',
                      color: 'var(--text-main)',
                    }}
                  >
                    <i
                      className={`ph ${sub.icon}`}
                      style={{ fontSize: '1.15rem', color: sub.accent }}
                    />
                    <h3 style={{ fontSize: '1.04rem', fontWeight: 700, margin: 0 }}>
                      {sub.name}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      ({subTools.length})
                    </span>
                  </Link>
                  <Link
                    to={getCategoryHref(sub)}
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: sub.accent,
                      textDecoration: 'none',
                    }}
                  >
                    Chỉ xem nhóm này →
                  </Link>
                </div>

                <div className="hub-grid">
                  {subTools.map(({ tool }) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      accent={sub.accent}
                      isFavorite={favoriteSet.has(tool.id)}
                      onToggleFavorite={toggleFavorite}
                      onOpenTool={recordVisit}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </HubShell>
  );
};
