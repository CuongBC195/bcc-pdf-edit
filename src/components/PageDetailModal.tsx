import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Loader2,
  Eye,
  Info,
  Trash2,
} from 'lucide-react';
import { getPdfDocumentProxy } from '../services/thumbnailService';

interface PageDetailModalProps {
  isOpen: boolean;
  sourceBuffer: ArrayBuffer;
  pageNumber: number;
  totalPageCount: number;
  pageRotations: Record<number, number>;
  initialThumbnailUrl?: string;
  onRotatePage: (pageNum: number) => void;
  onDeletePage?: (pageNum: number) => void;
  onNavigatePage: (pageNum: number) => void;
  onClose: () => void;
}

export const PageDetailModal: React.FC<PageDetailModalProps> = ({
  isOpen,
  sourceBuffer,
  pageNumber,
  totalPageCount,
  pageRotations,
  initialThumbnailUrl,
  onRotatePage,
  onDeletePage,
  onNavigatePage,
  onClose,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [fitModeState, setFitModeState] = useState<{
    pageNumber: number;
    mode: 'fit-page' | 'fit-width' | 'custom';
  }>({ pageNumber, mode: 'fit-page' });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [renderedPage, setRenderedPage] = useState<{
    pageNumber: number;
    dataUrl: string;
    baseWidth: number;
    baseHeight: number;
  } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 900, height: 700 });
  const [isPanning, setIsPanning] = useState<boolean>(false);

  const fitMode = fitModeState.pageNumber === pageNumber ? fitModeState.mode : 'fit-page';
  const setFitMode = useCallback(
    (mode: 'fit-page' | 'fit-width' | 'custom') => {
      setFitModeState({ pageNumber, mode });
    },
    [pageNumber]
  );

  const pageImageUrl = renderedPage?.pageNumber === pageNumber ? renderedPage.dataUrl : null;
  const baseWidth = renderedPage?.pageNumber === pageNumber ? renderedPage.baseWidth : 0;
  const baseHeight = renderedPage?.pageNumber === pageNumber ? renderedPage.baseHeight : 0;

  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const effectiveScaleRef = useRef<number>(1.0);
  const renderedPageNumRef = useRef<number | null>(null);
  const pendingZoomFocalRef = useRef<{
    clientX: number;
    clientY: number;
    prevScale: number;
    nextScale: number;
  } | null>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const currentRotation = pageRotations[pageNumber] || 0;

  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 5.0;

  // Measure viewport container size
  const updateContainerSize = useCallback(() => {
    const el = viewportContainerRef.current;
    if (!el) return;
    const measuredWidth = el.clientWidth || window.innerWidth * 0.85;
    const measuredHeight = el.clientHeight || window.innerHeight * 0.75;
    setContainerSize({
      width: Math.max(300, measuredWidth - 48),
      height: Math.max(300, measuredHeight - 48),
    });
  }, []);

  // Compute effective scale from fitMode or custom zoomScale
  const effectiveScale = React.useMemo(() => {
    if (!baseWidth || !baseHeight) return zoomScale;
    if (fitMode === 'fit-width') {
      return Math.max(MIN_ZOOM, containerSize.width / baseWidth);
    }
    if (fitMode === 'fit-page') {
      const scaleW = containerSize.width / baseWidth;
      const scaleH = containerSize.height / baseHeight;
      return Math.max(MIN_ZOOM, Math.min(scaleW, scaleH));
    }
    return zoomScale;
  }, [baseWidth, baseHeight, containerSize, fitMode, zoomScale]);

  useEffect(() => {
    effectiveScaleRef.current = effectiveScale;
  }, [effectiveScale]);

  const displayDimensions = React.useMemo(() => {
    if (!baseWidth || !baseHeight) return null;
    return {
      width: Math.round(baseWidth * effectiveScale),
      height: Math.round(baseHeight * effectiveScale),
    };
  }, [baseWidth, baseHeight, effectiveScale]);

  // Apply cursor-centered scroll adjustment right after zoom dimensions update
  useEffect(() => {
    const focal = pendingZoomFocalRef.current;
    const el = viewportContainerRef.current;
    if (!focal || !el || !displayDimensions) return;
    pendingZoomFocalRef.current = null;

    const rect = el.getBoundingClientRect();
    const offsetX = focal.clientX - rect.left;
    const offsetY = focal.clientY - rect.top;
    const ratio = focal.nextScale / (focal.prevScale || 1);

    el.scrollLeft = Math.max(0, (el.scrollLeft + offsetX) * ratio - offsetX);
    el.scrollTop = Math.max(0, (el.scrollTop + offsetY) * ratio - offsetY);
  }, [displayDimensions]);

  const applyZoom = useCallback((nextScaleRaw: number, focalPoint?: { clientX: number; clientY: number }) => {
    const prevScale = effectiveScaleRef.current;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +nextScaleRaw.toFixed(2)));
    if (focalPoint) {
      pendingZoomFocalRef.current = {
        clientX: focalPoint.clientX,
        clientY: focalPoint.clientY,
        prevScale,
        nextScale: clamped,
      };
    }
    effectiveScaleRef.current = clamped;
    setFitMode('custom');
    setZoomScale(clamped);
  }, [setFitMode]);

  // Render high-resolution page
  const renderPage = useCallback(async (targetScale: number, showSpinner: boolean) => {
    if (!isOpen || !viewportContainerRef.current) return;

    try {
      if (showSpinner) {
        setIsLoading(true);
      }

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel error
        }
        renderTaskRef.current = null;
      }

      const pdf = await getPdfDocumentProxy(sourceBuffer);
      const page = await pdf.getPage(pageNumber);

      const unscaledViewport = page.getViewport({ scale: 1 });

      const el = viewportContainerRef.current;
      const measuredWidth = el?.clientWidth || window.innerWidth * 0.85;
      const measuredHeight = el?.clientHeight || window.innerHeight * 0.75;
      const cWidth = Math.max(300, measuredWidth - 48);
      const cHeight = Math.max(300, measuredHeight - 48);

      let resolvedScale = targetScale;
      if (fitMode === 'fit-width') {
        resolvedScale = Math.max(MIN_ZOOM, cWidth / unscaledViewport.width);
      } else if (fitMode === 'fit-page') {
        const scaleW = cWidth / unscaledViewport.width;
        const scaleH = cHeight / unscaledViewport.height;
        resolvedScale = Math.max(MIN_ZOOM, Math.min(scaleW, scaleH));
      }

      const pixelRatio = window.devicePixelRatio || 1;
      // Cap max canvas side at 4096px so ultra-high zoom stays fast and crisp without exceeding browser canvas limits
      const maxLongestSide = 4096;
      const maxAllowedScale =
        maxLongestSide / Math.max(unscaledViewport.width, unscaledViewport.height);
      const renderScale = Math.min(maxAllowedScale, resolvedScale * Math.max(pixelRatio, 2));
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({
        canvasContext: context,
        viewport,
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      let dataUrl = canvas.toDataURL('image/webp', 0.95);
      if (!dataUrl || dataUrl.length < 50) {
        dataUrl = canvas.toDataURL('image/png');
      }

      renderedPageNumRef.current = pageNumber;
      setRenderedPage({
        pageNumber,
        dataUrl,
        baseWidth: unscaledViewport.width,
        baseHeight: unscaledViewport.height,
      });
      setIsLoading(false);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('Error rendering high-res page:', err);
        setIsLoading(false);
      }
    }
  }, [isOpen, sourceBuffer, pageNumber, fitMode]);

  // Measure container when modal opens or fullscreen toggles
  useEffect(() => {
    if (!isOpen) return;
    updateContainerSize();
  }, [isOpen, isFullscreen, updateContainerSize]);

  // Initial render on page open / fitMode change, and debounced sharp re-render when zooming
  useEffect(() => {
    if (!isOpen) return;
    const isInitialPageLoad = renderedPageNumRef.current !== pageNumber;
    const delayMs = isInitialPageLoad ? 0 : 140;

    const timer = window.setTimeout(() => {
      renderPage(effectiveScale, isInitialPageLoad);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [isOpen, pageNumber, effectiveScale, fitMode, renderPage]);

  // Window resize handler
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      updateContainerSize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, updateContainerSize]);

  // Mouse wheel to zoom in / out smoothly inside the stage area
  useEffect(() => {
    if (!isOpen) return;
    const el = viewportContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const current = effectiveScaleRef.current;
      // Support both trackpad pinch (ctrlKey) and normal mouse wheel scrolling
      const rawDelta = -e.deltaY;
      if (rawDelta === 0) return;

      const factor = e.ctrlKey
        ? Math.exp(rawDelta * 0.01)
        : rawDelta > 0
        ? 1.15
        : 1 / 1.15;

      const nextScale = current * factor;
      applyZoom(nextScale, { clientX: e.clientX, clientY: e.clientY });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isOpen, applyZoom]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        if (pageNumber > 1) onNavigatePage(pageNumber - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        if (pageNumber < totalPageCount) onNavigatePage(pageNumber + 1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyZoom(effectiveScaleRef.current + 0.25);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyZoom(effectiveScaleRef.current - 0.25);
      } else if (e.key === '0') {
        e.preventDefault();
        setFitMode('fit-page');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onRotatePage(pageNumber);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && onDeletePage) {
        e.preventDefault();
        onDeletePage(pageNumber);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pageNumber, totalPageCount, onClose, onNavigatePage, onRotatePage, onDeletePage, applyZoom, setFitMode]);

  if (!isOpen) return null;

  const handleZoomIn = () => {
    applyZoom(effectiveScaleRef.current + 0.25);
  };

  const handleZoomOut = () => {
    applyZoom(effectiveScaleRef.current - 0.25);
  };

  const popupJSX = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isFullscreen ? '0' : '24px',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={onClose}
    >
      {/* Floating Modal Dialog Card */}
      <div
        className="bento-card animate-popup-scale"
        style={{
          width: isFullscreen ? '100vw' : '92vw',
          maxWidth: isFullscreen ? '100vw' : '1080px',
          height: isFullscreen ? '100vh' : '88vh',
          borderRadius: isFullscreen ? '0' : '20px',
          background: 'var(--bg-surface)',
          border: isFullscreen ? 'none' : '1px solid var(--border-medium)',
          boxShadow: isFullscreen
            ? 'none'
            : '0 25px 70px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
          transition: 'all 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '10px',
            zIndex: 10,
          }}
        >
          {/* Left: Title & Page Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(2, 132, 199, 0.12)',
                border: '1px solid rgba(2, 132, 199, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--border-active)',
              }}
            >
              <Eye size={18} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Xem chi tiết
              </h3>
              <span className="badge badge-cyan" style={{ fontSize: '0.76rem', padding: '2px 8px' }}>
                Trang {pageNumber} / {totalPageCount}
              </span>
            </div>

            {/* Stepper Buttons */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                background: 'var(--bg-surface)',
                padding: '2px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                marginLeft: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => onNavigatePage(pageNumber - 1)}
                disabled={pageNumber <= 1}
                className="btn btn-ghost btn-sm"
                title="Trang trước (Phím ◀)"
                style={{ padding: '3px 8px', fontSize: '0.76rem' }}
              >
                <ChevronLeft size={15} />
                <span>Trước</span>
              </button>
              <span style={{ color: 'var(--border-subtle)', fontSize: '0.75rem' }}>|</span>
              <button
                type="button"
                onClick={() => onNavigatePage(pageNumber + 1)}
                disabled={pageNumber >= totalPageCount}
                className="btn btn-ghost btn-sm"
                title="Trang sau (Phím ▶ hoặc Space)"
                style={{ padding: '3px 8px', fontSize: '0.76rem' }}
              >
                <span>Sau</span>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Center: Zoom Controls & Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Zoom In/Out Stepper */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                background: 'var(--bg-surface)',
                padding: '2px 4px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={handleZoomOut}
                className="btn btn-ghost btn-sm"
                title="Thu nhỏ (-)"
                style={{ padding: '4px 6px' }}
              >
                <ZoomOut size={15} />
              </button>
              <span
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  color: 'var(--border-active)',
                  minWidth: '58px',
                  textAlign: 'center',
                  padding: '0 4px',
                }}
                title="Cuộn con lăn chuột trên trang để phóng to / thu nhỏ"
              >
                {`${Math.round(effectiveScale * 100)}%`}
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                className="btn btn-ghost btn-sm"
                title="Phóng to (+ hoặc cuộn chuột lên)"
                style={{ padding: '4px 6px' }}
              >
                <ZoomIn size={15} />
              </button>
            </div>

            {/* Fit Presets */}
            <button
              type="button"
              onClick={() => setFitMode('fit-page')}
              className={`btn btn-sm ${fitMode === 'fit-page' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.76rem', padding: '4px 10px' }}
            >
              Vừa trang
            </button>
            <button
              type="button"
              onClick={() => setFitMode('fit-width')}
              className={`btn btn-sm ${fitMode === 'fit-width' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.76rem', padding: '4px 10px' }}
            >
              Vừa ngang
            </button>

            {/* Rotate Button */}
            <button
              type="button"
              onClick={() => onRotatePage(pageNumber)}
              title="Xoay trang 90° (Phím R)"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', padding: '4px 10px' }}
            >
              <RotateCw size={13} color="var(--border-active)" />
              <span>Xoay 90° ({currentRotation}°)</span>
            </button>

            {/* Delete Page Button */}
            {onDeletePage && (
              <button
                type="button"
                onClick={() => onDeletePage(pageNumber)}
                title="Xóa bỏ trang này khỏi danh sách (Phím Delete)"
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '0.76rem',
                  padding: '4px 10px',
                  color: 'var(--accent-rose)',
                  borderColor: 'rgba(244, 63, 94, 0.35)',
                  background: 'rgba(244, 63, 94, 0.08)',
                }}
              >
                <Trash2 size={13} />
                <span>Xóa trang này</span>
              </button>
            )}
          </div>

          {/* Right: Fullscreen & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? 'Thu nhỏ popup' : 'Toàn màn hình (F)'}
              className="btn btn-ghost btn-sm"
              style={{ padding: '5px 8px' }}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Đóng popup (Phím ESC)"
              className="btn btn-ghost btn-sm"
              style={{
                color: 'var(--accent-rose)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                fontWeight: 600,
                fontSize: '0.78rem',
              }}
            >
              <X size={15} />
              <span>Đóng [ESC]</span>
            </button>
          </div>
        </div>

        {/* 2. Document Canvas Stage Area */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            background: 'var(--bg-card)',
          }}
        >
          {/* Floating Prev Button (Left) */}
          {pageNumber > 1 && (
            <button
              type="button"
              onClick={() => onNavigatePage(pageNumber - 1)}
              className="btn btn-secondary btn-sm"
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 20,
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                background: 'var(--bg-surface)',
              }}
              title="Trang trước (Phím ◀)"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Floating Next Button (Right) */}
          {pageNumber < totalPageCount && (
            <button
              type="button"
              onClick={() => onNavigatePage(pageNumber + 1)}
              className="btn btn-secondary btn-sm"
              style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 20,
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                background: 'var(--bg-surface)',
              }}
              title="Trang sau (Phím ▶)"
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* Loading Indicator Overlay */}
          {isLoading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(3px)',
                zIndex: 15,
                gap: '8px',
                pointerEvents: 'none',
              }}
            >
              <Loader2 size={30} className="animate-spin" color="var(--border-active)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Đang kết xuất trang sắc nét...
              </span>
            </div>
          )}

          {/* Scrollable & Zoomable Viewport */}
          <div
            ref={viewportContainerRef}
            onMouseDown={(e) => {
              if (e.button !== 0 || !viewportContainerRef.current) return;
              const el = viewportContainerRef.current;
              if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return;
              e.preventDefault();
              setIsPanning(true);
              panStateRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                scrollLeft: el.scrollLeft,
                scrollTop: el.scrollTop,
              };
            }}
            onMouseMove={(e) => {
              const pan = panStateRef.current;
              const el = viewportContainerRef.current;
              if (!pan || !el) return;
              el.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
              el.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
            }}
            onMouseUp={() => {
              panStateRef.current = null;
              setIsPanning(false);
            }}
            onMouseLeave={() => {
              panStateRef.current = null;
              setIsPanning(false);
            }}
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              padding: '24px',
              cursor: isPanning ? 'grabbing' : fitMode === 'custom' && effectiveScale > 1.05 ? 'grab' : 'default',
              userSelect: 'none',
            }}
          >
            {/* Document Paper Container */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                margin: 'auto',
                flexShrink: 0,
                background: '#ffffff',
                borderRadius: '2px',
                boxShadow: '0 16px 45px -8px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08)',
                lineHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                width: displayDimensions ? `${displayDimensions.width}px` : 'auto',
                height: displayDimensions ? `${displayDimensions.height}px` : 'auto',
                transform: `rotate(${currentRotation}deg)`,
                transition: 'transform 0.2s ease',
              }}
            >
              {pageImageUrl ? (
                <img
                  src={pageImageUrl}
                  alt={`Trang ${pageNumber}`}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              ) : initialThumbnailUrl ? (
                <img
                  src={initialThumbnailUrl}
                  alt={`Trang ${pageNumber}`}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    filter: 'blur(1px)',
                  }}
                />
              ) : (
                <div style={{ width: '400px', height: '560px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={32} className="animate-spin" color="var(--border-active)" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Popup Footer Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px',
            background: 'var(--bg-surface)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
            gap: '8px',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Info size={13} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
            <span>
              <strong>Mẹo & Phím tắt:</strong> <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>Cuộn chuột</kbd> hoặc <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>+</kbd> <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>-</kbd> (Phóng to / Thu nhỏ tới 500%) • <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>Kéo chuột</kbd> (Di chuyển khi phóng to) • <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>←</kbd> <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>→</kbd> (Đổi trang) • <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>R</kbd> (Xoay 90°) • <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>F</kbd> (Toàn màn hình) • <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>ESC</kbd> (Đóng)
            </span>
          </div>
          <div>
            Nhấn ra ngoài hoặc phím <kbd style={{ padding: '1px 5px', fontSize: '0.68rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>ESC</kbd> để đóng
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(popupJSX, document.body);
};
