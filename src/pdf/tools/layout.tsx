import React, { useMemo, useState } from 'react';
import { BookOpen, Crop, Download, Grid2x2, Maximize2, Ruler, Scan } from 'lucide-react';
import {
  booklet,
  bookletOrder,
  cropPages,
  fixPageSize,
  getPageDimensions,
  nUp,
  posterize,
  type FitMode,
  type Margins,
  type NUpOptions,
  type PageDimension,
} from '../core/ops';
import { MM_TO_PT, PT_TO_MM, detectPaperName, paperDims, type Orientation, type PaperId } from '../core/paper';
import { contentBounds, renderPageToCanvas } from '../core/render';
import { triggerDownload } from '../core/download';
import {
  Field,
  Notice,
  NumberInput,
  OrientationPicker,
  PaperPicker,
  ProcessButton,
  ResultPanel,
  Segmented,
  Thumbnail,
  Toggle,
  type PaperChoice,
} from '../ui/components';
import { PdfPageGrid, SelectionToolbar } from '../ui/PdfPageGrid';
import { pagesOf } from '../ui/gridItems';
import { useTask, useToolState } from '../ui/hooks';
import { useToolFiles, type LoadedFile } from '../ui/useToolFiles';
import { fileScope, parseRange, usePageSelection } from '../ui/selection';
import { SingleFileTool } from './common';
import { outName } from './naming';
import { useAsyncResult } from '../ui/useAsyncResult';

function usePageDims(file: LoadedFile | null): PageDimension[] | null {
  const { value, error } = useAsyncResult(file?.pageCount ? file.id : null, () => getPageDimensions(file!.buffer));
  return value ?? (error ? [] : null);
}

const sheetOf = (paper: PaperChoice, orientation: Orientation): [number, number] | null =>
  paper === 'auto' ? null : paperDims(paper, orientation);

// ---------------------------------------------------------------------------
// Cắt lề
// ---------------------------------------------------------------------------
const ZERO: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

export const CropPdf: React.FC = () => {
  const toolId = 'crop-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const dims = usePageDims(f);
  const sel = usePageSelection(toolId, f);
  const [mode, setMode] = useToolState<'manual' | 'auto'>(toolId, 'mode', 'manual');
  const [mm, setMm] = useToolState<Margins>(toolId, 'margins', { top: 10, right: 10, bottom: 10, left: 10 });
  const [padding, setPadding] = useToolState(toolId, 'padding', 3);
  const autoKey = f ? `${f.id}|${padding}|${sel.rangeText}` : '';
  const [autoState, setAutoState] = useState<{ key: string; value: Record<number, Margins> } | null>(null);
  const auto = autoState?.key === autoKey ? autoState.value : null;
  const setAuto = (value: Record<number, Margins>) => setAutoState({ key: autoKey, value });
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const previewPage = sel.sorted[0] ?? 1;

  const targets = sel.sorted.length ? sel.sorted : Array.from({ length: total }, (_, i) => i + 1);

  const analyze = async () => {
    if (!f || !dims) return;
    const result: Record<number, Margins> = {};
    const pad = padding * MM_TO_PT;
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      setAnalyzing(Math.round((i / targets.length) * 100));
      const { canvas, scale } = await renderPageToCanvas(f.buffer, p, 360);
      const b = contentBounds(canvas);
      if (!b) {
        result[p] = ZERO;
        continue;
      }
      const d = dims[p - 1];
      result[p] = {
        left: Math.max(0, b.left / scale - pad),
        top: Math.max(0, b.top / scale - pad),
        right: Math.max(0, d.width - b.right / scale - pad),
        bottom: Math.max(0, d.height - b.bottom / scale - pad),
      };
    }
    setAnalyzing(null);
    setAuto(result);
    return result;
  };

  const marginsPt: Margins = { top: mm.top * MM_TO_PT, right: mm.right * MM_TO_PT, bottom: mm.bottom * MM_TO_PT, left: mm.left * MM_TO_PT };
  const previewMargins = mode === 'auto' ? auto?.[previewPage] : marginsPt;
  const pd = dims?.[previewPage - 1];

  const run = () => {
    if (!f) return;
    task.run(async () => {
      let perPage = auto ?? undefined;
      if (mode === 'auto' && !perPage) perPage = await analyze();
      return [
        {
          name: outName(f, 'cat-le'),
          bytes: await cropPages(f.buffer, { margins: marginsPt, pages: targets, perPage: mode === 'auto' ? perPage : undefined }),
        },
      ];
    });
  };

  const setSide = (side: keyof Margins) => (v: number) => setMm((m) => ({ ...m, [side]: v }));

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <div className="pdft-preview" style={{ marginBottom: 14 }}>
            <div style={{ position: 'relative', width: 320 }}>
              <Thumbnail buffer={file.buffer} page={previewPage} width={320} />
              {pd && previewMargins && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: `${(previewMargins.left / pd.width) * 100}%`,
                    right: `${(previewMargins.right / pd.width) * 100}%`,
                    top: `${(previewMargins.top / pd.height) * 100}%`,
                    bottom: `${(previewMargins.bottom / pd.height) * 100}%`,
                    outline: '2px dashed #f43f5e',
                    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          </div>
          <SelectionToolbar total={total} selectedCount={sel.selected.size} onSelect={sel.setPages} />
          <PdfPageGrid items={pagesOf(file.buffer, total)} selected={sel.keys} onToggle={sel.toggle} thumbWidth={110} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Cắt lề</h3>
          <Segmented
            label="Cách cắt"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'manual', label: 'Nhập lề' },
              { value: 'auto', label: 'Tự cắt khoảng trắng' },
            ]}
          />
          {mode === 'manual' ? (
            <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Trên (mm)" htmlFor="crop-top">
                <NumberInput id="crop-top" value={mm.top} min={0} max={500} onChange={setSide('top')} />
              </Field>
              <Field label="Dưới (mm)" htmlFor="crop-bottom">
                <NumberInput id="crop-bottom" value={mm.bottom} min={0} max={500} onChange={setSide('bottom')} />
              </Field>
              <Field label="Trái (mm)" htmlFor="crop-left">
                <NumberInput id="crop-left" value={mm.left} min={0} max={500} onChange={setSide('left')} />
              </Field>
              <Field label="Phải (mm)" htmlFor="crop-right">
                <NumberInput id="crop-right" value={mm.right} min={0} max={500} onChange={setSide('right')} />
              </Field>
            </div>
          ) : (
            <>
              <Field label="Chừa viền quanh nội dung (mm)" htmlFor="crop-pad">
                <NumberInput id="crop-pad" value={padding} min={0} max={50} onChange={setPadding} />
              </Field>
              <button type="button" className="btn btn-secondary" disabled={!file || !dims || analyzing !== null} onClick={analyze}>
                <Scan size={16} />
                <span>{analyzing !== null ? `Đang dò... ${analyzing}%` : auto ? 'Dò lại vùng nội dung' : 'Dò vùng nội dung'}</span>
              </button>
              {auto && <Notice>Đã dò {Object.keys(auto).length} trang. Khung đỏ là vùng sẽ giữ lại.</Notice>}
            </>
          )}
          <Notice>{sel.selected.size ? `Áp dụng cho ${sel.selected.size} trang đã chọn.` : 'Không chọn trang = áp dụng cho tất cả.'}</Notice>
          <ProcessButton task={task} label="Cắt lề" icon={<Crop size={18} />} disabled={!file || !dims} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Nhiều trang trên 1 tờ
// ---------------------------------------------------------------------------
export const NUpPdf: React.FC = () => {
  const toolId = 'n-up-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [perSheet, setPerSheet] = useToolState<NUpOptions['perSheet']>(toolId, 'n', 2);
  const [paper, setPaper] = useToolState<PaperChoice>(toolId, 'paper', 'A4');
  const [orientation, setOrientation] = useToolState<Orientation>(toolId, 'orient', 'landscape');
  const [margin, setMargin] = useToolState(toolId, 'margin', 5);
  const [gap, setGap] = useToolState(toolId, 'gap', 4);
  const [border, setBorder] = useToolState(toolId, 'border', false);
  const [order, setOrder] = useToolState<'row' | 'column'>(toolId, 'order', 'row');

  const run = () => {
    if (!f) return;
    task.run(async () => [
      {
        name: outName(f, `${perSheet}-trang-1-to`),
        bytes: await nUp(f.buffer, { perSheet, sheet: sheetOf(paper, orientation), marginMm: margin, gapMm: gap, border, order }),
      },
    ]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <Notice>
            {total} trang → <strong>{Math.ceil(total / perSheet)}</strong> tờ in.
          </Notice>
          <div style={{ height: 12 }} />
          <PdfPageGrid items={pagesOf(file.buffer, total)} thumbWidth={110} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Ghép nhiều trang / tờ</h3>
          <Field label="Số trang mỗi tờ">
            <Segmented
              label="Số trang mỗi tờ"
              value={perSheet}
              onChange={setPerSheet}
              options={([2, 4, 6, 8, 9, 16] as const).map((n) => ({ value: n, label: String(n) }))}
            />
          </Field>
          <Field label="Khổ tờ in" htmlFor="nup-paper">
            <PaperPicker id="nup-paper" value={paper} onChange={setPaper} allowAuto />
          </Field>
          {paper !== 'auto' && <OrientationPicker value={orientation} onChange={setOrientation} />}
          <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Lề tờ (mm)" htmlFor="nup-margin">
              <NumberInput id="nup-margin" value={margin} min={0} max={50} onChange={setMargin} />
            </Field>
            <Field label="Khoảng cách (mm)" htmlFor="nup-gap">
              <NumberInput id="nup-gap" value={gap} min={0} max={50} onChange={setGap} />
            </Field>
          </div>
          <Field label="Thứ tự">
            <Segmented
              label="Thứ tự sắp trang"
              value={order}
              onChange={setOrder}
              options={[
                { value: 'row', label: 'Theo hàng' },
                { value: 'column', label: 'Theo cột' },
              ]}
            />
          </Field>
          <Toggle checked={border} onChange={setBorder} label="Kẻ khung quanh từng trang" />
          <ProcessButton task={task} label="Ghép trang" icon={<Grid2x2 size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// In sách gấp
// ---------------------------------------------------------------------------
export const PdfBooklet: React.FC = () => {
  const toolId = 'pdf-booklet';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [paper, setPaper] = useToolState<PaperChoice>(toolId, 'paper', 'A4');
  const [binding, setBinding] = useToolState<'left' | 'right'>(toolId, 'binding', 'left');
  const [marks, setMarks] = useToolState(toolId, 'marks', true);
  const order = useMemo(() => (total ? bookletOrder(total) : []), [total]);

  const run = () => {
    if (!f) return;
    task.run(async () => [
      {
        name: outName(f, 'sach-gap'),
        bytes: await booklet(f.buffer, { sheet: sheetOf(paper, 'landscape'), binding, creepMarks: marks }),
      },
    ]);
  };

  const show = (p: number | null) => (p === null ? 'trắng' : p);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <>
          <Notice>
            In 2 mặt, lật theo cạnh ngắn, rồi gấp đôi xấp giấy là thành sách. {total} trang → {order.length / 2} tờ giấy
            {total % 4 ? ` (thêm ${Math.ceil(total / 4) * 4 - total} trang trắng cho đủ bội số 4)` : ''}.
          </Notice>
          <table className="pdft-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Tờ</th>
                <th>Mặt trước (trái | phải)</th>
                <th>Mặt sau (trái | phải)</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: order.length / 2 }, (_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    {show(order[2 * i][0])} | {show(order[2 * i][1])}
                  </td>
                  <td>
                    {show(order[2 * i + 1][0])} | {show(order[2 * i + 1][1])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      panel={(file) => (
        <>
          <h3>Sách gấp giữa</h3>
          <Field label="Khổ tờ in (xoay ngang)" htmlFor="booklet-paper">
            <PaperPicker id="booklet-paper" value={paper} onChange={setPaper} allowAuto autoLabel="Gấp đôi khổ trang gốc" />
          </Field>
          <Field label="Gáy sách">
            <Segmented
              label="Gáy sách"
              value={binding}
              onChange={setBinding}
              options={[
                { value: 'left', label: 'Gáy trái (thông thường)' },
                { value: 'right', label: 'Gáy phải' },
              ]}
            />
          </Field>
          <Toggle checked={marks} onChange={setMarks} label="Vạch dấu đường gấp" />
          <ProcessButton task={task} label="Tạo bản in sách" icon={<BookOpen size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// In poster
// ---------------------------------------------------------------------------
export const PosterizePdf: React.FC = () => {
  const toolId = 'posterize-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [cols, setCols] = useToolState(toolId, 'cols', 2);
  const [rows, setRows] = useToolState(toolId, 'rows', 2);
  const [paper, setPaper] = useToolState<PaperId>(toolId, 'paper', 'A4');
  const [orientation, setOrientation] = useToolState<Orientation>(toolId, 'orient', 'portrait');
  const [overlap, setOverlap] = useToolState(toolId, 'overlap', 8);
  const [cutMarks, setCutMarks] = useToolState(toolId, 'marks', true);
  const [rangeText, setRangeText] = useToolState(toolId, 'range', '1', fileScope(f));
  const range = parseRange(rangeText, total);

  const run = () => {
    if (!f) return;
    task.run(async () => [
      {
        name: outName(f, `poster-${cols}x${rows}`),
        bytes: await posterize(f.buffer, {
          cols,
          rows,
          sheet: paperDims(paper, orientation),
          overlapMm: overlap,
          cutMarks,
          pages: range.pages,
        }),
      },
    ]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <div className="pdft-preview">
          <div style={{ position: 'relative', width: 320 }}>
            <Thumbnail buffer={file.buffer} page={range.pages[0] ?? 1} width={320} />
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
              }}
            >
              {Array.from({ length: cols * rows }, (_, i) => (
                <div key={i} style={{ border: '1px dashed #f43f5e' }} />
              ))}
            </div>
          </div>
        </div>
      )}
      panel={(file) => (
        <>
          <h3>In poster</h3>
          <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Số cột" htmlFor="poster-cols">
              <NumberInput id="poster-cols" value={cols} min={1} max={10} onChange={(v) => setCols(Math.round(v))} />
            </Field>
            <Field label="Số hàng" htmlFor="poster-rows">
              <NumberInput id="poster-rows" value={rows} min={1} max={10} onChange={(v) => setRows(Math.round(v))} />
            </Field>
          </div>
          <Field label="Khổ giấy mỗi tờ" htmlFor="poster-paper">
            <PaperPicker id="poster-paper" value={paper} onChange={(v) => setPaper(v === 'auto' ? 'A4' : v)} />
          </Field>
          <OrientationPicker value={orientation} onChange={setOrientation} />
          <Field label="Phần chồng mép để dán (mm)" htmlFor="poster-overlap">
            <NumberInput id="poster-overlap" value={overlap} min={0} max={50} onChange={setOverlap} />
          </Field>
          <Toggle checked={cutMarks} onChange={setCutMarks} label="Vạch đường dán" />
          <Field label="Trang cần in poster" htmlFor="poster-range">
            <input id="poster-range" className="pdft-input" value={rangeText} onChange={(e) => setRangeText(e.target.value)} />
          </Field>
          {range.error && <Notice kind="error">{range.error}</Notice>}
          <Notice>
            Mỗi trang → {cols * rows} tờ. Tổng: {(range.pages.length || total) * cols * rows} tờ.
          </Notice>
          <ProcessButton task={task} label="Tạo poster" icon={<Maximize2 size={18} />} disabled={!file || !!range.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Chuẩn hóa khổ giấy
// ---------------------------------------------------------------------------
export const FixPageSize: React.FC = () => {
  const toolId = 'fix-page-size';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const dims = usePageDims(f);
  const [paper, setPaper] = useToolState<PaperId>(toolId, 'paper', 'A4');
  const [match, setMatch] = useToolState(toolId, 'match', true);
  const [mode, setMode] = useToolState<FitMode>(toolId, 'mode', 'fit');
  const [margin, setMargin] = useToolState(toolId, 'margin', 0);
  const mixed = dims ? new Set(dims.map((d) => detectPaperName(d.width, d.height) ?? `${Math.round(d.width)}x${Math.round(d.height)}`)).size : 0;

  const run = () => {
    if (!f) return;
    task.run(async () => [
      {
        name: outName(f, `kho-${paper}`),
        bytes: await fixPageSize(f.buffer, { size: paperDims(paper, 'portrait'), matchOrientation: match, mode, marginMm: margin }),
      },
    ]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          {dims && (
            <Notice>
              Tài liệu có <strong>{mixed}</strong> khổ trang khác nhau.
            </Notice>
          )}
          <div style={{ height: 12 }} />
          <PdfPageGrid
            items={pagesOf(file.buffer, total, {
              badge: (p) => {
                const d = dims?.[p - 1];
                return d ? { text: detectPaperName(d.width, d.height) ?? `${Math.round(d.width * PT_TO_MM)}×${Math.round(d.height * PT_TO_MM)}`, tone: 'cyan' } : undefined;
              },
            })}
            thumbWidth={110}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Đưa về cùng khổ giấy</h3>
          <Field label="Khổ giấy đích" htmlFor="fix-paper">
            <PaperPicker id="fix-paper" value={paper} onChange={(v) => setPaper(v === 'auto' ? 'A4' : v)} />
          </Field>
          <Toggle checked={match} onChange={setMatch} label="Giữ hướng dọc/ngang của từng trang" />
          <Field label="Cách đưa nội dung vào khổ mới">
            <select className="pdft-select" aria-label="Cách co giãn" value={mode} onChange={(e) => setMode(e.target.value as FitMode)}>
              <option value="fit">Vừa khổ, giữ tỉ lệ (có thể dư viền)</option>
              <option value="fill">Lấp kín khổ, giữ tỉ lệ (có thể mất mép)</option>
              <option value="stretch">Kéo giãn kín khổ (méo tỉ lệ)</option>
            </select>
          </Field>
          <Field label="Lề (mm)" htmlFor="fix-margin">
            <NumberInput id="fix-margin" value={margin} min={0} max={50} onChange={setMargin} />
          </Field>
          <Notice>Trang được vẽ lại vào khổ mới; liên kết và chú thích tương tác trên trang sẽ không được giữ.</Notice>
          <ProcessButton task={task} label={`Chuẩn hóa về ${paper}`} icon={<Ruler size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Kích thước trang
// ---------------------------------------------------------------------------
export const PageDimensions: React.FC = () => {
  const toolId = 'page-dimensions';
  const files = useToolFiles(toolId);
  const f = files.file;
  const dims = usePageDims(f);
  const [unit, setUnit] = useToolState<'mm' | 'pt' | 'in'>(toolId, 'unit', 'mm');
  const conv = (pt: number) => (unit === 'mm' ? pt * PT_TO_MM : unit === 'in' ? pt / 72 : pt);
  const fmt = (pt: number) => conv(pt).toFixed(unit === 'pt' ? 0 : unit === 'in' ? 2 : 1);

  const summary = useMemo(() => {
    const map = new Map<string, number[]>();
    dims?.forEach((d) => {
      const name = detectPaperName(d.width, d.height) ?? 'Khổ tùy chỉnh';
      const key = `${name} ${d.width > d.height ? 'ngang' : 'dọc'} (${Math.round(d.width * PT_TO_MM)}×${Math.round(d.height * PT_TO_MM)} mm)`;
      map.set(key, [...(map.get(key) ?? []), d.page]);
    });
    return [...map.entries()];
  }, [dims]);

  const exportCsv = () => {
    if (!dims || !f) return;
    const rows = [
      ['Trang', `Rộng (${unit})`, `Cao (${unit})`, 'Khổ', 'Hướng', 'Xoay (độ)'],
      ...dims.map((d) => [
        d.page,
        fmt(d.width),
        fmt(d.height),
        detectPaperName(d.width, d.height) ?? '',
        d.width > d.height ? 'Ngang' : 'Dọc',
        d.rotation,
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n');
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), outName(f, 'kich-thuoc', 'csv'));
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() =>
        dims ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="pdft-table">
              <thead>
                <tr>
                  <th>Trang</th>
                  <th>Rộng</th>
                  <th>Cao</th>
                  <th>Khổ</th>
                  <th>Hướng</th>
                  <th>Xoay</th>
                </tr>
              </thead>
              <tbody>
                {dims.map((d) => (
                  <tr key={d.page}>
                    <td>{d.page}</td>
                    <td>
                      {fmt(d.width)} {unit}
                    </td>
                    <td>
                      {fmt(d.height)} {unit}
                    </td>
                    <td>{detectPaperName(d.width, d.height) ?? '—'}</td>
                    <td>{d.width > d.height ? 'Ngang' : 'Dọc'}</td>
                    <td>{d.rotation}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pdft-empty">Đang đọc kích thước trang...</div>
        )
      }
      panel={(file) => (
        <>
          <h3>Tổng hợp khổ trang</h3>
          <Segmented
            label="Đơn vị"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'mm', label: 'mm' },
              { value: 'in', label: 'inch' },
              { value: 'pt', label: 'point' },
            ]}
          />
          {summary.map(([key, pages]) => (
            <Notice key={key}>
              <strong>{key}</strong>: {pages.length} trang
            </Notice>
          ))}
          <button type="button" className="btn btn-secondary" disabled={!file || !dims} onClick={exportCsv}>
            <Download size={16} />
            <span>Tải bảng CSV (mở bằng Excel)</span>
          </button>
        </>
      )}
    />
  );
};
