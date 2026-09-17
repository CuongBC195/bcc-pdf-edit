import React, { useState, useEffect } from 'react';
import { Scissors, Check, ZoomIn, ZoomOut, Eye, PlusCircle, RotateCw, X, LayoutGrid, List, Info, Plus } from 'lucide-react';
import type { SplitRule, PDFPageThumbnail } from '../types/pdf';
import { renderPageThumbnail } from '../services/thumbnailService';
import { PageDetailModal } from './PageDetailModal';

interface VisualThumbnailGridProps {
  sourceBuffer: ArrayBuffer;
  totalPageCount: number;
  rules: SplitRule[];
  selectedPages: number[];
  activeRuleId: string | null;
  hoveredRuleId: string | null;
  pageRotations: Record<number, number>;
  onTogglePageSelect: (pageNum: number, isShift: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCreateRuleFromSelected: () => void;
  onSplitAtPage: (pageNum: number) => void;
  onRotatePage: (pageNum: number) => void;
  onRotateAllPages: () => void;
  onResetRotations: () => void;
  onClearActiveRule: () => void;
  initialScrollTop?: number;
  onScrollChange?: (top: number) => void;
}

export const VisualThumbnailGrid: React.FC<VisualThumbnailGridProps> = ({
  sourceBuffer,
  totalPageCount,
  rules,
  selectedPages,
  activeRuleId,
  hoveredRuleId,
  pageRotations,
  onTogglePageSelect,
  onSelectAll,
  onDeselectAll,
  onCreateRuleFromSelected,
  onSplitAtPage,
  onRotatePage,
  onRotateAllPages,
  onResetRotations,
  onClearActiveRule,
  initialScrollTop,
  onScrollChange,
}) => {
  const [thumbnails, setThumbnails] = useState<Record<number, PDFPageThumbnail>>({});
  const [zoomLevel, setZoomLevel] = useState<'sm' | 'md' | 'lg'>('md');
  const [filterMode, setFilterMode] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  // macOS Finder View Mode: Default to 'list' (macOS Finder table view)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  // Track hovered page when mouse moves over a row/card ("trỏ vô file đó")
  const [hoveredPage, setHoveredPage] = useState<number | null>(null);

  // Track focused page for keyboard navigation (Arrow keys) and Spacebar Quick Look
  const [focusedPage, setFocusedPage] = useState<number>(1);

  const gridContainerRef = React.useRef<HTMLDivElement>(null);

  // When a new document is loaded (sourceBuffer changes), always default to Finder list
  useEffect(() => {
    setViewMode('list');
  }, [sourceBuffer]);

  // Quick Look spacebar preview & arrow key navigation like macOS Finder
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      // When modal is NOT open, pressing Space opens Quick Look pop up
      if (previewPage === null) {
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          // Open preview for currently hovered page, focused page, or first selected page, or 1
          const targetPage = hoveredPage || focusedPage || (selectedPages.length > 0 ? selectedPages[0] : 1);
          setPreviewPage(targetPage);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedPage((prev) => {
            const next = Math.min(totalPageCount, prev + 1);
            const row = document.getElementById(`finder-row-${next}`);
            if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return next;
          });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedPage((prev) => {
            const next = Math.max(1, prev - 1);
            const row = document.getElementById(`finder-row-${next}`);
            if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return next;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPage, hoveredPage, focusedPage, selectedPages, totalPageCount]);

  // Restore scroll position when thumbnails start loading
  useEffect(() => {
    if (initialScrollTop && initialScrollTop > 0 && gridContainerRef.current) {
      gridContainerRef.current.scrollTop = initialScrollTop;
    }
  }, [initialScrollTop]);

  const activeRule = rules.find((r) => r.id === activeRuleId) || null;
  const hoveredRule = rules.find((r) => r.id === hoveredRuleId) || null;

  // Map each page number to the rules that contain it
  const pageRuleMap = React.useMemo(() => {
    const map = new Map<number, SplitRule[]>();
    for (let p = 1; p <= totalPageCount; p++) {
      map.set(p, []);
    }
    for (const rule of rules) {
      if (rule.isValid) {
        for (const p of rule.pages) {
          if (p >= 1 && p <= totalPageCount) {
            const list = map.get(p) || [];
            list.push(rule);
            map.set(p, list);
          }
        }
      }
    }
    return map;
  }, [rules, totalPageCount]);

  // Lazy render thumbnails
  useEffect(() => {
    let isCancelled = false;

    const loadThumbnails = async () => {
      // Load thumbnails in small batches to keep UI responsive
      for (let p = 1; p <= totalPageCount; p++) {
        if (isCancelled) break;
        if (!thumbnails[p] || !thumbnails[p].dataUrl) {
          try {
            const targetWidth = viewMode === 'list' ? 70 : (zoomLevel === 'sm' ? 140 : zoomLevel === 'md' ? 200 : 280);
            const res = await renderPageThumbnail(sourceBuffer, p, targetWidth);
            if (!isCancelled) {
              setThumbnails((prev) => ({
                ...prev,
                [p]: {
                  pageNumber: p,
                  dataUrl: res.dataUrl,
                  width: res.width,
                  height: res.height,
                  isLoading: false,
                },
              }));
            }
          } catch (err) {
            console.warn(`Failed to render thumbnail for page ${p}`, err);
          }
        }
      }
    };

    loadThumbnails();
    return () => {
      isCancelled = true;
    };
  }, [sourceBuffer, totalPageCount, zoomLevel, viewMode]);

  const assignedCount = Array.from(pageRuleMap.values()).filter((list) => list.length > 0).length;
  const unassignedCount = totalPageCount - assignedCount;
  const rotatedPagesCount = Object.values(pageRotations).filter((r) => r % 360 !== 0).length;

  const filteredPages = Array.from({ length: totalPageCount }, (_, i) => i + 1).filter((p) => {
    const isAssigned = (pageRuleMap.get(p) || []).length > 0;
    if (filterMode === 'assigned') return isAssigned;
    if (filterMode === 'unassigned') return !isAssigned;
    return true;
  });

  const cardWidth = zoomLevel === 'sm' ? 140 : zoomLevel === 'md' ? 180 : 240;

  return (
    <div className="bento-card" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Active Rule Guidance Banner */}
      {activeRule && (
        <div
          className="animate-fade-in"
          style={{
            padding: '10px 14px',
            marginBottom: '14px',
            borderRadius: 'var(--radius-sm)',
            background: `${activeRule.color}15`,
            border: `1.5px solid ${activeRule.color}55`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: activeRule.color,
                flexShrink: 0,
              }}
            />
            <span>
              Đang chọn File:{' '}
              <strong style={{ color: activeRule.color }}>
                {activeRule.name.split('/').pop() || activeRule.name}
              </strong>{' '}
              ({activeRule.pages.length} trang)
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              — Nhấp vào trang bất kỳ để thêm/bớt
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClearActiveRule}
            style={{ fontSize: '0.75rem', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <X size={13} />
            <span>Bỏ chọn</span>
          </button>
        </div>
      )}

      {/* Visual Workspace Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: '2px', border: '1px solid var(--border-subtle)' }}>
            <button
              className={`btn btn-sm ${filterMode === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              onClick={() => setFilterMode('all')}
            >
              Tất cả ({totalPageCount})
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'assigned' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              onClick={() => setFilterMode('assigned')}
            >
              Đã gán ({assignedCount})
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'unassigned' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              onClick={() => setFilterMode('unassigned')}
            >
              Chưa gán ({unassignedCount})
            </button>
          </div>

          {!activeRule && (
            <>
              <button onClick={onSelectAll} className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }}>
                Chọn hết
              </button>
              {selectedPages.length > 0 && (
                <button onClick={onDeselectAll} className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem', color: 'var(--accent-rose)' }}>
                  Bỏ chọn ({selectedPages.length})
                </button>
              )}
            </>
          )}

          {/* Rotate Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={onRotateAllPages}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Xoay tất cả các trang 90° theo chiều kim đồng hồ"
            >
              <RotateCw size={13} />
              <span>Xoay tất cả 90°</span>
            </button>

            {rotatedPagesCount > 0 && (
              <button
                onClick={onResetRotations}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', padding: '2px 6px' }}
                title="Khôi phục góc xoay ban đầu"
              >
                Đặt lại ({rotatedPagesCount})
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!activeRule && selectedPages.length > 0 && (
            <button
              onClick={onCreateRuleFromSelected}
              className="btn btn-success btn-sm animate-fade-in"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusCircle size={14} />
              <span>Tạo File từ {selectedPages.length} trang đã chọn</span>
            </button>
          )}

          {/* View Mode Switcher (macOS Finder List vs Grid) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: viewMode === 'list' ? 700 : 500,
              }}
              onClick={() => setViewMode('list')}
              title="Chế độ xem danh sách như macOS Finder (Trỏ vô và bấm Space để xem trước pop up)"
            >
              <List size={13} />
              <span>Finder List</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{
                padding: '4px 8px',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: viewMode === 'grid' ? 700 : 500,
              }}
              onClick={() => setViewMode('grid')}
              title="Chế độ xem lưới ô vuông (Grid)"
            >
              <LayoutGrid size={13} />
              <span>Lưới</span>
            </button>
          </div>

          {/* Controls: Zoom (if in Grid view) OR Space shortcut badge (if in List view) */}
          {viewMode === 'grid' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: '2px', border: '1px solid var(--border-subtle)' }}>
              <button
                className={`btn btn-ghost btn-sm ${zoomLevel === 'sm' ? 'btn-secondary' : ''}`}
                style={{ padding: '4px 8px' }}
                onClick={() => setZoomLevel('sm')}
                title="Cỡ nhỏ"
              >
                <ZoomOut size={14} />
              </button>
              <button
                className={`btn btn-ghost btn-sm ${zoomLevel === 'md' ? 'btn-secondary' : ''}`}
                style={{ padding: '4px 8px' }}
                onClick={() => setZoomLevel('md')}
                title="Cỡ vừa"
              >
                M
              </button>
              <button
                className={`btn btn-ghost btn-sm ${zoomLevel === 'lg' ? 'btn-secondary' : ''}`}
                style={{ padding: '4px 8px' }}
                onClick={() => setZoomLevel('lg')}
                title="Cỡ lớn"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const target = focusedPage || (selectedPages.length > 0 ? selectedPages[0] : 1);
                setPreviewPage(target);
              }}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: 'var(--border-active)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
              }}
              title="Nhấn phím Space trên bàn phím để bật/tắt pop up xem trước nhanh như macOS Finder"
            >
              <Eye size={13} />
              <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontFamily: 'inherit' }}>Space</kbd>
              <span>Xem trước</span>
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--bg-card)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <span>
            {activeRule
              ? 'Đang chỉnh sửa file con: Nhấp vào dòng để thêm hoặc bớt trang.'
              : 'Dạng danh sách Finder macOS: Chọn dòng và nhấn phím Space để mở Quick Look pop-up.'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <RotateCw size={12} style={{ color: 'var(--text-dim)' }} />
            <span>Xoay trang</span>
          </div>
          <span style={{ color: 'var(--border-subtle)' }}>•</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <kbd style={{ padding: '1px 4px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>↑</kbd>
            <kbd style={{ padding: '1px 4px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>↓</kbd>
            <span>Di chuyển</span>
          </div>
          <span style={{ color: 'var(--border-subtle)' }}>•</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>Space</kbd>
            <span>Quick Look</span>
          </div>
        </div>
      </div>

      {/* 1. macOS Finder List View Table */}
      {viewMode === 'list' ? (
        <div
          ref={gridContainerRef}
          onScroll={(e) => {
            if (onScrollChange) {
              onScrollChange(e.currentTarget.scrollTop);
            }
          }}
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: '520px',
            maxHeight: 'calc(100vh - 270px)',
            paddingBottom: '24px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-elevated)',
          }}
        >
          {/* Finder Table Sticky Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 65px 65px minmax(160px, 1.5fr) 85px 135px',
              gap: '10px',
              alignItems: 'center',
              padding: '8px 12px',
              background: 'var(--bg-input)',
              borderBottom: '1px solid var(--border-medium)',
              fontSize: '0.74rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              position: 'sticky',
              top: 0,
              zIndex: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={selectedPages.length === totalPageCount && totalPageCount > 0}
                onChange={() => {
                  if (selectedPages.length === totalPageCount) {
                    onDeselectAll();
                  } else {
                    onSelectAll();
                  }
                }}
                title="Chọn tất cả các trang"
                style={{ cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
              />
            </div>
            <div>Trang</div>
            <div>Bản xem</div>
            <div>Phân bổ File con</div>
            <div style={{ textAlign: 'center' }}>Góc xoay</div>
            <div style={{ textAlign: 'right', paddingRight: '6px' }}>Thao tác</div>
          </div>

          {/* Finder Table Rows */}
          {filteredPages.map((pageNum) => {
            const isSelected = selectedPages.includes(pageNum);
            const assignedRules = pageRuleMap.get(pageNum) || [];
            const thumb = thumbnails[pageNum];
            const rotation = pageRotations[pageNum] || 0;
            const isHovered = hoveredPage === pageNum;
            const isFocused = focusedPage === pageNum;

            const primaryRule = assignedRules[0] || null;
            const isInActiveRule = activeRule ? activeRule.pages.includes(pageNum) : false;

            let rowBg = 'transparent';
            if (activeRule && isInActiveRule) {
              rowBg = `${activeRule.color}18`;
            } else if (isSelected) {
              rowBg = 'rgba(2, 132, 199, 0.14)';
            } else if (isHovered) {
              rowBg = 'rgba(2, 132, 199, 0.08)';
            } else if (isFocused) {
              rowBg = 'rgba(255, 255, 255, 0.04)';
            }

            return (
              <div
                key={pageNum}
                id={`finder-row-${pageNum}`}
                onMouseEnter={() => {
                  setHoveredPage(pageNum);
                  setFocusedPage(pageNum);
                }}
                onMouseLeave={() => {
                  setHoveredPage((prev) => (prev === pageNum ? null : prev));
                }}
                onClick={(e) => {
                  setFocusedPage(pageNum);
                  onTogglePageSelect(pageNum, e.shiftKey);
                }}
                onDoubleClick={() => {
                  setFocusedPage(pageNum);
                  setPreviewPage(pageNum);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 65px 65px minmax(160px, 1.5fr) 85px 135px',
                  gap: '10px',
                  alignItems: 'center',
                  padding: '6px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: rowBg,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderLeft: (activeRule && isInActiveRule)
                    ? `4px solid ${activeRule.color}`
                    : isSelected
                    ? '4px solid var(--accent-cyan)'
                    : primaryRule
                    ? `4px solid ${primaryRule.color}`
                    : isHovered
                    ? '4px solid var(--accent-cyan)'
                    : isFocused
                    ? '4px solid var(--border-active)'
                    : '4px solid transparent',
                }}
                className="finder-list-row"
                title={`Trang #${pageNum} — Trỏ chuột & phím Space để xem trước pop up, nhấp đúp để mở`}
              >
                {/* 1. Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={activeRule ? isInActiveRule : isSelected}
                    onChange={() => {}}
                    style={{
                      cursor: 'pointer',
                      width: '15px',
                      height: '15px',
                      accentColor: activeRule ? activeRule.color : 'var(--accent-cyan)',
                    }}
                  />
                </div>

                {/* 2. Page Number */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-main)', fontFamily: 'monospace' }}>
                  <span>#{pageNum < 10 ? `0${pageNum}` : pageNum}</span>
                </div>

                {/* 3. Micro Thumbnail Preview */}
                <div
                  style={{
                    width: '36px',
                    height: '46px',
                    background: '#ffffff',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
                    border: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                  }}
                >
                  {thumb?.dataUrl ? (
                    <img
                      src={thumb.dataUrl}
                      alt={`Trang ${pageNum}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transform: `rotate(${rotation}deg)`,
                      }}
                    />
                  ) : (
                    <div style={{ width: '12px', height: '12px', border: '1.5px solid var(--accent-cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  )}
                </div>

                {/* 4. Child Rule Assignment Status - Always preserves existing file colors */}
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                  {activeRule ? (
                    isInActiveRule ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          className="badge"
                          style={{
                            background: `${activeRule.color}25`,
                            color: activeRule.color,
                            border: `1.5px solid ${activeRule.color}`,
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            boxShadow: `0 0 8px ${activeRule.color}35`,
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                          <span>Thuộc file này (Bấm bỏ)</span>
                        </span>
                        {assignedRules
                          .filter((r) => r.id !== activeRule.id)
                          .map((rule) => {
                            const rIdx = rules.findIndex((r) => r.id === rule.id);
                            return (
                              <span
                                key={rule.id}
                                className="badge"
                                style={{
                                  background: `${rule.color}15`,
                                  color: rule.color,
                                  border: `1px solid ${rule.color}45`,
                                  fontSize: '0.72rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                                <span>File {rIdx + 1}: {rule.name.split('/').pop()}</span>
                              </span>
                            );
                          })}
                      </div>
                    ) : assignedRules.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {assignedRules.map((rule) => {
                          const rIdx = rules.findIndex((r) => r.id === rule.id);
                          return (
                            <span
                              key={rule.id}
                              className="badge"
                              style={{
                                background: `${rule.color}20`,
                                color: rule.color,
                                border: `1.5px solid ${rule.color}65`,
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                              <span>File {rIdx + 1}: {rule.name.split('/').pop()}</span>
                            </span>
                          );
                        })}
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'var(--bg-surface)',
                            border: '1px dashed var(--border-medium)',
                          }}
                        >
                          <Plus size={11} style={{ color: activeRule.color }} />
                          <span>(Thêm vào file này)</span>
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Plus size={11} style={{ color: activeRule.color }} />
                        <span>Chưa gán • Bấm để thêm vào file này</span>
                      </span>
                    )
                  ) : assignedRules.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {assignedRules.map((rule) => {
                        const rIdx = rules.findIndex((r) => r.id === rule.id);
                        return (
                          <span
                            key={rule.id}
                            className="badge"
                            style={{
                              background: `${rule.color}20`,
                              color: rule.color,
                              border: `1.5px solid ${rule.color}55`,
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                            <span>File {rIdx + 1}: {rule.name.split('/').pop()}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                      Chưa gán file con
                    </span>
                  )}
                </div>

                {/* 5. Rotation */}
                <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.74rem', color: rotation > 0 ? 'var(--accent-amber)' : 'var(--text-muted)', fontWeight: rotation > 0 ? 700 : 400 }}>
                    {rotation}°
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRotatePage(pageNum);
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}
                    title="Xoay trang này 90°"
                  >
                    <RotateCw size={12} />
                  </button>
                </div>

                {/* 6. Action Tools (Space Preview + Split Here) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedPage(pageNum);
                      setPreviewPage(pageNum);
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: isHovered ? 'var(--accent-cyan)' : 'var(--border-active)',
                      border: isHovered ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-card)',
                      transition: 'all 0.15s ease',
                    }}
                    title="Xem trước pop up (Phím Space hoặc Nhấp đúp)"
                  >
                    <Eye size={12} />
                    <span>Xem [Space]</span>
                  </button>

                  {!activeRule && pageNum < totalPageCount && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplitAtPage(pageNum);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{
                        padding: '2px 7px',
                        fontSize: '0.7rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        color: 'var(--border-active)',
                        whiteSpace: 'nowrap',
                      }}
                      title={`Cắt tách file con mới sau trang #${pageNum}`}
                    >
                      <Scissors size={11} />
                      <span>Cắt</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 2. Visual Thumbnail Grid Container */
        <div
          ref={gridContainerRef}
          onScroll={(e) => {
            if (onScrollChange) {
              onScrollChange(e.currentTarget.scrollTop);
            }
          }}
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: '520px',
            maxHeight: 'calc(100vh - 270px)',
            paddingRight: '6px',
            paddingBottom: '24px',
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            gap: '16px',
          }}
        >
          {filteredPages.map((pageNum) => {
            const isSelected = selectedPages.includes(pageNum);
            const assignedRules = pageRuleMap.get(pageNum) || [];
            const primaryRule = assignedRules[0];
            const primaryRuleIdx = primaryRule ? rules.findIndex((r) => r.id === primaryRule.id) : -1;
            const thumb = thumbnails[pageNum];
            const rotation = pageRotations[pageNum] || 0;
            const isHovered = hoveredRule ? hoveredRule.pages.includes(pageNum) : false;
            const isFocused = focusedPage === pageNum;

            // Two-way active rule binding check
            const isInActiveRule = activeRule ? activeRule.pages.includes(pageNum) : false;

            // Compute dynamic card border and shadow - Always preserves primary rule color!
            let cardBorder = '1px solid var(--border-subtle)';
            let cardShadow = 'none';
            let cardOpacity = 1;

            if (activeRule) {
              if (isInActiveRule) {
                cardBorder = `2.5px solid ${activeRule.color}`;
                cardShadow = `0 0 16px ${activeRule.color}55`;
                cardOpacity = 1;
              } else if (primaryRule) {
                // Preserve colors of File 1, File 2 when File 3 is active!
                cardBorder = `2px solid ${primaryRule.color}bb`;
                cardShadow = `0 0 10px ${primaryRule.color}30`;
                cardOpacity = 0.95;
              } else {
                cardBorder = '1px solid var(--border-medium)';
                cardShadow = 'none';
                cardOpacity = 0.82;
              }
            } else if (isSelected) {
              cardBorder = '2px solid var(--accent-cyan)';
              cardShadow = '0 0 12px rgba(6, 182, 212, 0.4)';
            } else if (isHovered && hoveredRule) {
              cardBorder = `2px solid ${hoveredRule.color}`;
              cardShadow = `0 0 14px ${hoveredRule.color}55`;
            } else if (primaryRule) {
              cardBorder = `2px solid ${primaryRule.color}`;
              cardShadow = `0 0 8px ${primaryRule.color}33`;
            } else if (isFocused) {
              cardBorder = '2px solid var(--border-active)';
              cardShadow = '0 0 8px rgba(2, 132, 199, 0.3)';
            }

            return (
              <div
                key={pageNum}
                id={`grid-card-${pageNum}`}
                onMouseEnter={() => {
                  setHoveredPage(pageNum);
                  setFocusedPage(pageNum);
                }}
                onMouseLeave={() => {
                  setHoveredPage((prev) => (prev === pageNum ? null : prev));
                }}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface-elevated)',
                  border: cardBorder,
                  boxShadow: cardShadow,
                  opacity: cardOpacity,
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  userSelect: 'none',
                  overflow: 'hidden',
                }}
                onClick={(e) => {
                  setFocusedPage(pageNum);
                  onTogglePageSelect(pageNum, e.shiftKey);
                }}
                onDoubleClick={() => {
                  setFocusedPage(pageNum);
                  setPreviewPage(pageNum);
                }}
                title={`Trang #${pageNum} — Trỏ chuột & phím Space để xem trước pop up, nhấp đúp để mở`}
              >
                {/* Page Number, Rotate & Action Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    #{pageNum}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* Active rule checkmark */}
                    {activeRule && isInActiveRule && (
                      <span
                        style={{
                          background: activeRule.color,
                          color: '#ffffff',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Thuộc file đang chọn"
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}

                    {/* Normal multi-select checkmark */}
                    {!activeRule && isSelected && (
                      <span
                        style={{
                          background: 'var(--accent-cyan)',
                          color: '#000',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}

                    {/* Primary Rule Tag - Always shown even when another file is active */}
                    {primaryRule && !isInActiveRule && (
                      <span
                        style={{
                          background: primaryRule.color,
                          color: '#fff',
                          borderRadius: 'var(--radius-full)',
                          padding: '1px 6px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          maxWidth: '90px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          boxShadow: `0 1px 4px ${primaryRule.color}40`,
                        }}
                        title={`Trang này thuộc File ${primaryRuleIdx + 1}: ${primaryRule.name}`}
                      >
                        File {primaryRuleIdx + 1}
                      </span>
                    )}

                    {/* Quick Preview Eye Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusedPage(pageNum);
                        setPreviewPage(pageNum);
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 5px', color: 'var(--border-active)' }}
                      title="Xem trước pop up (Phím Space hoặc Nhấp đúp)"
                    >
                      <Eye size={12} />
                    </button>

                    {/* Rotate Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRotatePage(pageNum);
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{
                        padding: '2px 5px',
                        color: rotation > 0 ? 'var(--accent-amber)' : 'var(--text-muted)',
                      }}
                      title={`Xoay trang 90° (Hiện tại: ${rotation}°)`}
                    >
                      <RotateCw size={12} />
                    </button>
                  </div>
                </div>

                {/* Thumbnail Preview Area */}
                <div
                  style={{
                    height: zoomLevel === 'sm' ? '180px' : zoomLevel === 'md' ? '240px' : '320px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-input)',
                    borderTop: '1px solid var(--border-subtle)',
                    padding: '8px',
                    overflow: 'hidden',
                  }}
                >
                  {thumb?.dataUrl ? (
                    <img
                      src={thumb.dataUrl}
                      alt={`Trang ${pageNum}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                        transform: `rotate(${rotation}deg)`,
                        transition: 'transform 0.25s ease',
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: 'var(--text-dim)' }}>
                      <div style={{ width: '20px', height: '20px', border: '2px solid var(--accent-cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span style={{ fontSize: '0.72rem' }}>Đang tải...</span>
                    </div>
                  )}
                </div>

                {/* Card Footer with Page Status & Direct Cut Button */}
                <div
                  style={{
                    padding: '6px 8px',
                    background: 'var(--bg-surface)',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeRule ? (
                      isInActiveRule ? (
                        <span style={{ color: activeRule.color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                          <span>Thuộc file này (bấm bỏ)</span>
                        </span>
                      ) : primaryRule ? (
                        <span style={{ color: primaryRule.color, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                          <span>File {primaryRuleIdx + 1} (+ Thêm)</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Plus size={11} style={{ color: activeRule.color }} />
                          <span>Bấm thêm vào file</span>
                        </span>
                      )
                    ) : assignedRules.length > 0 ? (
                      <span style={{ color: primaryRule.color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                        <span>File {primaryRuleIdx + 1}: {primaryRule.name.split('/').pop()}</span>
                      </span>
                    ) : (
                      <span>Chưa gán</span>
                    )}
                  </div>

                  {!activeRule && pageNum < totalPageCount && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'var(--border-active)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-card)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplitAtPage(pageNum);
                      }}
                      title={`Cắt tách thành file con mới sau trang #${pageNum}`}
                    >
                      <Scissors size={12} />
                      <span>Cắt tại đây</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* High-Resolution Large Page Preview Modal with Zoom and Navigation */}
      {previewPage !== null && (
        <PageDetailModal
          isOpen={previewPage !== null}
          sourceBuffer={sourceBuffer}
          pageNumber={previewPage}
          totalPageCount={totalPageCount}
          pageRotations={pageRotations}
          initialThumbnailUrl={thumbnails[previewPage]?.dataUrl}
          onRotatePage={onRotatePage}
          onNavigatePage={(newPage) => {
            setFocusedPage(newPage);
            setPreviewPage(newPage);
          }}
          onClose={() => setPreviewPage(null)}
        />
      )}
    </div>
  );
};
