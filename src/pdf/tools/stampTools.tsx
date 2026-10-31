import React from 'react';
import { Hash, Paintbrush, PanelTop, Stamp, Tags, Type } from 'lucide-react';
import { addBackgroundColor, addBates, addHeaderFooter, addPageNumbers, addWatermark, batesLabel } from '../core/stamp';
import { setPageLabels, type LabelStyle, type PageLabelRange } from '../core/structure';
import { changeTextColor } from '../core/contentStream';
import { hexToRgb } from '../core/fonts';
import { rasterizePdf, replaceWhiteFilter } from '../core/raster';
import { toRoman, type HPos, type VPos } from '../core/draw';
import { fileSignature } from '../core/fileStore';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { ColorInput, PositionPicker, TextStyleFields } from '../ui/controls';
import { DEFAULT_TEXT_STYLE, toTextStyle, type TextStyleState } from '../ui/textStyle';
import { LivePreview } from '../ui/LivePreview';
import { useTask, useToolState } from '../ui/hooks';
import { useToolFiles, type LoadedFile } from '../ui/useToolFiles';
import { parseRange } from '../ui/selection';
import { dataUrlToBytes, fileToImageDataUrl } from '../ui/imageUtils';
import { MultiFileTool, SingleFileTool } from './common';
import { outName } from './naming';

const PagesField: React.FC<{ id: string; value: string; onChange: (v: string) => void; total: number }> = ({ id, value, onChange, total }) => {
  const r = parseRange(value, total);
  return (
    <Field label="Áp dụng cho trang (để trống = tất cả)" htmlFor={id}>
      <input id={id} className="pdft-input" value={value} placeholder="Ví dụ: 2-10" onChange={(e) => onChange(e.target.value)} />
      {r.error && <Notice kind="error">{r.error}</Notice>}
    </Field>
  );
};

// ---------------------------------------------------------------------------
// Đánh số trang
// ---------------------------------------------------------------------------
const NUMBER_FORMATS = ['{n}', 'Trang {n}', 'Trang {n}/{total}', '- {n} -', '{n}/{total}'];

export const PageNumbers: React.FC = () => {
  const toolId = 'page-numbers';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [format, setFormat] = useToolState(toolId, 'format', '{n}');
  const [pos, setPos] = useToolState<{ v: VPos; h: HPos }>(toolId, 'pos', { v: 'top', h: 'center' });
  const [mirror, setMirror] = useToolState(toolId, 'mirror', false);
  const [margin, setMargin] = useToolState(toolId, 'margin', 10);
  const [start, setStart] = useToolState(toolId, 'start', 1);
  const [fromPage, setFromPage] = useToolState(toolId, 'from', 2);
  const [style, setStyle] = useToolState<TextStyleState>(toolId, 'style', { ...DEFAULT_TEXT_STYLE, size: 13 });
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);

  const options = { format, v: pos.v, h: pos.h, mirror, marginMm: margin, startNumber: start, fromPage, style: toTextStyle(style), pages: pages.pages };
  const run = () => f && task.run(async () => [{ name: outName(f, 'danh-so'), bytes: await addPageNumbers(f.buffer, options, f.file.name) }]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <Notice>
            Văn bản hành chính (Nghị định 30/2020/NĐ-CP): số trang đặt <strong>giữa, phía trên</strong>, cỡ chữ 13–14, không đánh số
            trang đầu — là cài đặt mặc định.
          </Notice>
          <div style={{ height: 12 }} />
          <LivePreview
            optionsKey={`${file.id}|${JSON.stringify(options)}`}
            build={() => addPageNumbers(file.buffer, options, file.file.name)}
            page={Math.min(Math.max(fromPage, 1), total)}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Đánh số trang</h3>
          <Field label="Mẫu số trang" htmlFor="pn-format" hint="{n} = số trang, {total} = tổng số trang.">
            <input id="pn-format" className="pdft-input" list="pn-formats" value={format} onChange={(e) => setFormat(e.target.value)} />
            <datalist id="pn-formats">
              {NUMBER_FORMATS.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <PositionPicker value={pos} onChange={setPos} rows={['top', 'bottom']} />
          <Toggle checked={mirror} onChange={setMirror} label="Đối xứng trang chẵn/lẻ (in 2 mặt)" />
          <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Bắt đầu đánh từ trang" htmlFor="pn-from">
              <NumberInput id="pn-from" value={fromPage} min={1} max={Math.max(1, total)} onChange={setFromPage} />
            </Field>
            <Field label="Số đầu tiên" htmlFor="pn-start">
              <NumberInput id="pn-start" value={start} min={0} max={99999} onChange={setStart} />
            </Field>
          </div>
          <Field label="Lề (mm)" htmlFor="pn-margin">
            <NumberInput id="pn-margin" value={margin} min={0} max={60} onChange={setMargin} />
          </Field>
          <TextStyleFields idPrefix="pn" value={style} onChange={setStyle} />
          <PagesField id="pn-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Đánh số trang" icon={<Hash size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Đầu trang / chân trang
// ---------------------------------------------------------------------------
interface HF {
  left: string;
  center: string;
  right: string;
}

export const HeaderFooter: React.FC = () => {
  const toolId = 'header-footer';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [header, setHeader] = useToolState<HF>(toolId, 'header', { left: '', center: '', right: '' });
  const [footer, setFooter] = useToolState<HF>(toolId, 'footer', { left: '', center: 'Trang {n}/{total}', right: '' });
  const [margin, setMargin] = useToolState(toolId, 'margin', 10);
  const [line, setLine] = useToolState(toolId, 'line', false);
  const [style, setStyle] = useToolState<TextStyleState>(toolId, 'style', { ...DEFAULT_TEXT_STYLE, size: 10, color: '#334155' });
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);
  const options = { header, footer, marginMm: margin, style: toTextStyle(style), line, pages: pages.pages };
  const run = () => f && task.run(async () => [{ name: outName(f, 'dau-chan-trang'), bytes: await addHeaderFooter(f.buffer, options, f.file.name) }]);

  const row = (label: string, value: HF, set: (v: HF) => void, id: string) => (
    <Field label={label}>
      <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {(['left', 'center', 'right'] as const).map((k) => (
          <input
            key={k}
            id={`${id}-${k}`}
            className="pdft-input pdft-input--sm"
            placeholder={k === 'left' ? 'Trái' : k === 'center' ? 'Giữa' : 'Phải'}
            aria-label={`${label} ${k === 'left' ? 'trái' : k === 'center' ? 'giữa' : 'phải'}`}
            value={value[k]}
            onChange={(e) => set({ ...value, [k]: e.target.value })}
          />
        ))}
      </div>
    </Field>
  );

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <LivePreview optionsKey={`${file.id}|${JSON.stringify(options)}`} build={() => addHeaderFooter(file.buffer, options, file.file.name)} page={pages.pages[0] ?? 1} />
      )}
      panel={(file) => (
        <>
          <h3>Đầu trang &amp; chân trang</h3>
          {row('Đầu trang', header, setHeader, 'hf-h')}
          {row('Chân trang', footer, setFooter, 'hf-f')}
          <Notice>Biến: {'{n}'} số trang, {'{total}'} tổng trang, {'{date}'} ngày hôm nay, {'{file}'} tên tệp.</Notice>
          <Toggle checked={line} onChange={setLine} label="Kẻ đường phân cách" />
          <Field label="Lề (mm)" htmlFor="hf-margin">
            <NumberInput id="hf-margin" value={margin} min={0} max={60} onChange={setMargin} />
          </Field>
          <TextStyleFields idPrefix="hf" value={style} onChange={setStyle} />
          <PagesField id="hf-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Thêm đầu/chân trang" icon={<PanelTop size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Số Bates (nhiều tệp, đánh số liên tục)
// ---------------------------------------------------------------------------
export const BatesNumbering: React.FC = () => {
  const toolId = 'bates-numbering';
  const files = useToolFiles(toolId, { multiple: true });
  const task = useTask();
  const [prefix, setPrefix] = useToolState(toolId, 'prefix', 'HS-');
  const [suffix, setSuffix] = useToolState(toolId, 'suffix', '');
  const [start, setStart] = useToolState(toolId, 'start', 1);
  const [digits, setDigits] = useToolState(toolId, 'digits', 6);
  const [pos, setPos] = useToolState<{ v: VPos; h: HPos }>(toolId, 'pos', { v: 'bottom', h: 'right' });
  const [margin, setMargin] = useToolState(toolId, 'margin', 8);
  const [style, setStyle] = useToolState<TextStyleState>(toolId, 'style', { ...DEFAULT_TEXT_STYLE, family: 'sans', size: 9, bold: true });
  const totalPages = files.files.reduce((s, x) => s + (x.pageCount ?? 0), 0);
  const opts = { prefix, suffix, start, digits, v: pos.v, h: pos.h, marginMm: margin, style: toTextStyle(style) };

  const run = () =>
    task.run(async (report) => {
      let n = start;
      const outputs = [];
      for (let i = 0; i < files.files.length; i++) {
        const x = files.files[i];
        report(Math.round((i / files.files.length) * 100), `Đang đánh số tệp ${i + 1}/${files.files.length}...`);
        const first = n;
        const r = await addBates(x.buffer, opts, n);
        n = r.next;
        outputs.push({ name: `${batesLabel(opts, first)}_${x.file.name.replace(/\.pdf$/i, '')}.pdf`, bytes: r.bytes });
      }
      return outputs;
    });

  return (
    <MultiFileTool
      toolId={toolId}
      files={files}
      dropTitle="Chọn các tệp PDF của hồ sơ (đánh số liên tục theo thứ tự)"
      panel={
        <>
          <h3>Số Bates</h3>
          <Notice>Mỗi trang của cả bộ hồ sơ nhận một số duy nhất, liên tục qua các tệp theo thứ tự danh sách.</Notice>
          <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Tiền tố" htmlFor="bates-prefix">
              <input id="bates-prefix" className="pdft-input" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </Field>
            <Field label="Hậu tố" htmlFor="bates-suffix">
              <input id="bates-suffix" className="pdft-input" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
            </Field>
            <Field label="Số bắt đầu" htmlFor="bates-start">
              <NumberInput id="bates-start" value={start} min={0} max={1e9} onChange={setStart} />
            </Field>
            <Field label="Số chữ số" htmlFor="bates-digits">
              <NumberInput id="bates-digits" value={digits} min={1} max={12} onChange={setDigits} />
            </Field>
          </div>
          <Notice>
            Ví dụ: <strong>{batesLabel(opts, start)}</strong> … <strong>{batesLabel(opts, start + Math.max(0, totalPages - 1))}</strong> ({totalPages} trang)
          </Notice>
          <PositionPicker value={pos} onChange={setPos} rows={['top', 'bottom']} />
          <Field label="Lề (mm)" htmlFor="bates-margin">
            <NumberInput id="bates-margin" value={margin} min={0} max={60} onChange={setMargin} />
          </Field>
          <TextStyleFields idPrefix="bates" value={style} onChange={setStyle} />
          <ProcessButton task={task} label="Đánh số Bates" icon={<Hash size={18} />} disabled={!files.files.length || files.files.some((x) => !!x.error)} onClick={run} />
          <ResultPanel task={task} zipName="ho-so-bates.zip" />
        </>
      }
    />
  );
};

// ---------------------------------------------------------------------------
// Hình mờ
// ---------------------------------------------------------------------------
export const AddWatermark: React.FC = () => {
  const toolId = 'add-watermark';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [kind, setKind] = useToolState<'text' | 'image'>(toolId, 'kind', 'text');
  const [text, setText] = useToolState(toolId, 'text', 'BẢN SAO');
  const [style, setStyle] = useToolState<TextStyleState>(toolId, 'style', { ...DEFAULT_TEXT_STYLE, family: 'sans', size: 60, bold: true, color: '#dc2626' });
  const [image, setImage] = useToolState<string | null>(toolId, 'image', null);
  const [imageScale, setImageScale] = useToolState(toolId, 'scale', 40);
  const [angle, setAngle] = useToolState(toolId, 'angle', 45);
  const [opacity, setOpacity] = useToolState(toolId, 'opacity', 0.18);
  const [layout, setLayout] = useToolState<'center' | 'tile'>(toolId, 'layout', 'center');
  const [gap, setGap] = useToolState(toolId, 'gap', 45);
  const [position, setPosition] = useToolState<'over' | 'under'>(toolId, 'position', 'over');
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);

  const imgData = image ? dataUrlToBytes(image) : undefined;
  const options = {
    kind,
    text,
    style: toTextStyle(style),
    image: imgData,
    imageScale,
    angle,
    opacity,
    layout,
    tileGap: gap,
    position,
    pages: pages.pages,
  };
  const run = () => f && task.run(async () => [{ name: outName(f, 'hinh-mo'), bytes: await addWatermark(f.buffer, options) }]);
  const ready = kind === 'text' ? !!text.trim() : !!image;

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) =>
        ready ? (
          <LivePreview optionsKey={`${file.id}|${JSON.stringify({ ...options, image: image?.length })}`} build={() => addWatermark(file.buffer, options)} page={pages.pages[0] ?? 1} />
        ) : (
          <div className="pdft-empty">Nhập chữ hoặc chọn ảnh để xem trước.</div>
        )
      }
      panel={(file) => (
        <>
          <h3>Hình mờ</h3>
          <Segmented
            label="Loại hình mờ"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'text', label: 'Chữ' },
              { value: 'image', label: 'Ảnh / logo' },
            ]}
          />
          {kind === 'text' ? (
            <>
              <Field label="Nội dung" htmlFor="wm-text">
                <input id="wm-text" className="pdft-input" value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
              <TextStyleFields idPrefix="wm" value={style} onChange={setStyle} sizeMax={300} />
            </>
          ) : (
            <>
              <Field label="Ảnh (PNG nền trong suốt cho đẹp nhất)" htmlFor="wm-image">
                <input
                  id="wm-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="pdft-input"
                  onChange={async (e) => {
                    const file0 = e.target.files?.[0];
                    if (file0) setImage(await fileToImageDataUrl(file0, 1600));
                  }}
                />
              </Field>
              {image && <img src={image} alt="Ảnh hình mờ" style={{ maxHeight: 80, alignSelf: 'flex-start', background: '#fff' }} />}
              <Field label={`Độ rộng ảnh: ${imageScale}% chiều rộng trang`} htmlFor="wm-scale">
                <input id="wm-scale" type="range" min={5} max={100} value={imageScale} onChange={(e) => setImageScale(Number(e.target.value))} />
              </Field>
            </>
          )}
          <Field label={`Góc xoay: ${angle}°`} htmlFor="wm-angle">
            <input id="wm-angle" type="range" min={-90} max={90} value={angle} onChange={(e) => setAngle(Number(e.target.value))} />
          </Field>
          <Field label={`Độ đậm: ${Math.round(opacity * 100)}%`} htmlFor="wm-opacity">
            <input id="wm-opacity" type="range" min={0.03} max={1} step={0.01} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
          </Field>
          <Field label="Bố cục">
            <Segmented
              label="Bố cục"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'center', label: 'Giữa trang' },
                { value: 'tile', label: 'Lặp kín trang' },
              ]}
            />
          </Field>
          {layout === 'tile' && (
            <Field label={`Khoảng cách lặp: ${gap}%`} htmlFor="wm-gap">
              <input id="wm-gap" type="range" min={15} max={100} value={gap} onChange={(e) => setGap(Number(e.target.value))} />
            </Field>
          )}
          <Field label="Lớp">
            <Segmented
              label="Lớp hình mờ"
              value={position}
              onChange={setPosition}
              options={[
                { value: 'over', label: 'Đè lên nội dung' },
                { value: 'under', label: 'Nằm dưới nội dung' },
              ]}
            />
          </Field>
          <PagesField id="wm-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Thêm hình mờ" icon={<Stamp size={18} />} disabled={!file || !ready || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Nhãn trang
// ---------------------------------------------------------------------------
const LABEL_STYLES: { value: LabelStyle; label: string }[] = [
  { value: 'D', label: '1, 2, 3' },
  { value: 'r', label: 'i, ii, iii' },
  { value: 'R', label: 'I, II, III' },
  { value: 'a', label: 'a, b, c' },
  { value: 'A', label: 'A, B, C' },
  { value: 'none', label: 'Chỉ tiền tố' },
];

function labelPreview(r: PageLabelRange, offset: number): string {
  const n = r.start + offset;
  const body =
    r.style === 'D'
      ? String(n)
      : r.style === 'r'
        ? toRoman(n).toLowerCase()
        : r.style === 'R'
          ? toRoman(n)
          : r.style === 'a' || r.style === 'A'
            ? String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1)[r.style === 'A' ? 'toUpperCase' : 'toLowerCase']()
            : '';
  return `${r.prefix}${body}`;
}

export const AddPageLabels: React.FC = () => {
  const toolId = 'add-page-labels';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [ranges, setRanges] = useToolState<PageLabelRange[]>(
    toolId,
    'ranges',
    [
      { startPage: 1, style: 'r', prefix: '', start: 1 },
      { startPage: 3, style: 'D', prefix: '', start: 1 },
    ],
    f ? fileSignature(f.file) : ''
  );
  const sorted = [...ranges].sort((a, b) => a.startPage - b.startPage);
  const labelOf = (p: number) => {
    const r = [...sorted].reverse().find((x) => x.startPage <= p);
    return r ? labelPreview(r, p - r.startPage) : String(p);
  };
  const update = (i: number, patch: Partial<PageLabelRange>) => setRanges(ranges.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const run = () => f && task.run(async () => [{ name: outName(f, 'nhan-trang'), bytes: await setPageLabels(f.buffer, ranges) }]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <>
          <Notice>Nhãn trang là số trang hiển thị trong trình đọc PDF (ví dụ phần mở đầu đánh i, ii, iii; nội dung đánh 1, 2, 3). Không vẽ thêm gì lên trang.</Notice>
          <table className="pdft-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Trang thật</th>
                <th>Nhãn hiển thị</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.min(total, 60) }, (_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{labelOf(i + 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 60 && <div className="pdft-empty">… và {total - 60} trang nữa</div>}
        </>
      )}
      panel={(file) => (
        <>
          <h3>Các đoạn nhãn</h3>
          {ranges.map((r, i) => (
            <div key={i} className="pdft-file" style={{ gridTemplateColumns: '1fr auto', alignItems: 'start' }}>
              <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Field label="Từ trang" htmlFor={`pl-start-${i}`}>
                  <NumberInput id={`pl-start-${i}`} value={r.startPage} min={1} max={Math.max(1, total)} onChange={(v) => update(i, { startPage: Math.round(v) })} />
                </Field>
                <Field label="Kiểu số" htmlFor={`pl-style-${i}`}>
                  <select id={`pl-style-${i}`} className="pdft-select" value={r.style} onChange={(e) => update(i, { style: e.target.value as LabelStyle })}>
                    {LABEL_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tiền tố" htmlFor={`pl-prefix-${i}`}>
                  <input id={`pl-prefix-${i}`} className="pdft-input" value={r.prefix} onChange={(e) => update(i, { prefix: e.target.value })} />
                </Field>
                <Field label="Bắt đầu từ số" htmlFor={`pl-num-${i}`}>
                  <NumberInput id={`pl-num-${i}`} value={r.start} min={1} max={99999} onChange={(v) => update(i, { start: Math.round(v) })} />
                </Field>
              </div>
              <button type="button" className="pdft-icon-btn pdft-icon-btn--danger" aria-label="Xóa đoạn" onClick={() => setRanges(ranges.filter((_, k) => k !== i))}>
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRanges([...ranges, { startPage: Math.min(total, (sorted[sorted.length - 1]?.startPage ?? 0) + 1) || 1, style: 'D', prefix: '', start: 1 }])}
          >
            + Thêm đoạn
          </button>
          <ProcessButton task={task} label="Gắn nhãn trang" icon={<Tags size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Màu nền
// ---------------------------------------------------------------------------
export const BackgroundColor: React.FC = () => {
  const toolId = 'background-color';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [color, setColor] = useToolState(toolId, 'color', '#fef9c3');
  const [mode, setMode] = useToolState<'vector' | 'raster'>(toolId, 'mode', 'vector');
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);
  const build = (file: LoadedFile, previewPages?: number[]) =>
    mode === 'vector'
      ? addBackgroundColor(file.buffer, hexToRgb(color), pages.pages)
      : rasterizePdf(file.buffer, { dpi: previewPages ? 72 : 150, format: 'jpeg', quality: 0.85, pages: previewPages ?? pages.pages, filter: replaceWhiteFilter(hexToRgb(color)) });
  const run = () => f && task.run(async () => [{ name: outName(f, 'mau-nen'), bytes: await build(f) }]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <LivePreview
          optionsKey={`${file.id}|${color}|${mode}|${range}`}
          build={() => build(file, mode === 'raster' ? [pages.pages[0] ?? 1] : undefined)}
          page={pages.pages[0] ?? 1}
        />
      )}
      panel={(file) => (
        <>
          <h3>Màu nền trang</h3>
          <ColorInput id="bg-color" label="Màu nền" value={color} onChange={setColor} />
          <Field label="Cách tô">
            <Segmented
              label="Cách tô màu nền"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'vector', label: 'Lót nền (giữ chữ)' },
                { value: 'raster', label: 'Thay vùng trắng' },
              ]}
            />
          </Field>
          <Notice>
            {mode === 'vector'
              ? 'Tô một lớp màu dưới nội dung, chữ vẫn chọn/tìm được. Trang scan (ảnh nền trắng) sẽ che mất màu — khi đó dùng “Thay vùng trắng”.'
              : 'Đổi mọi vùng trắng thành màu nền (kể cả trang scan). Trang được chuyển thành ảnh 150 DPI, chữ không còn chọn được.'}
          </Notice>
          <PagesField id="bg-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Đổi màu nền" icon={<Paintbrush size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Đổi màu chữ
// ---------------------------------------------------------------------------
export const TextColor: React.FC = () => {
  const toolId = 'text-color';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [color, setColor] = useToolState(toolId, 'color', '#1d4ed8');
  const [onlyDark, setOnlyDark] = useToolState(toolId, 'dark', true);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);
  const options = { color: hexToRgb(color), onlyDark, pages: pages.pages };
  const run = () =>
    f &&
    task.run(async () => {
      const r = await changeTextColor(f.buffer, options);
      return {
        outputs: [{ name: outName(f, 'mau-chu'), bytes: r.bytes }],
        note: r.changed ? `Đã đổi ${r.changed} lệnh màu chữ.` : 'Không tìm thấy chữ dạng vector để đổi màu (tệp có thể là bản scan — hãy dùng OCR trước).',
      };
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <LivePreview optionsKey={`${file.id}|${JSON.stringify(options)}`} build={async () => (await changeTextColor(file.buffer, options)).bytes} page={pages.pages[0] ?? 1} />
      )}
      panel={(file) => (
        <>
          <h3>Đổi màu chữ</h3>
          <ColorInput id="tc-color" label="Màu chữ mới" value={color} onChange={setColor} />
          <Toggle checked={onlyDark} onChange={setOnlyDark} label="Chỉ đổi chữ màu đen / xám đậm (giữ chữ màu khác)" />
          <Notice>Áp dụng cho chữ dạng vector (tệp xuất từ Word, Excel...). Bản scan không có chữ thật nên không đổi được.</Notice>
          <PagesField id="tc-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Đổi màu chữ" icon={<Type size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

