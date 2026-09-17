import React, { useState, useEffect } from 'react';
import { Scissors, Eye, RotateCw, X, Plus } from 'lucide-react';
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
  onSelectRule?: (ruleId: string) => void;
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
  onSelectRule,
}) => {
  const [thumbnails, setThumbnails] = useState<Record<number, PDFPageThumbnail>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  // Track hovered page when mouse moves over a row/card ("trỏ vô file đó")
  const [hoveredPage, setHoveredPage] = useState<number | null>(null);

  // Track focused page for keyboard navigation (Arrow keys) and Spacebar Quick Look
  const [focusedPage, setFocusedPage] = useState<number>(1);

  const gridContainerRef = React.useRef<HTMLDivElement>(null);

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
            const targetWidth = 80;
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
  }, [sourceBuffer, totalPageCount]);

  const assignedCount = Array.from(pageRuleMap.values()).filter((list) => list.length > 0).length;
  const unassignedCount = totalPageCount - assignedCount;
  const rotatedPagesCount = Object.values(pageRotations).filter((r) => r % 360 !== 0).length;

  // Header checkbox state logic:
  // When activeRule is set: check if all or some pages are in this active rule
  // When no activeRule: check if all or some pages have been chosen ("đã chọn vô" / assigned or selected)
  const chosenCount = activeRule
    ? activeRule.pages.length
    : Array.from({ length: totalPageCount }, (_, i) => i + 1).filter(
        (p) => (pageRuleMap.get(p) || []).length > 0 || selectedPages.includes(p)
      ).length;

  const isHeaderChecked = totalPageCount > 0 && chosenCount === totalPageCount;
  const isHeaderIndeterminate = chosenCount > 0 && chosenCount < totalPageCount;

  const filteredPages = Array.from({ length: totalPageCount }, (_, i) => i + 1).filter((p) => {
    const isAssigned = (pageRuleMap.get(p) || []).length > 0;
    if (filterMode === 'assigned') return isAssigned;
    if (filterMode === 'unassigned') return !isAssigned;
    return true;
  });

  return (
    <div
      className="bento-card"
      style={{
        padding: '20px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxSizing: 'border-box',
      }}
    >
      {/* Active Rule Guidance Banner */}
      {activeRule && (
        <div
          className="animate-fade-in"
          style={{
            flexShrink: 0,
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
          flexShrink: 0,
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
          {selectedPages.length > 0 && (
            <button
              onClick={onCreateRuleFromSelected}
              className="btn btn-primary btn-sm animate-fade-in"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
                boxShadow: '0 0 14px rgba(6, 182, 212, 0.4)',
              }}
              title="Cắt tách các trang đang chọn thành một file con mới"
            >
              <Scissors size={14} />
              <span>Cắt {selectedPages.length} trang đã chọn thành File con</span>
            </button>
          )}
        </div>
      </div>

      {/* macOS Finder List View Table */}
      <div
          ref={gridContainerRef}
          onScroll={(e) => {
            if (onScrollChange) {
              onScrollChange(e.currentTarget.scrollTop);
            }
          }}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            paddingBottom: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-elevated)',
          }}
        >
          {/* Finder Table Sticky Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 55px 50px minmax(180px, 1fr) 70px 75px',
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
                ref={(el) => {
                  if (el) el.indeterminate = isHeaderIndeterminate;
                }}
                checked={isHeaderChecked}
                onChange={() => {
                  if (isHeaderChecked) {
                    onDeselectAll();
                  } else {
                    onSelectAll();
                  }
                }}
                title={
                  isHeaderChecked
                    ? 'Tất cả các trang đã được phân bổ/chọn. Bấm để bỏ chọn.'
                    : 'Bấm để chọn tất cả các trang'
                }
                style={{
                  cursor: 'pointer',
                  accentColor: activeRule ? activeRule.color : 'var(--accent-cyan)',
                  width: '15px',
                  height: '15px',
                }}
              />
            </div>
            <div>Trang</div>
            <div>Bản xem</div>
            <div>Phân bổ File con</div>
            <div style={{ textAlign: 'center' }}>Góc xoay</div>
            <div style={{ textAlign: 'center' }}>Thao tác</div>
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
            const isAssigned = assignedRules.length > 0;

            // Accurate, logical checkbox state:
            // - If activeRule is open: checked if page belongs to that active rule
            // - If no activeRule: checked if page is already assigned to a file ("đã chọn vô"), or is manually selected
            const isPageChecked = activeRule ? isInActiveRule : (isAssigned || isSelected);
            const checkboxColor = activeRule
              ? activeRule.color
              : primaryRule
              ? primaryRule.color
              : 'var(--accent-cyan)';

            let rowBg = 'transparent';
            if (activeRule && isInActiveRule) {
              rowBg = `${activeRule.color}18`;
            } else if (hoveredRule && hoveredRule.pages.includes(pageNum)) {
              rowBg = `${hoveredRule.color}20`;
            } else if (isSelected) {
              rowBg = 'rgba(2, 132, 199, 0.14)';
            } else if (isHovered) {
              rowBg = 'rgba(2, 132, 199, 0.08)';
            } else if (isFocused) {
              rowBg = 'rgba(255, 255, 255, 0.04)';
            }

            return (
              <React.Fragment key={pageNum}>
                <div
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
                    gridTemplateColumns: '36px 55px 50px minmax(180px, 1fr) 70px 75px',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '6px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                  background: rowBg,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderLeft: (activeRule && isInActiveRule)
                    ? `4px solid ${activeRule.color}`
                    : (hoveredRule && hoveredRule.pages.includes(pageNum))
                    ? `4px solid ${hoveredRule.color}`
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
                    checked={isPageChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      onTogglePageSelect(pageNum, false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      cursor: 'pointer',
                      width: '15px',
                      height: '15px',
                      accentColor: checkboxColor,
                    }}
                    title={
                      activeRule
                        ? isInActiveRule
                          ? 'Bấm để bỏ trang này khỏi file đang chọn'
                          : 'Bấm để thêm trang này vào file đang chọn'
                        : isAssigned
                        ? `Đã phân bổ vào File ${rules.findIndex((r) => r.id === primaryRule?.id) + 1} (${primaryRule?.name}). Bấm để bỏ chọn.`
                        : isSelected
                        ? 'Đang chọn trang này. Bấm để bỏ chọn.'
                        : 'Bấm để chọn trang này'
                    }
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
                          <button
                            type="button"
                            key={rule.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectRule) onSelectRule(rule.id);
                            }}
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
                              cursor: 'pointer',
                            }}
                            title={`Bấm để chọn và chỉnh sửa File ${rIdx + 1}: ${rule.name}`}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                            <span>File {rIdx + 1}: {rule.name.split('/').pop()}</span>
                          </button>
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

                {/* 6. Action Tools (Icon-only: Quick Look + Cut Here) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedPage(pageNum);
                      setPreviewPage(pageNum);
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{
                      width: '28px',
                      height: '26px',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isHovered ? 'var(--accent-cyan)' : 'var(--text-dim)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-card)',
                      transition: 'all 0.15s ease',
                    }}
                    title="Xem trước pop-up [Phím Space hoặc Nhấp đúp]"
                  >
                    <Eye size={13} />
                  </button>

                  {pageNum < totalPageCount ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplitAtPage(pageNum);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{
                        width: '28px',
                        height: '26px',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-cyan)',
                        border: '1px solid rgba(6, 182, 212, 0.45)',
                        background: isHovered ? 'rgba(6, 182, 212, 0.2)' : 'rgba(6, 182, 212, 0.09)',
                        borderRadius: 'var(--radius-sm)',
                        boxShadow: isHovered ? '0 0 10px rgba(6, 182, 212, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                      title={`Cắt tách thành file con mới sau trang #${pageNum}`}
                    >
                      <Scissors size={13} />
                    </button>
                  ) : (
                    <div style={{ width: '28px' }} />
                  )}
                </div>
              </div>

              {/* Interactive Cut Separator Line between rows */}
              {pageNum < totalPageCount && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onSplitAtPage(pageNum);
                  }}
                  className="split-cut-divider"
                  style={{
                    height: '8px',
                    margin: '-4px 0',
                    position: 'relative',
                    zIndex: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'all 0.18s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.height = '18px';
                    e.currentTarget.style.margin = '1px 0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0';
                    e.currentTarget.style.height = '8px';
                    e.currentTarget.style.margin = '-4px 0';
                  }}
                  title={`Bấm để cắt file con mới giữa trang #${pageNum} và #${pageNum + 1}`}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '20px',
                      right: '20px',
                      height: '1px',
                      background: 'var(--accent-cyan)',
                      borderTop: '1px dashed var(--accent-cyan)',
                      boxShadow: '0 0 6px rgba(6, 182, 212, 0.6)',
                    }}
                  />
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 9,
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--accent-cyan)',
                      borderRadius: '12px',
                      padding: '1px 9px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--accent-cyan)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 2px 8px rgba(6, 182, 212, 0.35)',
                    }}
                  >
                    <Scissors size={11} />
                    <span>Cắt giữa trang #{pageNum} & #{pageNum + 1}</span>
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
        </div>

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
