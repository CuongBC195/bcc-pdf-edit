import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Check, Folder, Search, Sparkles, X } from 'lucide-react';
import {
  getCategoryHref,
  getToolHref,
  POPULAR_TOOLS,
  searchCatalog,
  type CategoryNode,
  type ToolLocation,
} from '../catalog';
import { useHubPreferences } from '../utils/hubStorage';
import { renderQrToCanvas } from '../utils/qrCode';
import { resolveRaycastActions, type RaycastQuickAction } from '../utils/raycastActions';

interface SearchModalProps {
  isOpen: boolean;
  initialQuery?: string;
  onClose: () => void;
  onOpenTool: (toolId: string) => void;
}

type SearchResultItem =
  | { kind: 'quick'; action: RaycastQuickAction }
  | { kind: 'category'; node: CategoryNode }
  | { kind: 'tool'; location: ToolLocation };

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  initialQuery = '',
  onClose,
  onOpenTool,
}) => {
  const { toggleTheme } = useHubPreferences();
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  const quickActions = useMemo(() => resolveRaycastActions(query), [query]);

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
      ...quickActions.map((action): SearchResultItem => ({ kind: 'quick', action })),
      ...categories.map((node): SearchResultItem => ({ kind: 'category', node })),
      ...tools.map((location): SearchResultItem => ({ kind: 'tool', location })),
    ];
  }, [quickActions, categories, tools]);

  const handleClose = () => {
    setQuery('');
    setSelectedIndex(0);
    onClose();
  };

  const executeQuickAction = async (action: RaycastQuickAction) => {
    if (action.specialEffect === 'toggle-theme') {
      toggleTheme();
      setCopiedId(action.id);
      setTimeout(() => setCopiedId(null), 1500);
      return;
    }

    if (action.qrPayload) {
      try {
        const canvas = document.createElement('canvas');
        renderQrToCanvas(canvas, action.qrPayload, {
          sizePx: 600,
          marginModules: 3,
          darkColor: '#0f172a',
          lightColor: '#ffffff',
        });
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob && navigator.clipboard && 'ClipboardItem' in window) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setCopiedId(action.id);
          setTimeout(() => setCopiedId(null), 1500);
          return;
        }
      } catch {
        // Fallback sang copy text
      }
    }

    if (action.copyText) {
      try {
        await navigator.clipboard.writeText(action.copyText);
        setCopiedId(action.id);
        setTimeout(() => setCopiedId(null), 1500);
      } catch {
        // Bỏ qua nếu bị chặn
      }
    }
  };

  const activateItem = (item: SearchResultItem) => {
    if (item.kind === 'quick') {
      void executeQuickAction(item.action);
      return;
    }
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
      aria-label="Tìm kiếm & Lệnh nhanh bccHub"
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
            placeholder="Gõ số tiền (15tr), phép tính (1250*48), link QR, ngày (+15 ngay) hoặc tên công cụ..."
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
              Không tìm thấy công cụ hoặc lệnh phù hợp với “{query}”.
            </div>
          ) : (
            <>
              {quickActions.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--accent-cyan)',
                      padding: '4px 10px 6px',
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Kết quả tức thì ({quickActions.length}) — Nhấn Enter để Copy</span>
                  </div>
                  {quickActions.map((action, idx) => {
                    const isSelected = selectedIndex === idx;
                    const isCopied = copiedId === action.id;
                    return (
                      <div
                        key={action.id}
                        onClick={() => activateItem({ kind: 'quick', action })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`hub-search-item ${isSelected ? 'is-selected' : ''}`}
                        style={{ cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <div
                            className="hub-icon-box"
                            style={{
                              width: '36px',
                              height: '36px',
                              fontSize: '1.15rem',
                              color: action.accent,
                              background: `${action.accent}1a`,
                              borderColor: `${action.accent}40`,
                            }}
                          >
                            <i className={`ph ${action.icon}`} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                color: 'var(--text-main)',
                              }}
                            >
                              {action.title}
                            </div>
                            <div
                              style={{
                                fontSize: '0.77rem',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {action.subtitle}
                            </div>
                          </div>
                        </div>
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.65rem',
                            padding: '2px 8px',
                            color: isCopied ? '#10b981' : action.accent,
                            background: isCopied ? 'rgba(16,185,129,0.16)' : `${action.accent}1a`,
                            border: `1px solid ${isCopied ? '#10b981' : action.accent}40`,
                            flexShrink: 0,
                          }}
                        >
                          {isCopied ? (
                            <>
                              <Check size={11} />
                              <span>ĐÃ COPY</span>
                            </>
                          ) : (
                            action.badge
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

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
                    const globalIdx = quickActions.length + idx;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <a
                        key={cat.path.join('/')}
                        href={getCategoryHref(cat)}
                        onClick={(e) => {
                          e.preventDefault();
                          activateItem({ kind: 'category', node: cat });
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
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
                  const globalIdx = quickActions.length + categories.length + idx;
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
          <span>↑↓ chọn • Enter mở hoặc Copy kết quả • ESC đóng</span>
          <span>100% xử lý trên trình duyệt</span>
        </div>
      </div>
    </div>
  );
};
