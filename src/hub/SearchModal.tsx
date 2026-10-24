import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Folder, Search, X } from 'lucide-react';
import {
  getCategoryHref,
  getToolHref,
  POPULAR_TOOLS,
  searchCatalog,
  type CategoryNode,
  type ToolLocation,
} from '../catalog';

interface SearchModalProps {
  isOpen: boolean;
  initialQuery?: string;
  onClose: () => void;
  onOpenTool: (toolId: string) => void;
}

type SearchResultItem =
  | { kind: 'category'; node: CategoryNode }
  | { kind: 'tool'; location: ToolLocation };

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  initialQuery = '',
  onClose,
  onOpenTool,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const { categories, tools } = useMemo(() => {
    if (!query.trim()) {
      return { categories: [], tools: POPULAR_TOOLS.slice(0, 10) };
    }
    const res = searchCatalog(query);
    return {
      categories: res.categories.slice(0, 5),
      tools: res.tools.slice(0, 20),
    };
  }, [query]);

  const flatItems = useMemo<SearchResultItem[]>(() => {
    return [
      ...categories.map((node): SearchResultItem => ({ kind: 'category', node })),
      ...tools.map((location): SearchResultItem => ({ kind: 'tool', location })),
    ];
  }, [categories, tools]);

  const handleClose = () => {
    setQuery('');
    setSelectedIndex(0);
    onClose();
  };

  const activateItem = (item: SearchResultItem) => {
    handleClose();
    if (item.kind === 'category') {
      navigate(getCategoryHref(item.node));
      return;
    }
    const { tool } = item.location;
    onOpenTool(tool.id);
    const href = getToolHref(tool);
    if (tool.kind === 'internal') {
      navigate(href);
    } else {
      window.location.assign(href);
    }
  };

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (flatItems.length ? (prev + 1) % flatItems.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        flatItems.length ? (prev - 1 + flatItems.length) % flatItems.length : 0
      );
      return;
    }
    if (e.key === 'Enter' && flatItems[selectedIndex]) {
      e.preventDefault();
      activateItem(flatItems[selectedIndex]);
    }
  };

  return (
    <div
      className="hub-modal-backdrop animate-fade-in"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tìm kiếm công cụ PDF"
    >
      <div
        className="hub-search-dialog animate-popup-scale"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <Search size={19} color="var(--border-active)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Nhập tên công cụ (có dấu hoặc không dấu: gop pdf, tach trang, ocr, word...)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-main)',
              fontSize: '0.96rem',
              fontFamily: 'var(--font-sans)',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
              }}
              className="btn btn-ghost btn-sm"
              style={{ padding: '4px 8px' }}
              title="Xóa từ khóa"
            >
              <X size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 10px', fontSize: '0.74rem' }}
          >
            ESC
          </button>
        </div>

        <div
          style={{
            maxHeight: '62vh',
            overflowY: 'auto',
            padding: '12px 14px',
          }}
        >
          {flatItems.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
              }}
            >
              Không tìm thấy công cụ hoặc danh mục phù hợp với “{query}”.
            </div>
          ) : (
            <>
              {categories.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div
                    style={{
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-dim)',
                      padding: '4px 10px 6px',
                    }}
                  >
                    Danh mục ({categories.length})
                  </div>
                  {categories.map((cat, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <a
                        key={cat.path.join('/')}
                        href={getCategoryHref(cat)}
                        onClick={(e) => {
                          e.preventDefault();
                          activateItem({ kind: 'category', node: cat });
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`hub-search-item ${isSelected ? 'is-selected' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            className="hub-icon-box"
                            style={{
                              width: '36px',
                              height: '36px',
                              fontSize: '1.15rem',
                              color: cat.accent,
                              background: `${cat.accent}1a`,
                              borderColor: `${cat.accent}40`,
                            }}
                          >
                            <i className={`ph ${cat.icon}`} />
                          </div>
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <Folder size={13} color={cat.accent} />
                              <span>{cat.name}</span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {cat.description}
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: cat.accent,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cat.totalTools} công cụ
                        </span>
                      </a>
                    );
                  })}
                </div>
              )}

              <div>
                <div
                  style={{
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-dim)',
                    padding: '4px 10px 6px',
                  }}
                >
                  {query.trim() ? `Công cụ (${tools.length})` : 'Công cụ phổ biến'}
                </div>
                {tools.map((loc, idx) => {
                  const globalIdx = categories.length + idx;
                  const isSelected = selectedIndex === globalIdx;
                  const accent = loc.trail[0]?.accent ?? '#06b6d4';
                  return (
                    <a
                      key={loc.tool.id}
                      href={getToolHref(loc.tool)}
                      onClick={(e) => {
                        e.preventDefault();
                        activateItem({ kind: 'tool', location: loc });
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`hub-search-item ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div
                          className="hub-icon-box"
                          style={{
                            width: '36px',
                            height: '36px',
                            fontSize: '1.15rem',
                            color: accent,
                            background: `${accent}1a`,
                            borderColor: `${accent}40`,
                          }}
                        >
                          <i className={`ph ${loc.tool.icon}`} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '0.9rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span>{loc.tool.name}</span>
                            {loc.tool.badge && (
                              <span
                                className="badge badge-cyan"
                                style={{ fontSize: '0.65rem', padding: '1px 7px' }}
                              >
                                {loc.tool.badge}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '0.78rem',
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {loc.tool.description}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexShrink: 0,
                          fontSize: '0.75rem',
                          color: 'var(--text-dim)',
                        }}
                      >
                        <span>{loc.trail.map((t) => t.name).join(' › ')}</span>
                        <ArrowRight size={14} />
                      </div>
                    </a>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.75rem',
            color: 'var(--text-dim)',
            background: 'var(--bg-surface-elevated)',
          }}
        >
          <span>Dùng phím ↑↓ để chọn, Enter để mở, ESC để đóng</span>
          <span>Hỗ trợ tìm tiếng Việt không dấu & tiếng Anh</span>
        </div>
      </div>
    </div>
  );
};
