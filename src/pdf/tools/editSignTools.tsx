import React, { useEffect, useRef, useState } from 'react';
import { Eraser, FilePen, PenTool, Stamp, Type } from 'lucide-react';
import { getPdfDocumentProxy } from '../../services/thumbnailService';
import { fileSignature } from '../core/fileStore';
import type { FontFamily } from '../core/fonts';
import { applyObjects, newObjectId, type EditorObject, type ObjectKind } from '../core/objects';
import { ANNOT_LABELS, countAnnotations, removeAnnotations } from '../core/structure';
import { PageCanvasEditor } from '../ui/PageCanvasEditor';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { ColorInput } from '../ui/controls';
import { useTask, useToolState } from '../ui/hooks';
import { fileToImageDataUrl, imageSize, removeWhiteBackground } from '../ui/imageUtils';
import { parseRange } from '../ui/selection';
import { useAsyncResult } from '../ui/useAsyncResult';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';
import { outName } from './naming';

// ---------------------------------------------------------------------------
// Bảng thuộc tính đối tượng đang chọn (dùng chung cho EditPdf, EditPdfText, SignPdf, AddStamps)
// ---------------------------------------------------------------------------
const ObjectInspector: React.FC<{
  obj: EditorObject;
  totalPages: number;
  onUpdate: (patch: Partial<EditorObject>) => void;
  onDelete: () => void;
  onCloneAllPages: () => void;
}> = ({ obj, totalPages, onUpdate, onDelete, onCloneAllPages }) => (
  <div className="pdft-panel__group" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
    <strong>Đối tượng đang chọn ({obj.kind})</strong>
    {obj.kind === 'text' && (
      <>
        <Field label="Nội dung chữ" htmlFor="obj-text">
          <textarea
            id="obj-text"
            className="pdft-textarea"
            rows={3}
            value={obj.text ?? ''}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
        </Field>
        <div className="pdft-row" style={{ gridTemplateColumns: '1fr 90px' }}>
          <Field label="Phông chữ" htmlFor="obj-font">
            <select
              id="obj-font"
              className="pdft-select"
              value={obj.family ?? 'sans'}
              onChange={(e) => onUpdate({ family: e.target.value as FontFamily })}
            >
              <option value="sans">Không chân (Noto Sans)</option>
              <option value="serif">Có chân (Noto Serif)</option>
              <option value="mono">Đơn cách (Noto Mono)</option>
            </select>
          </Field>
          <Field label="Cỡ (pt)" htmlFor="obj-size">
            <NumberInput id="obj-size" value={obj.fontSize ?? 12} min={6} max={140} onChange={(v) => onUpdate({ fontSize: v })} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Toggle checked={!!obj.bold} onChange={(v) => onUpdate({ bold: v })} label="Đậm" />
          <Toggle checked={!!obj.italic} onChange={(v) => onUpdate({ italic: v })} label="Nghiêng" />
        </div>
        <ColorInput id="obj-color" label="Màu chữ" value={obj.color ?? '#111827'} onChange={(c) => onUpdate({ color: c })} />
        <Toggle
          checked={!!obj.fill}
          onChange={(v) => onUpdate({ fill: v ? '#ffffff' : null })}
          label="Tô nền hộp chữ (che chữ cũ phía dưới)"
        />
        {obj.fill && (
          <ColorInput id="obj-fill" label="Màu nền hộp chữ" value={obj.fill} onChange={(c) => onUpdate({ fill: c })} />
        )}
      </>
    )}
    {(obj.kind === 'rect' || obj.kind === 'ellipse' || obj.kind === 'line' || obj.kind === 'arrow' || obj.kind === 'ink') && (
      <>
        <ColorInput id="obj-stroke" label="Màu nét" value={obj.color ?? '#dc2626'} onChange={(c) => onUpdate({ color: c })} />
        <Field label="Độ dày nét (pt)" htmlFor="obj-sw">
          <NumberInput id="obj-sw" value={obj.strokeWidth ?? 2} min={0} max={24} onChange={(v) => onUpdate({ strokeWidth: v })} />
        </Field>
        {(obj.kind === 'rect' || obj.kind === 'ellipse') && (
          <>
            <Toggle checked={!!obj.fill} onChange={(v) => onUpdate({ fill: v ? '#fef08a' : null })} label="Tô màu bên trong" />
            {obj.fill && <ColorInput id="obj-sfill" label="Màu tô" value={obj.fill} onChange={(c) => onUpdate({ fill: c })} />}
          </>
        )}
      </>
    )}
    {obj.kind === 'highlight' && (
      <ColorInput id="obj-hl" label="Màu tô sáng" value={obj.fill ?? '#fde047'} onChange={(c) => onUpdate({ fill: c })} />
    )}
    <Field label={`Độ đậm: ${Math.round((obj.opacity ?? 1) * 100)}%`} htmlFor="obj-op">
      <input
        id="obj-op"
        type="range"
        min={0.1}
        max={1}
        step={0.05}
        value={obj.opacity ?? 1}
        onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
      />
    </Field>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {totalPages > 1 && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCloneAllPages}>
          Nhân bản sang mọi trang
        </button>
      )}
      <button type="button" className="btn btn-secondary btn-sm" onClick={onDelete}>
        Xóa đối tượng
      </button>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// 1. Chỉnh sửa PDF (edit-pdf)
// ---------------------------------------------------------------------------
const EDIT_TOOLS: { kind: ObjectKind | null; label: string }[] = [
  { kind: null, label: 'Chọn / Di chuyển' },
  { kind: 'text', label: '+ Chữ' },
  { kind: 'whiteout', label: 'Che trắng' },
  { kind: 'highlight', label: 'Tô sáng' },
  { kind: 'rect', label: 'Khung chữ nhật' },
  { kind: 'ellipse', label: 'Hình elip' },
  { kind: 'arrow', label: 'Mũi tên' },
  { kind: 'line', label: 'Đường thẳng' },
  { kind: 'ink', label: 'Vẽ tay' },
];

export const EditPdf: React.FC = () => {
  const toolId = 'edit-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const sig = f ? fileSignature(f.file) : '';
  const total = f?.pageCount ?? 0;

  const [page, setPage] = useState(1);
  const [objects, setObjects] = useToolState<EditorObject[]>(toolId, 'objects', [], sig);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<ObjectKind | null>('text');
  const [inkColor, setInkColor] = useToolState(toolId, 'inkColor', '#dc2626');
  const [inkWidth, setInkWidth] = useToolState(toolId, 'inkWidth', 2);

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const updateSelected = (patch: Partial<EditorObject>) =>
    selected && setObjects(objects.map((o) => (o.id === selected.id ? { ...o, ...patch } : o)));

  const cloneToAllPages = () => {
    if (!selected || total <= 1) return;
    const clones: EditorObject[] = [];
    for (let p = 1; p <= total; p++) {
      if (p === selected.page) continue;
      clones.push({ ...selected, id: newObjectId(), page: p });
    }
    setObjects([...objects, ...clones]);
  };

  const makeObject = (kind: ObjectKind, p: number, rect: { x: number; y: number; w: number; h: number }): EditorObject => {
    const base: EditorObject = { id: newObjectId(), page: p, kind, ...rect };
    switch (kind) {
      case 'text':
        return { ...base, text: 'Nhập nội dung', fontSize: 13, family: 'sans', color: '#111827', fill: null };
      case 'whiteout':
        return { ...base, fill: '#ffffff' };
      case 'highlight':
        return { ...base, fill: '#fde047', opacity: 0.4 };
      case 'rect':
      case 'ellipse':
        return { ...base, color: '#dc2626', strokeWidth: 2, fill: null };
      default:
        return { ...base, color: '#dc2626', strokeWidth: 2 };
    }
  };

  const onUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgFile = e.target.files?.[0];
    e.target.value = '';
    if (!imgFile) return;
    const dataUrl = await fileToImageDataUrl(imgFile, 1800);
    const dim = await imageSize(dataUrl);
    const w = 0.28;
    const h = Math.min(0.6, (w * dim.h) / Math.max(1, dim.w) * 0.72);
    const obj: EditorObject = { id: newObjectId(), page, kind: 'image', x: 0.35, y: 0.35, w, h, image: dataUrl };
    setObjects([...objects, obj]);
    setSelectedId(obj.id);
    setAddKind(null);
  };

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'chinh-sua'),
        bytes: await applyObjects(f.buffer, objects),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <div className="pdft-bar" style={{ marginBottom: 10 }}>
            {EDIT_TOOLS.map((t) => (
              <button
                key={t.label}
                type="button"
                className={`btn btn-sm ${addKind === t.kind ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAddKind(t.kind)}
              >
                {t.label}
              </button>
            ))}
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              + Chèn ảnh
              <input type="file" accept="image/*" hidden onChange={onUploadImage} />
            </label>
          </div>
          <PageCanvasEditor
            buffer={file.buffer}
            pageCount={total}
            page={Math.min(page, Math.max(1, total))}
            onPageChange={setPage}
            objects={objects}
            onChange={setObjects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            addKind={addKind}
            makeObject={makeObject}
            onAdded={() => {
              if (addKind !== 'ink') setAddKind(null);
            }}
            ink={{ color: inkColor, width: inkWidth }}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Chỉnh sửa trang PDF</h3>
          <Notice>Chọn công cụ ở thanh phía trên trang rồi bấm hoặc kéo chuột lên trang để thêm chữ, che trắng, tô sáng, vẽ hình hoặc chèn ảnh.</Notice>
          {addKind === 'ink' && (
            <>
              <ColorInput id="ink-c" label="Màu nét vẽ tay" value={inkColor} onChange={setInkColor} />
              <Field label="Độ dày nét vẽ (pt)" htmlFor="ink-w">
                <NumberInput id="ink-w" value={inkWidth} min={1} max={18} onChange={setInkWidth} />
              </Field>
            </>
          )}
          {selected && (
            <ObjectInspector
              obj={selected}
              totalPages={total}
              onUpdate={updateSelected}
              onDelete={() => {
                setObjects(objects.filter((o) => o.id !== selected.id));
                setSelectedId(null);
              }}
              onCloneAllPages={cloneToAllPages}
            />
          )}
          {objects.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setObjects([]);
                setSelectedId(null);
              }}
            >
              Xóa toàn bộ ({objects.length} đối tượng)
            </button>
          )}
          <ProcessButton task={task} label="Lưu tệp PDF" icon={<FilePen size={18} />} disabled={!file || objects.length === 0} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 2. Sửa chữ trong PDF (edit-pdf-text)
// ---------------------------------------------------------------------------
interface DetectedLine {
  text: string;
  /** Toạ độ chuẩn hóa 0..1 */
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
}

async function extractPageLines(buffer: ArrayBuffer, pageNo: number): Promise<DetectedLine[]> {
  const pdf = await getPdfDocumentProxy(buffer);
  const page = await pdf.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const rawItems: { text: string; left: number; top: number; width: number; height: number; fontSize: number }[] = [];
  for (const it of tc.items as any[]) {
    const str = String(it.str ?? '');
    if (!str.trim() || !it.transform) continue;
    const [a, b, , , e, f] = it.transform as number[];
    const fontSize = Math.max(6, Math.round(Math.hypot(a, b) * 2) / 2);
    const [vx, vy] = vp.convertToViewportPoint(e, f);
    const width = Math.max(fontSize * 0.5, (it.width || str.length * fontSize * 0.5) * vp.scale);
    const height = Math.max(fontSize * 1.15, (it.height || fontSize) * 1.18);
    rawItems.push({
      text: str,
      left: vx,
      top: vy - height * 0.82,
      width,
      height,
      fontSize,
    });
  }
  // Gom các mục cùng hàng (cùng y +-4pt và gần nhau theo trục ngang)
  rawItems.sort((a, b) => a.top - b.top || a.left - b.left);
  const merged: typeof rawItems = [];
  for (const item of rawItems) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.top - item.top) <= Math.max(4, prev.fontSize * 0.35) && item.left <= prev.left + prev.width + prev.fontSize * 1.8) {
      const gap = item.left - (prev.left + prev.width);
      prev.text += (gap > prev.fontSize * 0.18 ? ' ' : '') + item.text;
      const right = Math.max(prev.left + prev.width, item.left + item.width);
      prev.width = right - prev.left;
      prev.height = Math.max(prev.height, item.height);
      prev.fontSize = Math.max(prev.fontSize, item.fontSize);
    } else {
      merged.push({ ...item });
    }
  }
  return merged.map((m) => ({
    text: m.text,
    x: Math.max(0, Math.min(0.98, m.left / vp.width)),
    y: Math.max(0, Math.min(0.98, m.top / vp.height)),
    w: Math.max(0.03, Math.min(1 - m.left / vp.width, (m.width + 6) / vp.width)),
    h: Math.max(0.016, Math.min(1 - m.top / vp.height, (m.height + 3) / vp.height)),
    fontSize: m.fontSize,
  }));
}

export const EditPdfText: React.FC = () => {
  const toolId = 'edit-pdf-text';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const sig = f ? fileSignature(f.file) : '';
  const total = f?.pageCount ?? 0;

  const [page, setPage] = useState(1);
  const [objects, setObjects] = useToolState<EditorObject[]>(toolId, 'objects', [], sig);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<ObjectKind | null>(null);

  const curPage = Math.min(page, Math.max(1, total));
  const lines = useAsyncResult(f ? `${f.id}|${curPage}` : null, () =>
    f ? extractPageLines(f.buffer, curPage) : Promise.resolve([] as DetectedLine[])
  );

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const updateSelected = (patch: Partial<EditorObject>) =>
    selected && setObjects(objects.map((o) => (o.id === selected.id ? { ...o, ...patch } : o)));

  const onClickDetectedLine = (ln: DetectedLine) => {
    const obj: EditorObject = {
      id: newObjectId(),
      page: curPage,
      kind: 'text',
      x: ln.x,
      y: ln.y,
      w: Math.min(1 - ln.x, ln.w + 0.02),
      h: Math.min(1 - ln.y, ln.h + 0.006),
      text: ln.text,
      fontSize: ln.fontSize,
      family: 'sans',
      color: '#111827',
      fill: '#ffffff',
    };
    setObjects([...objects, obj]);
    setSelectedId(obj.id);
    setAddKind(null);
  };

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'sua-chu'),
        bytes: await applyObjects(f.buffer, objects),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <div className="pdft-bar" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={`btn btn-sm ${addKind === null ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAddKind(null)}
            >
              Bấm vào dòng chữ có sẵn để sửa ({lines.value?.length ?? 0} dòng trên trang này)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${addKind === 'text' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAddKind('text')}
            >
              + Kéo thêm hộp chữ mới
            </button>
          </div>
          <PageCanvasEditor
            buffer={file.buffer}
            pageCount={total}
            page={curPage}
            onPageChange={setPage}
            objects={objects}
            onChange={setObjects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            addKind={addKind}
            makeObject={(kind, p, rect) => ({
              id: newObjectId(),
              page: p,
              kind,
              ...rect,
              text: 'Nội dung mới',
              fontSize: 12,
              family: 'sans',
              color: '#111827',
              fill: '#ffffff',
            })}
            onAdded={() => setAddKind(null)}
            overlay={() =>
              addKind === null ? (
                <>
                  {(lines.value ?? []).map((ln, idx) => (
                    <button
                      key={idx}
                      type="button"
                      title={`Bấm để sửa: "${ln.text}"`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClickDetectedLine(ln);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${ln.x * 100}%`,
                        top: `${ln.y * 100}%`,
                        width: `${ln.w * 100}%`,
                        height: `${ln.h * 100}%`,
                        border: '1px dashed rgba(37, 99, 235, 0.45)',
                        background: 'rgba(37, 99, 235, 0.04)',
                        cursor: 'text',
                        padding: 0,
                      }}
                    />
                  ))}
                </>
              ) : null
            }
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Sửa chữ trong PDF</h3>
          <Notice>
            Bấm trực tiếp vào bất kỳ dòng chữ có viền nét đứt màu xanh trên trang để đè nội dung mới (hỗ trợ đầy đủ tiếng Việt có dấu).
          </Notice>
          {selected && (
            <ObjectInspector
              obj={selected}
              totalPages={total}
              onUpdate={updateSelected}
              onDelete={() => {
                setObjects(objects.filter((o) => o.id !== selected.id));
                setSelectedId(null);
              }}
              onCloneAllPages={() => {}}
            />
          )}
          <ProcessButton task={task} label="Lưu văn bản đã sửa" icon={<Type size={18} />} disabled={!file || objects.length === 0} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. Ký tên vào PDF (sign-pdf)
// ---------------------------------------------------------------------------
function renderTypedSignature(text: string, color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 200;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = "italic bold 64px 'BccNotoSerif', 'Times New Roman', serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text || 'Chữ ký', canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

export const SignPdf: React.FC = () => {
  const toolId = 'sign-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const sig = f ? fileSignature(f.file) : '';
  const total = f?.pageCount ?? 0;

  const [page, setPage] = useState(1);
  const [objects, setObjects] = useToolState<EditorObject[]>(toolId, 'objects', [], sig);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useToolState<'draw' | 'type' | 'upload'>(toolId, 'tab', 'draw');
  const [sigColor, setSigColor] = useToolState(toolId, 'color', '#1d4ed8');
  const [typedName, setTypedName] = useToolState(toolId, 'typedName', 'Nguyễn Văn A');
  const [sigDataUrl, setSigDataUrl] = useToolState<string | null>(toolId, 'sigImg', null);
  const [cleanBg, setCleanBg] = useToolState(toolId, 'cleanBg', true);

  const padRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const c = padRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = sigColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [sigColor, tab]);

  const clearPad = () => {
    const c = padRef.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setSigDataUrl(null);
  };

  const placeSignature = (targetPages: number[]) => {
    const img = tab === 'type' ? renderTypedSignature(typedName, sigColor) : sigDataUrl;
    if (!img) return;
    const added: EditorObject[] = targetPages.map((p) => ({
      id: newObjectId(),
      page: p,
      kind: 'image',
      x: 0.58,
      y: 0.74,
      w: 0.28,
      h: 0.1,
      image: img,
    }));
    setObjects([...objects, ...added]);
    setSelectedId(added[0]?.id ?? null);
  };

  const curPage = Math.min(page, Math.max(1, total));
  const selected = objects.find((o) => o.id === selectedId) ?? null;

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'da-ky'),
        bytes: await applyObjects(f.buffer, objects),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <PageCanvasEditor
          buffer={file.buffer}
          pageCount={total}
          page={curPage}
          onPageChange={setPage}
          objects={objects}
          onChange={setObjects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          addKind={null}
          makeObject={() => null}
        />
      )}
      panel={(file) => (
        <>
          <h3>Ký tên lên PDF</h3>
          <Segmented
            label="Cách tạo chữ ký"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'draw', label: 'Vẽ tay' },
              { value: 'type', label: 'Gõ tên' },
              { value: 'upload', label: 'Ảnh chụp' },
            ]}
          />
          <ColorInput id="sig-c" label="Màu mực ký" value={sigColor} onChange={setSigColor} />
          {tab === 'draw' && (
            <div>
              <canvas
                ref={padRef}
                width={320}
                height={130}
                style={{
                  width: '100%',
                  height: 120,
                  background: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  touchAction: 'none',
                  cursor: 'crosshair',
                }}
                onPointerDown={(e) => {
                  const c = padRef.current!;
                  c.setPointerCapture(e.pointerId);
                  const r = c.getBoundingClientRect();
                  const ctx = c.getContext('2d')!;
                  ctx.strokeStyle = sigColor;
                  ctx.lineWidth = 3.2;
                  ctx.lineCap = 'round';
                  ctx.beginPath();
                  ctx.moveTo(((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height);
                  drawingRef.current = true;
                }}
                onPointerMove={(e) => {
                  if (!drawingRef.current) return;
                  const c = padRef.current!;
                  const r = c.getBoundingClientRect();
                  const ctx = c.getContext('2d')!;
                  ctx.lineTo(((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height);
                  ctx.stroke();
                }}
                onPointerUp={() => {
                  drawingRef.current = false;
                  if (padRef.current) setSigDataUrl(padRef.current.toDataURL('image/png'));
                }}
              />
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={clearPad}>
                Xóa vẽ lại
              </button>
            </div>
          )}
          {tab === 'type' && (
            <Field label="Họ tên chữ ký" htmlFor="sig-name">
              <input id="sig-name" className="pdft-input" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
            </Field>
          )}
          {tab === 'upload' && (
            <>
              <Toggle checked={cleanBg} onChange={setCleanBg} label="Tự động tách nền giấy trắng" />
              <Field label="Chọn ảnh chữ ký" htmlFor="sig-up">
                <input
                  id="sig-up"
                  type="file"
                  accept="image/*"
                  className="pdft-input"
                  onChange={async (e) => {
                    const imgFile = e.target.files?.[0];
                    if (!imgFile) return;
                    const raw = await fileToImageDataUrl(imgFile, 1200);
                    setSigDataUrl(cleanBg ? await removeWhiteBackground(raw, 48) : raw);
                  }}
                />
              </Field>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={tab !== 'type' && !sigDataUrl}
              onClick={() => placeSignature([curPage])}
            >
              + Đặt lên trang {curPage}
            </button>
            {total > 1 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={tab !== 'type' && !sigDataUrl}
                onClick={() => placeSignature([total])}
              >
                + Đặt lên trang cuối ({total})
              </button>
            )}
            {total > 1 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={tab !== 'type' && !sigDataUrl}
                onClick={() => placeSignature(Array.from({ length: total }, (_, i) => i + 1))}
              >
                + Ký nháy mọi trang
              </button>
            )}
          </div>
          {selected && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setObjects(objects.filter((o) => o.id !== selected.id));
                setSelectedId(null);
              }}
            >
              Xóa chữ ký đang chọn
            </button>
          )}
          <ProcessButton task={task} label="Lưu PDF đã ký" icon={<PenTool size={18} />} disabled={!file || objects.length === 0} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 4. Đóng dấu PDF (add-stamps)
// ---------------------------------------------------------------------------
const STAMP_PRESETS = [
  'ĐÃ THU TIỀN',
  'ĐÃ THANH TOÁN',
  'SAO Y BẢN CHÍNH',
  'ĐÃ KIỂM TRA',
  'ĐÃ PHÊ DUYỆT',
  'KHẨN',
  'HỎA TỐC',
  'MẬT',
  'BẢN DỰ THẢO',
];

function renderStampDataUrl(label: string, subText: string, color: string, shape: 'box' | 'oval'): string {
  const canvas = document.createElement('canvas');
  canvas.width = 680;
  canvas.height = 240;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (shape === 'box') {
    ctx.lineWidth = 10;
    ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
  } else {
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 18, canvas.height / 2 - 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 30, canvas.height / 2 - 30, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mainY = subText.trim() ? canvas.height * 0.43 : canvas.height * 0.5;
  ctx.font = "bold 54px 'BccNotoSans', Arial, sans-serif";
  ctx.fillText(label.toUpperCase(), canvas.width / 2, mainY, canvas.width - 90);
  if (subText.trim()) {
    ctx.font = "bold 28px 'BccNotoSans', Arial, sans-serif";
    ctx.fillText(subText.trim(), canvas.width / 2, canvas.height * 0.72, canvas.width - 110);
  }
  return canvas.toDataURL('image/png');
}

export const AddStamps: React.FC = () => {
  const toolId = 'add-stamps';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const sig = f ? fileSignature(f.file) : '';
  const total = f?.pageCount ?? 0;

  const [page, setPage] = useState(1);
  const [objects, setObjects] = useToolState<EditorObject[]>(toolId, 'objects', [], sig);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [label, setLabel] = useToolState(toolId, 'label', 'ĐÃ THU TIỀN');
  const [subText, setSubText] = useToolState(toolId, 'sub', `Ngày ${new Date().toLocaleDateString('vi-VN')}`);
  const [color, setColor] = useToolState(toolId, 'color', '#dc2626');
  const [shape, setShape] = useToolState<'box' | 'oval'>(toolId, 'shape', 'box');

  const curPage = Math.min(page, Math.max(1, total));
  const selected = objects.find((o) => o.id === selectedId) ?? null;

  const placeStamp = (targetPages: number[]) => {
    const img = renderStampDataUrl(label, subText, color, shape);
    const added: EditorObject[] = targetPages.map((p) => ({
      id: newObjectId(),
      page: p,
      kind: 'image',
      x: 0.6,
      y: 0.12,
      w: 0.28,
      h: 0.09,
      opacity: 0.9,
      image: img,
    }));
    setObjects([...objects, ...added]);
    setSelectedId(added[0]?.id ?? null);
  };

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'dong-dau'),
        bytes: await applyObjects(f.buffer, objects),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <PageCanvasEditor
          buffer={file.buffer}
          pageCount={total}
          page={curPage}
          onPageChange={setPage}
          objects={objects}
          onChange={setObjects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          addKind={null}
          makeObject={() => null}
        />
      )}
      panel={(file) => (
        <>
          <h3>Đóng dấu nghiệp vụ</h3>
          <Field label="Mẫu dấu nhanh" htmlFor="st-preset">
            <select id="st-preset" className="pdft-select" value={label} onChange={(e) => setLabel(e.target.value)}>
              {STAMP_PRESETS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nội dung dòng chính" htmlFor="st-label">
            <input id="st-label" className="pdft-input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Dòng phụ (ngày tháng / người ký)" htmlFor="st-sub">
            <input id="st-sub" className="pdft-input" value={subText} onChange={(e) => setSubText(e.target.value)} />
          </Field>
          <Field label="Kiểu khung dấu">
            <Segmented
              label="Kiểu khung"
              value={shape}
              onChange={setShape}
              options={[
                { value: 'box', label: 'Khung chữ nhật kép' },
                { value: 'oval', label: 'Khung bầu dục' },
              ]}
            />
          </Field>
          <ColorInput id="st-color" label="Màu mực dấu" value={color} onChange={setColor} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => placeStamp([curPage])}>
              + Đóng lên trang {curPage}
            </button>
            {total > 1 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => placeStamp(Array.from({ length: total }, (_, i) => i + 1))}
              >
                + Đóng lên mọi trang
              </button>
            )}
          </div>
          {selected && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setObjects(objects.filter((o) => o.id !== selected.id));
                setSelectedId(null);
              }}
            >
              Xóa con dấu đang chọn
            </button>
          )}
          <ProcessButton task={task} label="Lưu PDF đã đóng dấu" icon={<Stamp size={18} />} disabled={!file || objects.length === 0} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 5. Xóa chú thích (remove-annotations)
// ---------------------------------------------------------------------------
export const RemoveAnnotations: React.FC = () => {
  const toolId = 'remove-annotations';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;

  const counts = useAsyncResult(f ? f.id : null, () =>
    f ? countAnnotations(f.buffer) : Promise.resolve({} as Record<string, number>)
  );
  const entries = Object.entries(counts.value ?? {});
  const totalAnnots = entries.reduce((s, [, n]) => s + n, 0);

  const [mode, setMode] = useToolState<'all' | 'pick'>(toolId, 'mode', 'all');
  const [picked, setPicked] = useToolState<string[]>(toolId, 'picked', []);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);

  const toggleType = (t: string) =>
    setPicked(picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t]);

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'xoa-chu-thich'),
        bytes: await removeAnnotations(f.buffer, {
          types: mode === 'all' ? null : picked,
          pages: pages.pages,
        }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() =>
        entries.length === 0 ? (
          <div className="pdft-empty">Không phát hiện chú thích nào trên các trang của tệp PDF này.</div>
        ) : (
          <table className="pdft-table">
            <thead>
              <tr>
                <th>Loại chú thích</th>
                <th>Mã PDF</th>
                <th>Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([sub, n]) => (
                <tr key={sub}>
                  <td>{ANNOT_LABELS[sub] ?? sub}</td>
                  <td>
                    <code>/{sub}</code>
                  </td>
                  <td>{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
      panel={(file) => (
        <>
          <h3>Xóa chú thích</h3>
          <Notice>Phát hiện tổng cộng {totalAnnots} chú thích trên tài liệu.</Notice>
          <Field label="Phạm vi xóa">
            <Segmented
              label="Phạm vi xóa"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'all', label: 'Tất cả chú thích' },
                { value: 'pick', label: 'Chọn từng loại' },
              ]}
            />
          </Field>
          {mode === 'pick' &&
            entries.map(([sub, n]) => (
              <Toggle
                key={sub}
                checked={picked.includes(sub)}
                onChange={() => toggleType(sub)}
                label={`${ANNOT_LABELS[sub] ?? sub} (${n})`}
              />
            ))}
          <Field label="Áp dụng cho trang (để trống = tất cả)" htmlFor="ra-range">
            <input id="ra-range" className="pdft-input" value={range} placeholder="Ví dụ: 1-5" onChange={(e) => setRange(e.target.value)} />
            {pages.error && <Notice kind="error">{pages.error}</Notice>}
          </Field>
          <ProcessButton
            task={task}
            label="Xóa chú thích"
            icon={<Eraser size={18} />}
            disabled={!file || !!pages.error || (mode === 'pick' && picked.length === 0)}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};
