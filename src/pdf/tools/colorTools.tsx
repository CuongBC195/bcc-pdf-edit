import React from 'react';
import { Contrast, Droplet, ScanLine, SunMoon } from 'lucide-react';
import {
  adjustFilter,
  grayscaleFilter,
  invertFilter,
  invertLightnessFilter,
  rasterizePdf,
  scannerFilter,
  thresholdFilter,
  tiltCanvas,
  type ColorAdjust,
} from '../core/raster';
import { Field, Notice, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { LivePreview } from '../ui/LivePreview';
import { useTask, useToolState } from '../ui/hooks';
import { useToolFiles } from '../ui/useToolFiles';
import { parseRange } from '../ui/selection';
import { SingleFileTool } from './common';
import { outName } from './naming';

const DpiField: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <Field label="Độ nét (DPI)">
    <Segmented
      label="Độ nét"
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={[
        { value: '120', label: '120 (Nhẹ)' },
        { value: '150', label: '150 (Chuẩn)' },
        { value: '220', label: '220 (Nét)' },
      ]}
    />
  </Field>
);

const PagesField: React.FC<{ id: string; value: string; onChange: (v: string) => void; total: number }> = ({ id, value, onChange, total }) => {
  const r = parseRange(value, total);
  return (
    <Field label="Áp dụng cho trang (để trống = tất cả)" htmlFor={id}>
      <input id={id} className="pdft-input" value={value} placeholder="Ví dụ: 1-5" onChange={(e) => onChange(e.target.value)} />
      {r.error && <Notice kind="error">{r.error}</Notice>}
    </Field>
  );
};

// ---------------------------------------------------------------------------
// Đảo màu (invert-colors)
// ---------------------------------------------------------------------------
export const InvertColors: React.FC = () => {
  const toolId = 'invert-colors';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [mode, setMode] = useToolState<'lightness' | 'full'>(toolId, 'mode', 'lightness');
  const [dpi, setDpi] = useToolState(toolId, 'dpi', 150);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);
  const filter = mode === 'lightness' ? invertLightnessFilter : invertFilter;
  const firstPage = pages.pages[0] ?? 1;

  const run = () =>
    f &&
    task.run(async (report) => [
      {
        name: outName(f, 'dao-mau'),
        bytes: await rasterizePdf(f.buffer, {
          dpi,
          format: 'jpeg',
          quality: 0.85,
          pages: pages.pages,
          filter,
          onProgress: (d, t) => report(Math.round((d / t) * 100), `Đang xử lý trang ${d}/${t}...`),
        }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <LivePreview
          optionsKey={`${file.id}|${mode}|${firstPage}`}
          build={() => rasterizePdf(file.buffer, { dpi: 72, format: 'jpeg', quality: 0.8, pages: [firstPage], filter })}
          page={firstPage}
        />
      )}
      panel={(file) => (
        <>
          <h3>Đảo màu trang</h3>
          <Field label="Chế độ">
            <Segmented
              label="Chế độ đảo màu"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'lightness', label: 'Chế độ tối (giữ màu)' },
                { value: 'full', label: 'Đảo toàn bộ RGB' },
              ]}
            />
          </Field>
          <Notice>
            {mode === 'lightness'
              ? 'Đổi nền sáng thành tối nhưng giữ nguyên sắc độ của hình và chữ màu — phù hợp để đọc ban đêm.'
              : 'Đảo ngược hoàn toàn giá trị màu RGB (âm bản).'}
          </Notice>
          <DpiField value={dpi} onChange={setDpi} />
          <PagesField id="inv-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Đảo màu PDF" icon={<SunMoon size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Chỉnh màu (adjust-colors)
// ---------------------------------------------------------------------------
const DEFAULT_ADJUST: ColorAdjust = { brightness: 0, contrast: 10, saturation: 0, gamma: 1 };

export const AdjustColors: React.FC = () => {
  const toolId = 'adjust-colors';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [adj, setAdj] = useToolState<ColorAdjust>(toolId, 'adj', DEFAULT_ADJUST);
  const [dpi, setDpi] = useToolState(toolId, 'dpi', 150);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);
  const firstPage = pages.pages[0] ?? 1;
  const filter = adjustFilter(adj);

  const run = () =>
    f &&
    task.run(async (report) => [
      {
        name: outName(f, 'chinh-mau'),
        bytes: await rasterizePdf(f.buffer, {
          dpi,
          format: 'jpeg',
          quality: 0.86,
          pages: pages.pages,
          filter,
          onProgress: (d, t) => report(Math.round((d / t) * 100), `Đang xử lý trang ${d}/${t}...`),
        }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <LivePreview
          optionsKey={`${file.id}|${JSON.stringify(adj)}|${firstPage}`}
          build={() => rasterizePdf(file.buffer, { dpi: 72, format: 'jpeg', quality: 0.8, pages: [firstPage], filter })}
          page={firstPage}
        />
      )}
      panel={(file) => (
        <>
          <h3>Chỉnh độ sáng & tương phản</h3>
          <Field label={`Độ sáng: ${adj.brightness > 0 ? `+${adj.brightness}` : adj.brightness}`} htmlFor="adj-b">
            <input id="adj-b" type="range" min={-80} max={80} value={adj.brightness} onChange={(e) => setAdj({ ...adj, brightness: Number(e.target.value) })} />
          </Field>
          <Field label={`Độ tương phản: ${adj.contrast > 0 ? `+${adj.contrast}` : adj.contrast}`} htmlFor="adj-c">
            <input id="adj-c" type="range" min={-80} max={80} value={adj.contrast} onChange={(e) => setAdj({ ...adj, contrast: Number(e.target.value) })} />
          </Field>
          <Field label={`Độ bão hòa màu: ${adj.saturation > 0 ? `+${adj.saturation}` : adj.saturation}`} htmlFor="adj-s">
            <input id="adj-s" type="range" min={-100} max={100} value={adj.saturation} onChange={(e) => setAdj({ ...adj, saturation: Number(e.target.value) })} />
          </Field>
          <Field label={`Gamma: ${adj.gamma.toFixed(2)}`} htmlFor="adj-g">
            <input id="adj-g" type="range" min={0.4} max={2.5} step={0.05} value={adj.gamma} onChange={(e) => setAdj({ ...adj, gamma: Number(e.target.value) })} />
          </Field>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdj(DEFAULT_ADJUST)}>
            Đặt lại mặc định
          </button>
          <DpiField value={dpi} onChange={setDpi} />
          <PagesField id="adj-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Áp dụng chỉnh màu" icon={<Contrast size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Hiệu ứng máy scan (scanner-effect)
// ---------------------------------------------------------------------------
export const ScannerEffect: React.FC = () => {
  const toolId = 'scanner-effect';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [grayscale, setGrayscale] = useToolState(toolId, 'gray', false);
  const [noise, setNoise] = useToolState(toolId, 'noise', 18);
  const [tint, setTint] = useToolState(toolId, 'tint', 10);
  const [tilt, setTilt] = useToolState(toolId, 'tilt', 0.6);
  const [blur, setBlur] = useToolState(toolId, 'blur', 0.3);
  const [dpi, setDpi] = useToolState(toolId, 'dpi', 150);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);
  const firstPage = pages.pages[0] ?? 1;

  const filter = scannerFilter({ grayscale, noise, tint });
  const postProcess = tilt !== 0 || blur > 0 ? tiltCanvas(tilt, blur) : undefined;

  const run = () =>
    f &&
    task.run(async (report) => [
      {
        name: outName(f, 'ban-scan'),
        bytes: await rasterizePdf(f.buffer, {
          dpi,
          format: 'jpeg',
          quality: 0.78,
          pages: pages.pages,
          filter,
          postProcess,
          onProgress: (d, t) => report(Math.round((d / t) * 100), `Đang tạo hiệu ứng trang ${d}/${t}...`),
        }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <LivePreview
          optionsKey={`${file.id}|${grayscale}|${noise}|${tint}|${tilt}|${blur}|${firstPage}`}
          build={() => rasterizePdf(file.buffer, { dpi: 72, format: 'jpeg', quality: 0.78, pages: [firstPage], filter, postProcess })}
          page={firstPage}
        />
      )}
      panel={(file) => (
        <>
          <h3>Hiệu ứng bản scan</h3>
          <Toggle checked={grayscale} onChange={setGrayscale} label="Scan trắng đen (thang xám)" />
          <Field label={`Độ hạt giấy (nhiễu): ${noise}`} htmlFor="sc-noise">
            <input id="sc-noise" type="range" min={0} max={50} value={noise} onChange={(e) => setNoise(Number(e.target.value))} />
          </Field>
          <Field label={`Độ ngả vàng giấy: ${tint}`} htmlFor="sc-tint">
            <input id="sc-tint" type="range" min={0} max={35} value={tint} onChange={(e) => setTint(Number(e.target.value))} />
          </Field>
          <Field label={`Độ lệch trang: ${tilt.toFixed(1)}°`} htmlFor="sc-tilt">
            <input id="sc-tilt" type="range" min={-2.5} max={2.5} step={0.1} value={tilt} onChange={(e) => setTilt(Number(e.target.value))} />
          </Field>
          <Field label={`Độ nhòe quang học: ${blur.toFixed(1)} px`} htmlFor="sc-blur">
            <input id="sc-blur" type="range" min={0} max={1.5} step={0.1} value={blur} onChange={(e) => setBlur(Number(e.target.value))} />
          </Field>
          <DpiField value={dpi} onChange={setDpi} />
          <PagesField id="sc-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Tạo bản scan" icon={<ScanLine size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Sang thang xám / đen trắng (pdf-to-greyscale)
// ---------------------------------------------------------------------------
export const PdfToGreyscale: React.FC = () => {
  const toolId = 'pdf-to-greyscale';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [mode, setMode] = useToolState<'gray' | 'bw'>(toolId, 'mode', 'gray');
  const [threshold, setThreshold] = useToolState(toolId, 'threshold', 180);
  const [dpi, setDpi] = useToolState(toolId, 'dpi', 150);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);
  const firstPage = pages.pages[0] ?? 1;
  const filter = mode === 'gray' ? grayscaleFilter : thresholdFilter(threshold);

  const run = () =>
    f &&
    task.run(async (report) => [
      {
        name: outName(f, 'trang-den'),
        bytes: await rasterizePdf(f.buffer, {
          dpi,
          format: 'jpeg',
          quality: 0.84,
          pages: pages.pages,
          filter,
          onProgress: (d, t) => report(Math.round((d / t) * 100), `Đang chuyển trang ${d}/${t}...`),
        }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <LivePreview
          optionsKey={`${file.id}|${mode}|${threshold}|${firstPage}`}
          build={() => rasterizePdf(file.buffer, { dpi: 72, format: 'jpeg', quality: 0.8, pages: [firstPage], filter })}
          page={firstPage}
        />
      )}
      panel={(file) => (
        <>
          <h3>Chuyển sang trắng đen</h3>
          <Field label="Kiểu chuyển">
            <Segmented
              label="Kiểu chuyển"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'gray', label: 'Thang xám (êm dịu)' },
                { value: 'bw', label: 'Đen trắng rõ nét' },
              ]}
            />
          </Field>
          {mode === 'bw' && (
            <Field label={`Ngưỡng đen/trắng: ${threshold}`} htmlFor="bw-th">
              <input id="bw-th" type="range" min={60} max={235} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </Field>
          )}
          <Notice>Phù hợp để in máy in trắng đen hoặc làm rõ chữ trên bản chụp điện thoại.</Notice>
          <DpiField value={dpi} onChange={setDpi} />
          <PagesField id="gr-range" value={range} onChange={setRange} total={total} />
          <ProcessButton task={task} label="Chuyển sang trắng đen" icon={<Droplet size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

