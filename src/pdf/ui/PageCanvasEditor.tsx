import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { getPdfDocumentProxy } from '../../services/thumbnailService';
import { getThumbnail } from '../core/render';
import type { EditorObject, ObjectKind } from '../core/objects';

export interface CanvasEditorProps {
  buffer: ArrayBuffer;
  pageCount: number;
  page: number;
  onPageChange: (page: number) => void;
  objects: EditorObject[];
  onChange: (objects: EditorObject[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Loại đối tượng sẽ tạo khi kéo/bấm trên trang (null = chế độ chọn) */
  addKind: ObjectKind | null;
  makeObject: (kind: ObjectKind, page: number, rect: { x: number; y: number; w: number; h: number }, pxPerPt: number) => EditorObject | null;
  onAdded?: (obj: EditorObject) => void;
  ink?: { color: string; width: number };
  /** Lớp phủ thêm (ví dụ khung chữ có sẵn để bấm sửa) */
  overlay?: (page: number, pxPerPt: number) => React.ReactNode;
}

type Drag =
  | { type: 'move'; id: string; startX: number; startY: number; orig: EditorObject }
  | { type: 'resize'; id: string; startX: number; startY: number; orig: EditorObject }
  | { type: 'create'; startX: number; startY: number; curX: number; curY: number }
  | { type: 'ink'; points: [number, number][] };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const FONT_CSS: Record<string, string> = {
  sans: "'BccNotoSans', 'Noto Sans', Arial, sans-serif",
  serif: "'BccNotoSerif', 'Noto Serif', 'Times New Roman', serif",
  mono: "'BccNotoMono', 'Noto Sans Mono', monospace",
};

/** Trình chỉnh sửa trang: kéo thả, đổi kích thước, vẽ tay đối tượng trên ảnh trang */
export const PageCanvasEditor: React.FC<CanvasEditorProps> = ({
  buffer,
  pageCount,
  page,
  onPageChange,
  objects,
  onChange,
  selectedId,
  onSelect,
  addKind,
  makeObject,
  onAdded,
  ink = { color: '#1d4ed8', width: 2 },
  overlay,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [img, setImg] = useState<{ key: string; src: string } | null>(null);
  const [pageSize, setPageSize] = useState<{ key: string; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(Math.max(320, el.clientWidth - 8)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayW = Math.round(Math.min(1400, containerW * zoom));
  const imgKey = `${page}@${displayW}`;
  const sizeKey = String(page);

  useEffect(() => {
    let cancelled = false;
    getThumbnail(buffer, page, displayW).then((src) => !cancelled && setImg({ key: `${page}@${displayW}`, src }));
    getPdfDocumentProxy(buffer)
      .then((pdf) => pdf.getPage(page))
      .then((p) => {
        const vp = p.getViewport({ scale: 1 });
        if (!cancelled) setPageSize({ key: String(page), w: vp.width, h: vp.height });
      });
    return () => {
      cancelled = true;
    };
  }, [buffer, page, displayW]);

  const size = pageSize?.key === sizeKey ? pageSize : null;
  const displayH = size ? (displayW * size.h) / size.w : displayW * 1.414;
  const pxPerPt = size ? displayW / size.w : 1;

  const toNorm = (e: { clientX: number; clientY: number }) => {
    const r = surfaceRef.current!.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)] as [number, number];
  };

  const update = useCallback(
    (id: string, patch: Partial<EditorObject>) => onChange(objects.map((o) => (o.id === id ? { ...o, ...patch } : o))),
    [objects, onChange]
  );

  // Phím Delete / mũi tên cho đối tượng đang chọn
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || t?.isContentEditable) return;
      const obj = objects.find((o) => o.id === selectedId);
      if (!obj) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onChange(objects.filter((o) => o.id !== selectedId));
        onSelect(null);
        return;
      }
      const step = e.shiftKey ? 0.02 : 0.004;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const d = delta[e.key];
      if (d) {
        e.preventDefault();
        update(obj.id, { x: clamp(obj.x + d[0], 0, 1 - obj.w), y: clamp(obj.y + d[1], 0, 1 - obj.h) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, objects, onChange, onSelect, update]);

  const onSurfaceDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = toNorm(e);
    if (addKind === 'ink') {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ type: 'ink', points: [[x, y]] });
      return;
    }
    if (addKind) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ type: 'create', startX: x, startY: y, curX: x, curY: y });
      return;
    }
    onSelect(null);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const [x, y] = toNorm(e);
    if (d.type === 'ink') setDrag({ ...d, points: [...d.points, [x, y]] });
    else if (d.type === 'create') setDrag({ ...d, curX: x, curY: y });
    else if (d.type === 'move') {
      const o = d.orig;
      const nx = clamp(o.x + x - d.startX, 0, 1 - o.w);
      const ny = clamp(o.y + y - d.startY, 0, 1 - o.h);
      const patch: Partial<EditorObject> = { x: nx, y: ny };
      if (o.points) patch.points = o.points.map((s) => s.map(([px, py]) => [px + nx - o.x, py + ny - o.y] as [number, number]));
      update(d.id, patch);
    } else if (d.type === 'resize') {
      const o = d.orig;
      const nw = clamp(o.w + x - d.startX, 0.01, 1 - o.x);
      const nh = clamp(o.h + y - d.startY, 0.005, 1 - o.y);
      const patch: Partial<EditorObject> = { w: nw, h: nh };
      if (o.points)
        patch.points = o.points.map((s) =>
          s.map(([px, py]) => [o.x + ((px - o.x) * nw) / o.w, o.y + ((py - o.y) * nh) / o.h] as [number, number])
        );
      update(d.id, patch);
    }
  };

  const onUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.type === 'ink' && d.points.length > 1) {
      const xs = d.points.map((p) => p[0]);
      const ys = d.points.map((p) => p[1]);
      const obj: EditorObject = {
        id: `ink${Date.now().toString(36)}`,
        page,
        kind: 'ink',
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(0.005, Math.max(...xs) - Math.min(...xs)),
        h: Math.max(0.005, Math.max(...ys) - Math.min(...ys)),
        points: [d.points],
        color: ink.color,
        strokeWidth: ink.width,
      };
      onChange([...objects, obj]);
      onAdded?.(obj);
    } else if (d.type === 'create' && addKind) {
      const x = Math.min(d.startX, d.curX);
      const y = Math.min(d.startY, d.curY);
      const w = Math.abs(d.curX - d.startX);
      const h = Math.abs(d.curY - d.startY);
      const obj = makeObject(addKind, page, { x, y, w, h }, pxPerPt);
      if (obj) {
        onChange([...objects, obj]);
        onSelect(obj.id);
        onAdded?.(obj);
      }
    }
  };

  const pageObjects = objects.filter((o) => o.page === page);

  return (
    <div ref={wrapRef}>
      <div className="pdft-toolbar">
        <button type="button" className="pdft-icon-btn" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span>
          Trang <strong style={{ color: 'var(--text-main)' }}>{page}</strong> / {pageCount}
        </span>
        <button type="button" className="pdft-icon-btn" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRight size={16} />
        </button>
        <span className="pdft-toolbar__spacer" />
        <button type="button" className="pdft-icon-btn" aria-label="Thu nhỏ" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
          <ZoomOut size={15} />
        </button>
        <span style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button type="button" className="pdft-icon-btn" aria-label="Phóng to" disabled={zoom >= 2} onClick={() => setZoom((z) => Math.min(2, z + 0.25))}>
          <ZoomIn size={15} />
        </button>
      </div>
      <div style={{ overflow: 'auto', maxHeight: '78vh', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: 4 }}>
        <div
          ref={surfaceRef}
          className="pdft-surface"
          style={{
            position: 'relative',
            width: displayW,
            height: displayH,
            margin: '0 auto',
            background: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            cursor: addKind === 'ink' ? 'crosshair' : addKind ? 'copy' : 'default',
            touchAction: 'none',
          }}
          onPointerDown={onSurfaceDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {img?.key === imgKey ? (
            <img src={img.src} alt={`Trang ${page}`} draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
          ) : (
            <div className="pdft-empty">Đang hiển thị trang...</div>
          )}

          {overlay?.(page, pxPerPt)}

          {/* Nét vẽ tay (toàn trang) */}
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {pageObjects
              .filter((o) => o.kind === 'ink')
              .flatMap((o) =>
                (o.points ?? []).map((stroke, i) => (
                  <polyline
                    key={`${o.id}-${i}`}
                    points={stroke.map(([px, py]) => `${px * 1000},${py * 1000}`).join(' ')}
                    fill="none"
                    stroke={o.color}
                    strokeWidth={((o.strokeWidth ?? 2) * pxPerPt * 1000) / displayW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={o.opacity ?? 1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              )}
            {drag?.type === 'ink' && (
              <polyline
                points={drag.points.map(([px, py]) => `${px * 1000},${py * 1000}`).join(' ')}
                fill="none"
                stroke={ink.color}
                strokeWidth={ink.width * pxPerPt}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            )}
          </svg>

          {pageObjects.map((o) => (
            <ObjectBox
              key={o.id}
              obj={o}
              pxPerPt={pxPerPt}
              selected={o.id === selectedId}
              interactive={!addKind}
              onPointerDown={(e, mode) => {
                e.stopPropagation();
                if (addKind) return;
                onSelect(o.id);
                const [x, y] = toNorm(e);
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDrag({ type: mode, id: o.id, startX: x, startY: y, orig: o });
              }}
            />
          ))}

          {drag?.type === 'create' && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.min(drag.startX, drag.curX) * 100}%`,
                top: `${Math.min(drag.startY, drag.curY) * 100}%`,
                width: `${Math.abs(drag.curX - drag.startX) * 100}%`,
                height: `${Math.abs(drag.curY - drag.startY) * 100}%`,
                border: '1.5px dashed #0284c7',
                background: 'rgba(2,132,199,0.08)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const ObjectBox: React.FC<{
  obj: EditorObject;
  pxPerPt: number;
  selected: boolean;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent, mode: 'move' | 'resize') => void;
}> = ({ obj, pxPerPt, selected, interactive, onPointerDown }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${obj.x * 100}%`,
    top: `${obj.y * 100}%`,
    width: `${obj.w * 100}%`,
    height: `${obj.h * 100}%`,
    outline: selected ? '2px solid #0284c7' : obj.kind === 'whiteout' || obj.kind === 'field' ? '1px dashed #64748b' : undefined,
    outlineOffset: 1,
    cursor: interactive ? 'move' : undefined,
    pointerEvents: interactive ? 'auto' : 'none',
    opacity: obj.kind === 'highlight' ? (obj.opacity ?? 0.38) : (obj.opacity ?? 1),
    boxSizing: 'border-box',
  };
  let content: React.ReactNode = null;
  switch (obj.kind) {
    case 'text':
      Object.assign(style, {
        fontFamily: FONT_CSS[obj.family ?? 'sans'],
        fontSize: (obj.fontSize ?? 12) * pxPerPt,
        lineHeight: 1.25,
        color: obj.color ?? '#000',
        fontWeight: obj.bold ? 700 : 400,
        fontStyle: obj.italic ? 'italic' : 'normal',
        textAlign: obj.align ?? 'left',
        background: obj.fill ?? undefined,
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        padding: `0 ${2 * pxPerPt}px`,
      });
      content = obj.text || ' ';
      break;
    case 'rect':
      Object.assign(style, { background: obj.fill ?? undefined, border: obj.strokeWidth ? `${obj.strokeWidth * pxPerPt}px solid ${obj.color}` : undefined });
      break;
    case 'ellipse':
      Object.assign(style, {
        background: obj.fill ?? undefined,
        border: obj.strokeWidth ? `${obj.strokeWidth * pxPerPt}px solid ${obj.color}` : undefined,
        borderRadius: '50%',
      });
      break;
    case 'whiteout':
      style.background = '#fff';
      break;
    case 'highlight':
      style.background = obj.fill ?? '#ffeb3b';
      break;
    case 'image':
      content = obj.image ? <img src={obj.image} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} /> : null;
      break;
    case 'line':
    case 'arrow':
      content = (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: 'visible', display: 'block' }}>
          <line
            x1={obj.flip ? 100 : 0}
            y1={0}
            x2={obj.flip ? 0 : 100}
            y2={100}
            stroke={obj.color}
            strokeWidth={(obj.strokeWidth ?? 2) * pxPerPt}
            vectorEffect="non-scaling-stroke"
            markerEnd={obj.kind === 'arrow' ? undefined : undefined}
          />
        </svg>
      );
      break;
    case 'ink':
      style.outline = selected ? '1px dashed #0284c7' : undefined;
      break;
    case 'field':
      Object.assign(style, {
        background: 'rgba(14,165,233,0.12)',
        fontSize: 11,
        color: '#0369a1',
        padding: '1px 4px',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      });
      content = `${obj.field?.type === 'checkbox' ? '☑' : obj.field?.type === 'dropdown' ? '▾' : obj.field?.type === 'radio' ? '◉' : '✎'} ${obj.field?.name ?? ''}`;
      break;
  }
  return (
    <div style={style} onPointerDown={(e) => onPointerDown(e, 'move')} role="button" aria-label={`Đối tượng ${obj.kind}`} aria-pressed={selected}>
      {content}
      {selected && interactive && (
        <div
          onPointerDown={(e) => onPointerDown(e, 'resize')}
          aria-label="Kéo để đổi kích thước"
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: '#0284c7',
            border: '2px solid #fff',
            borderRadius: 3,
            cursor: 'nwse-resize',
          }}
        />
      )}
    </div>
  );
};
