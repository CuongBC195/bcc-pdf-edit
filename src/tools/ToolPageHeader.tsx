import React, { useContext } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Star } from 'lucide-react';
import {
  findToolLocation,
  getCategoryHref,
  getToolHref,
} from '../catalog';
import { LauncherEmbedContext } from '../hub/LauncherEmbedContext';
import { useHubPreferences } from '../utils/hubStorage';

interface ToolPageHeaderProps {
  toolId: string;
  rightSlot?: React.ReactNode;
}

export const ToolPageHeader: React.FC<ToolPageHeaderProps> = ({ toolId, rightSlot }) => {
  const isEmbedded = useContext(LauncherEmbedContext);
  const { favorites, toggleFavorite, recordVisit } = useHubPreferences();
  const loc = findToolLocation(toolId);

  if (isEmbedded) {
    return rightSlot ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        {rightSlot}
      </div>
    ) : null;
  }

  if (!loc) return null;

  const { tool, trail } = loc;
  const parentCategory = trail[trail.length - 1];
  const accent = parentCategory?.accent ?? '#06b6d4';
  const isFav = favorites.includes(tool.id);
  const siblingTools = parentCategory?.tools ?? [];

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Thanh chuyển nhanh các công cụ cùng nhóm */}
      {parentCategory && siblingTools.length > 1 && (
        <div className="hub-pill-nav" style={{ marginBottom: '14px' }}>
          <Link to={getCategoryHref(parentCategory)} className="hub-pill">
            <ArrowLeft size={14} />
            <span>{parentCategory.name}</span>
          </Link>
          {siblingTools.map((sib) => {
            const active = sib.id === tool.id;
            return (
              <Link
                key={sib.id}
                to={getToolHref(sib)}
                onClick={() => recordVisit(sib.id)}
                className={`hub-pill ${active ? 'is-active' : ''}`}
              >
                <i className={`ph ${sib.icon}`} />
                <span>{sib.name}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Khung tiêu đề công cụ */}
      <div
        className="bento-card"
        style={{
          padding: '18px 22px',
          borderLeft: `4px solid ${accent}`,
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
              width: '46px',
              height: '46px',
              fontSize: '1.45rem',
              color: accent,
              background: `${accent}1a`,
              borderColor: `${accent}40`,
            }}
          >
            <i className={`ph ${tool.icon}`} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.28rem', fontWeight: 800, margin: 0 }}>{tool.name}</h2>
              {tool.badge && (
                <span className="badge badge-cyan" style={{ fontSize: '0.66rem', padding: '2px 8px' }}>
                  {tool.badge}
                </span>
              )}
              <button
                type="button"
                onClick={() => toggleFavorite(tool.id)}
                className={`hub-fav-btn ${isFav ? 'is-active' : ''}`}
                title={isFav ? 'Bỏ khỏi Yêu thích' : 'Lưu vào Yêu thích'}
              >
                <Star size={16} fill={isFav ? '#f59e0b' : 'none'} />
              </button>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {tool.description}
            </p>
          </div>
        </div>

        {rightSlot && <div>{rightSlot}</div>}
      </div>
    </div>
  );
};
