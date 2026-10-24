import React from 'react';
import { Link } from 'react-router';
import { ArrowRight, Folder, Star } from 'lucide-react';
import {
  getCategoryHref,
  getToolHref,
  type CategoryNode,
  type ToolDef,
} from '../catalog';

interface CategoryCardProps {
  node: CategoryNode;
  showSubfoldersPreview?: boolean;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  node,
  showSubfoldersPreview = false,
}) => {
  const style = { '--card-accent': node.accent } as React.CSSProperties;

  return (
    <Link to={getCategoryHref(node)} className="hub-card hub-card-folder" style={style}>
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          <div
            className="hub-icon-box"
            style={{
              color: node.accent,
              background: `${node.accent}1a`,
              borderColor: `${node.accent}40`,
            }}
          >
            <i className={`ph ${node.icon}`} />
          </div>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: node.accent,
              background: `${node.accent}18`,
              border: `1px solid ${node.accent}35`,
            }}
          >
            <Folder size={13} />
            <span>{node.totalTools} công cụ</span>
          </span>
        </div>

        <h3
          style={{
            fontSize: '1.06rem',
            fontWeight: 700,
            marginBottom: '6px',
            color: 'var(--text-main)',
          }}
        >
          {node.name}
        </h3>

        <p
          style={{
            fontSize: '0.84rem',
            color: 'var(--text-muted)',
            lineHeight: 1.45,
            marginBottom: showSubfoldersPreview && node.children.length > 0 ? '14px' : '10px',
          }}
        >
          {node.description}
        </p>

        {showSubfoldersPreview && node.children.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginBottom: '12px',
            }}
          >
            {node.children.map((sub) => (
              <span
                key={sub.slug}
                style={{
                  fontSize: '0.74rem',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                {sub.name} ({sub.totalTools})
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '10px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.8rem',
          fontWeight: 600,
          color: node.accent,
        }}
      >
        <span>
          {node.children.length > 0
            ? `${node.children.length} thư mục con • ${node.totalTools} công cụ`
            : `Mở danh mục (${node.totalTools} công cụ)`}
        </span>
        <ArrowRight size={15} />
      </div>
    </Link>
  );
};

interface ToolCardProps {
  tool: ToolDef;
  trail?: CategoryNode[];
  accent?: string;
  isFavorite: boolean;
  onToggleFavorite: (toolId: string) => void;
  onOpenTool: (toolId: string) => void;
}

export const ToolCard: React.FC<ToolCardProps> = ({
  tool,
  trail,
  accent,
  isFavorite,
  onToggleFavorite,
  onOpenTool,
}) => {
  const resolvedAccent = accent ?? trail?.[0]?.accent ?? '#06b6d4';
  const style = { '--card-accent': resolvedAccent } as React.CSSProperties;
  const href = getToolHref(tool);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(tool.id);
  };

  const innerContent = (
    <>
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <div
            className="hub-icon-box"
            style={{
              color: resolvedAccent,
              background: `${resolvedAccent}1a`,
              borderColor: `${resolvedAccent}40`,
            }}
          >
            <i className={`ph ${tool.icon}`} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {tool.badge && (
              <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                {tool.badge}
              </span>
            )}
            <button
              type="button"
              onClick={handleFavoriteClick}
              className={`hub-fav-btn ${isFavorite ? 'is-active' : ''}`}
              title={isFavorite ? 'Bỏ khỏi Yêu thích' : 'Lưu vào Yêu thích'}
              aria-label={isFavorite ? 'Bỏ khỏi Yêu thích' : 'Lưu vào Yêu thích'}
            >
              <Star size={16} fill={isFavorite ? '#f59e0b' : 'none'} />
            </button>
          </div>
        </div>

        <h3
          style={{
            fontSize: '0.98rem',
            fontWeight: 700,
            marginBottom: '5px',
            color: 'var(--text-main)',
          }}
        >
          {tool.name}
        </h3>

        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            lineHeight: 1.45,
          }}
        >
          {tool.description}
        </p>
      </div>

      {trail && trail.length > 0 && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.74rem',
            color: 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {trail.map((c) => c.name).join(' › ')}
          </span>
          <ArrowRight size={13} style={{ flexShrink: 0 }} />
        </div>
      )}
    </>
  );

  if (tool.kind === 'internal') {
    return (
      <Link
        to={href}
        onClick={() => onOpenTool(tool.id)}
        className="hub-card"
        style={style}
      >
        {innerContent}
      </Link>
    );
  }

  return (
    <a
      href={href}
      onClick={() => onOpenTool(tool.id)}
      className="hub-card"
      style={style}
    >
      {innerContent}
    </a>
  );
};
