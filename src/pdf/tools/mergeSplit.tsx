import React, { useMemo } from 'react';
import { Combine, FileArchive, Layers, Scissors, SplitSquareHorizontal } from 'lucide-react';
import { Link } from 'react-router';
import {
  alternateMerge,
  duplexCollate,
  extractPages,
  groupsEveryN,
  groupsFromCutPoints,
  groupsIntoParts,
  mergePdfs,
  overlayPdf,
  splitByGroups,
  type OutputFile,
} from '../core/ops';
import { buildZip } from '../core/download';
import { fileSignature } from '../core/fileStore';
import { extractBookmarks } from '../../services/thumbnailService';
import {
  Field,
  FileBar,
  FileDrop,
  Notice,
  NumberInput,
  ProcessButton,
  ResultPanel,
  Segmented,
  Toggle,
  ToolLayout,
  ToolShell,
} from '../ui/components';
import { PdfPageGrid, SelectionToolbar } from '../ui/PdfPageGrid';
import { pagesOf } from '../ui/gridItems';
import { useTask, useToolState } from '../ui/hooks';
import { useToolFiles } from '../ui/useToolFiles';
import { parseRange, usePageSelection } from '../ui/selection';
import { MultiFileTool, RangeInput, SingleFileTool } from './common';
import { outName } from './naming';
import { useAsyncResult } from '../ui/useAsyncResult';

const sanitizeName = (name: string, fallback: string) => {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return (cleaned || fallback).replace(/\.pdf$/i, '') + '.pdf';
};

// ---------------------------------------------------------------------------
// Gộp PDF
// ---------------------------------------------------------------------------
export const MergePdf: React.FC = () => {
  const toolId = 'merge-pdf';
  const files = useToolFiles(toolId, { multiple: true });
  const task = useTask();
  const [ranges, setRanges] = useToolState<Record<string, string>>(toolId, 'ranges', {});
  const [outputName, setOutputName] = useToolState(toolId, 'name', 'tai-lieu-da-gop');

  const errors = files.files.map((f) => (f.pageCount ? parseRange(ranges[fileSignature(f.file)] ?? '', f.pageCount).error : undefined));
  const totalPages = files.files.reduce((s, f, i) => {
    const r = parseRange(ranges[fileSignature(f.file)] ?? '', f.pageCount ?? 0);
    return s + (errors[i] ? 0 : r.pages.length || (f.pageCount ?? 0));
  }, 0);

  const run = () =>
    task.run(async () => [
      {
        name: sanitizeName(outputName, 'tai-lieu-da-gop'),
        bytes: await mergePdfs(
          files.files.map((f) => ({
            bytes: f.buffer,
            pages: parseRange(ranges[fileSignature(f.file)] ?? '', f.pageCount ?? 0).pages,
          }))
        ),
      },
    ]);

  return (
    <MultiFileTool
      toolId={toolId}
      files={files}
      dropTitle="Chọn hoặc kéo-thả các tệp PDF cần gộp"
      renderExtra={(f, i) =>
        f.pageCount ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              className="pdft-input pdft-input--sm"
              style={{ width: 150 }}
              placeholder="Tất cả trang"
              aria-label={`Dải trang của ${f.file.name}`}
              value={ranges[fileSignature(f.file)] ?? ''}
              onChange={(e) => setRanges((r) => ({ ...r, [fileSignature(f.file)]: e.target.value }))}
              aria-invalid={!!errors[i]}
            />
            {errors[i] && <span style={{ color: 'var(--accent-rose)' }}>{errors[i]}</span>}
          </span>
        ) : null
      }
      panel={
        <>
          <h3>Tùy chọn gộp</h3>
          <Notice>Kéo thả hoặc dùng mũi tên để đổi thứ tự tệp. Ô “Tất cả trang” cho phép chỉ lấy một số trang của từng tệp.</Notice>
          <Field label="Tên tệp kết quả" htmlFor="merge-name">
            <input id="merge-name" className="pdft-input" value={outputName} onChange={(e) => setOutputName(e.target.value)} />
          </Field>
          <ProcessButton
            task={task}
            label={files.files.length < 2 ? 'Cần ít nhất 2 tệp' : `Gộp ${files.files.length} tệp (${totalPages} trang)`}
            icon={<Combine size={18} />}
            disabled={files.files.length < 2 || errors.some(Boolean) || files.files.some((f) => !!f.error)}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      }
    />
  );
};

// ---------------------------------------------------------------------------
// Tách PDF
// ---------------------------------------------------------------------------
type SplitMode = 'cut' | 'ranges' | 'every' | 'parts' | 'each' | 'bookmarks';

interface SplitPlan {
  groups: number[][];
  names?: string[];
  error?: string;
}

function planSplit(
  mode: SplitMode,
  total: number,
  cutsAfter: number[],
  every: number,
  parts: number,
  rangesText: string,
  bookmarks: { title: string; pageNumber: number; level: number }[] | undefined
): SplitPlan {
  if (!total) return { groups: [] };
  switch (mode) {
    case 'cut':
      return { groups: groupsFromCutPoints(total, cutsAfter) };
    case 'every':
      return { groups: groupsEveryN(total, every) };
    case 'parts':
      return { groups: groupsIntoParts(total, parts) };
    case 'each':
      return { groups: groupsEveryN(total, 1) };
    case 'ranges': {
      const chunks = rangesText.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
      const groups: number[][] = [];
      for (const c of chunks) {
        const r = parseRange(c, total);
        if (r.error) return { groups: [], error: `“${c}”: ${r.error}` };
        groups.push(r.pages);
      }
      return { groups };
    }
    case 'bookmarks': {
      if (!bookmarks) return { groups: [] };
      if (!bookmarks.length) return { groups: [], error: 'Tệp này không có bookmark (mục lục).' };
      const starts = [...new Map(bookmarks.map((b) => [b.pageNumber, b])).values()].sort((a, b) => a.pageNumber - b.pageNumber);
      if (starts[0].pageNumber > 1) starts.unshift({ title: 'Phần đầu', pageNumber: 1, level: 0 });
      const groups = starts.map((b, i) => {
        const end = i + 1 < starts.length ? starts[i + 1].pageNumber - 1 : total;
        return Array.from({ length: end - b.pageNumber + 1 }, (_, k) => b.pageNumber + k);
      });
      const names = starts.map((b, i) => `${String(i + 1).padStart(2, '0')}_${b.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'Muc'}.pdf`);
      return { groups, names };
    }
  }
}

export const SplitPdf: React.FC = () => {
  const toolId = 'split-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [mode, setMode] = useToolState<SplitMode>(toolId, 'mode', 'cut');
  const [every, setEvery] = useToolState(toolId, 'every', 2);
  const [parts, setParts] = useToolState(toolId, 'parts', 2);
  const [rangesText, setRangesText] = useToolState(toolId, 'ranges', '');
  const cuts = usePageSelection(toolId, f, 'cuts');
  const { value: bookmarks } = useAsyncResult(f && mode === 'bookmarks' ? f.id : null, async () =>
    (await extractBookmarks(f!.buffer)).filter((b) => b.level === 0)
  );

  const plan = useMemo(
    () => planSplit(mode, total, cuts.sorted, every, parts, rangesText, bookmarks),
    [mode, total, cuts.sorted, every, parts, rangesText, bookmarks]
  );

  const run = () => {
    if (!f) return;
    task.run(async (report) => {
      report(null, `Đang tạo ${plan.groups.length} tệp...`);
      return splitByGroups(f.buffer, plan.groups, f.file.name.replace(/\.[^/.]+$/, ''), plan.names ? (_, i) => plan.names![i] : undefined);
    });
  };

  const groupBadge = useMemo(() => {
    const map = new Map<number, number>();
    plan.groups.forEach((g, i) => g.forEach((p) => map.set(p, i + 1)));
    return map;
  }, [plan.groups]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          {mode === 'cut' && (
            <Notice>
              Bấm vào trang để <strong>cắt sau trang đó</strong> (trang được chọn là trang cuối của mỗi tệp con). Shift + bấm để chọn
              nhiều trang. Nhấn Space để xem trước.
            </Notice>
          )}
          <div style={{ height: 12 }} />
          {mode === 'cut' && <SelectionToolbar total={total} selectedCount={cuts.selected.size} onSelect={cuts.setPages} />}
          <PdfPageGrid
            items={pagesOf(file.buffer, total, {
              badge: (p) => ({ text: `Tệp ${groupBadge.get(p) ?? '–'}`, tone: (groupBadge.get(p) ?? 0) % 2 ? 'cyan' : 'amber' }),
            })}
            selected={mode === 'cut' ? cuts.keys : undefined}
            onToggle={mode === 'cut' ? cuts.toggle : undefined}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Cách tách</h3>
          <Field label="Chế độ">
            <select id="split-mode" className="pdft-select" value={mode} onChange={(e) => setMode(e.target.value as SplitMode)}>
              <option value="cut">Chọn điểm cắt trên lưới trang</option>
              <option value="ranges">Theo dải trang tự nhập</option>
              <option value="every">Mỗi N trang một tệp</option>
              <option value="parts">Chia đều thành N tệp</option>
              <option value="each">Mỗi trang một tệp</option>
              <option value="bookmarks">Theo bookmark (mục lục)</option>
            </select>
          </Field>
          {mode === 'every' && (
            <Field label="Số trang mỗi tệp" htmlFor="split-every">
              <NumberInput id="split-every" value={every} min={1} max={Math.max(1, total)} onChange={setEvery} />
            </Field>
          )}
          {mode === 'parts' && (
            <Field label="Số tệp" htmlFor="split-parts">
              <NumberInput id="split-parts" value={parts} min={2} max={Math.max(2, total)} onChange={setParts} />
            </Field>
          )}
          {mode === 'ranges' && (
            <Field label="Dải trang (mỗi nhóm cách nhau bằng dấu ; hoặc xuống dòng)" htmlFor="split-ranges">
              <textarea
                id="split-ranges"
                className="pdft-input"
                rows={4}
                placeholder={'1-3; 4-10; 11, 13'}
                value={rangesText}
                onChange={(e) => setRangesText(e.target.value)}
              />
            </Field>
          )}
          {mode === 'bookmarks' && !bookmarks && file && <Notice>Đang đọc bookmark...</Notice>}
          {plan.error ? (
            <Notice kind="error">{plan.error}</Notice>
          ) : (
            file && (
              <Notice>
                Sẽ tạo <strong>{plan.groups.length}</strong> tệp.
              </Notice>
            )
          )}
          <ProcessButton
            task={task}
            label={`Tách thành ${plan.groups.length || '…'} tệp`}
            icon={<Scissors size={18} />}
            disabled={!file || !!plan.error || plan.groups.length < 1}
            onClick={run}
          />
          <ResultPanel task={task} zipName={file ? outName(file, 'tach', 'zip') : undefined} />
          <Notice>
            Cần đặt tên từng tệp, gán trang trực quan hay xuất theo thư mục? Dùng{' '}
            <Link to="/t/bcc-multi-split">Tách PDF hàng loạt</Link>.
          </Notice>
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Trích xuất trang
// ---------------------------------------------------------------------------
export const ExtractPages: React.FC = () => {
  const toolId = 'extract-pages';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const sel = usePageSelection(toolId, f);
  const [separate, setSeparate] = useToolState(toolId, 'separate', false);

  const run = () => {
    if (!f) return;
    task.run(async () => {
      if (separate) {
        return splitByGroups(f.buffer, sel.sorted.map((p) => [p]), f.file.name.replace(/\.[^/.]+$/, ''), (g) =>
          outName(f, `trang-${g[0]}`)
        );
      }
      return [{ name: outName(f, 'trich-xuat'), bytes: await extractPages(f.buffer, sel.sorted) }];
    });
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <SelectionToolbar total={total} selectedCount={sel.selected.size} onSelect={sel.setPages} />
          <PdfPageGrid items={pagesOf(file.buffer, total)} selected={sel.keys} onToggle={sel.toggle} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Trang cần lấy</h3>
          <Field label="Dải trang" htmlFor="extract-range" hint="Bấm chọn trên lưới hoặc nhập rồi nhấn Enter. Shift + bấm để chọn dải.">
            <RangeInput id="extract-range" total={total} value={sel.rangeText} onApply={sel.setPages} />
          </Field>
          <Toggle checked={separate} onChange={setSeparate} label="Mỗi trang thành một tệp riêng" />
          <ProcessButton
            task={task}
            label={`Trích xuất ${sel.selected.size} trang`}
            icon={<SplitSquareHorizontal size={18} />}
            disabled={!file || sel.selected.size === 0}
            onClick={run}
          />
          <ResultPanel task={task} zipName={file ? outName(file, 'trich-xuat', 'zip') : undefined} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Trộn xen kẽ
// ---------------------------------------------------------------------------
export const AlternateMerge: React.FC = () => {
  const toolId = 'alternate-merge';
  const files = useToolFiles(toolId, { multiple: true });
  const task = useTask();
  const [reversed, setReversed] = useToolState<Record<string, boolean>>(toolId, 'reversed', {});
  const [outputName, setOutputName] = useToolState(toolId, 'name', 'tron-xen-ke');

  const run = () =>
    task.run(async () => [
      {
        name: sanitizeName(outputName, 'tron-xen-ke'),
        bytes: await alternateMerge(files.files.map((f) => ({ bytes: f.buffer, reverse: !!reversed[fileSignature(f.file)] }))),
      },
    ]);

  return (
    <MultiFileTool
      toolId={toolId}
      files={files}
      dropTitle="Chọn 2 tệp PDF trở lên để trộn xen kẽ trang"
      renderExtra={(f) => (
        <label className="pdft-toggle" style={{ fontSize: '0.76rem' }}>
          <input
            type="checkbox"
            checked={!!reversed[fileSignature(f.file)]}
            onChange={(e) => setReversed((r) => ({ ...r, [fileSignature(f.file)]: e.target.checked }))}
          />
          <span>Đảo ngược thứ tự trang</span>
        </label>
      )}
      panel={
        <>
          <h3>Trộn xen kẽ</h3>
          <Notice>Lấy lần lượt trang 1 của từng tệp, rồi trang 2... (A1, B1, A2, B2...). Hữu ích khi scan mặt trước và mặt sau thành 2 tệp riêng.</Notice>
          <Field label="Tên tệp kết quả" htmlFor="alt-name">
            <input id="alt-name" className="pdft-input" value={outputName} onChange={(e) => setOutputName(e.target.value)} />
          </Field>
          <ProcessButton
            task={task}
            label={files.files.length < 2 ? 'Cần ít nhất 2 tệp' : 'Trộn xen kẽ'}
            icon={<Combine size={18} />}
            disabled={files.files.length < 2 || files.files.some((f) => !!f.error)}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      }
    />
  );
};

// ---------------------------------------------------------------------------
// Ghép bản scan 2 mặt
// ---------------------------------------------------------------------------
export const DuplexCollate: React.FC = () => {
  const toolId = 'duplex-collate';
  const fronts = useToolFiles(toolId);
  const backs = useToolFiles(toolId, { slot: 'backs' });
  const task = useTask();
  const [source, setSource] = useToolState<'one' | 'two'>(toolId, 'source', 'one');
  const [reverseBacks, setReverseBacks] = useToolState(toolId, 'reverse', true);
  const f = fronts.file;
  const b = backs.file;
  const oddError = source === 'one' && f?.pageCount && f.pageCount % 2 !== 0 ? `Tệp có ${f.pageCount} trang (số lẻ), không chia đều được mặt trước/mặt sau.` : null;

  const run = () => {
    if (!f) return;
    task.run(async () => [
      {
        name: outName(f, 'hai-mat'),
        bytes: await duplexCollate(f.buffer, { reverseBacks, backsInput: source === 'two' ? b?.buffer : undefined }),
      },
    ]);
  };

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          <>
            <Segmented
              label="Nguồn bản scan"
              value={source}
              onChange={setSource}
              options={[
                { value: 'one', label: '1 tệp (mặt trước rồi mặt sau)' },
                { value: 'two', label: '2 tệp riêng' },
              ]}
            />
            <div style={{ height: 14 }} />
            <h3 style={{ fontSize: '0.9rem', margin: '0 0 8px' }}>{source === 'one' ? 'Tệp scan' : 'Tệp mặt trước'}</h3>
            {f ? <FileBar files={fronts} /> : <FileDrop files={fronts} title={source === 'one' ? 'Chọn tệp scan' : 'Chọn tệp mặt trước'} />}
            {source === 'two' && (
              <>
                <h3 style={{ fontSize: '0.9rem', margin: '16px 0 8px' }}>Tệp mặt sau</h3>
                {b ? <FileBar files={backs} /> : <FileDrop files={backs} title="Chọn tệp mặt sau" />}
              </>
            )}
          </>
        }
        panel={
          <>
            <h3>Tùy chọn</h3>
            <Notice>
              Máy scan 1 mặt: scan cả xấp mặt trước, lật xấp giấy rồi scan mặt sau. Công cụ sẽ sắp lại đúng thứ tự trang 1, 2, 3...
            </Notice>
            <Toggle checked={reverseBacks} onChange={setReverseBacks} label="Mặt sau bị ngược thứ tự (lật cả xấp)" />
            {oddError && <Notice kind="error">{oddError}</Notice>}
            <ProcessButton
              task={task}
              label="Ghép 2 mặt"
              icon={<Layers size={18} />}
              disabled={!f || !!f.error || !!oddError || (source === 'two' && (!b || !!b.error))}
              onClick={run}
            />
            <ResultPanel task={task} />
          </>
        }
      />
    </ToolShell>
  );
};

// ---------------------------------------------------------------------------
// Chồng lớp PDF
// ---------------------------------------------------------------------------
export const OverlayPdf: React.FC = () => {
  const toolId = 'overlay-pdf';
  const base = useToolFiles(toolId, { slot: 'base-file-input' });
  const overlay = useToolFiles(toolId, { slot: 'overlay-file-input' });
  const task = useTask();
  const [position, setPosition] = useToolState<'over' | 'under'>(toolId, 'position', 'over');
  const [repeat, setRepeat] = useToolState<'first' | 'match' | 'cycle'>(toolId, 'repeat', 'first');
  const [fit, setFit] = useToolState<'fit' | 'stretch'>(toolId, 'fit', 'fit');
  const [rangeText, setRangeText] = useToolState(toolId, 'range', '');
  const bf = base.file;
  const of = overlay.file;
  const range = parseRange(rangeText, bf?.pageCount ?? 0);

  const run = () => {
    if (!bf || !of) return;
    task.run(async () => [
      { name: outName(bf, 'chong-lop'), bytes: await overlayPdf(bf.buffer, of.buffer, { position, repeat, fit, pages: range.pages }) },
    ]);
  };

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          <>
            <h3 style={{ fontSize: '0.9rem', margin: '0 0 8px' }}>Tệp gốc</h3>
            {bf ? <FileBar files={base} /> : <FileDrop files={base} title="Chọn tệp PDF gốc" />}
            <h3 style={{ fontSize: '0.9rem', margin: '16px 0 8px' }}>Tệp chồng lên (mẫu tiêu đề, khung, dấu...)</h3>
            {of ? <FileBar files={overlay} /> : <FileDrop files={overlay} title="Chọn tệp PDF làm lớp phủ" />}
          </>
        }
        panel={
          <>
            <h3>Tùy chọn</h3>
            <Field label="Vị trí lớp phủ">
              <Segmented
                label="Vị trí lớp phủ"
                value={position}
                onChange={setPosition}
                options={[
                  { value: 'over', label: 'Đè lên trên' },
                  { value: 'under', label: 'Nằm dưới (nền)' },
                ]}
              />
            </Field>
            <Field label="Trang của tệp phủ dùng cho">
              <select className="pdft-select" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} aria-label="Cách lặp trang phủ">
                <option value="first">Trang 1 cho mọi trang</option>
                <option value="match">Trang tương ứng (1→1, 2→2...)</option>
                <option value="cycle">Lặp vòng các trang phủ</option>
              </select>
            </Field>
            <Field label="Co giãn lớp phủ">
              <Segmented
                label="Co giãn"
                value={fit}
                onChange={setFit}
                options={[
                  { value: 'fit', label: 'Giữ tỉ lệ' },
                  { value: 'stretch', label: 'Kéo giãn kín trang' },
                ]}
              />
            </Field>
            <Field label="Áp dụng cho trang (để trống = tất cả)" htmlFor="overlay-range">
              <input id="overlay-range" className="pdft-input" value={rangeText} placeholder="Ví dụ: 1, 3-5" onChange={(e) => setRangeText(e.target.value)} />
            </Field>
            {range.error && <Notice kind="error">{range.error}</Notice>}
            {position === 'under' && (
              <Notice>Trang gốc là ảnh scan (nền trắng đục) sẽ che mất lớp nền. Khi đó hãy chọn “Đè lên trên”.</Notice>
            )}
            <ProcessButton
              task={task}
              label="Chồng lớp"
              icon={<Layers size={18} />}
              disabled={!bf || !of || !!bf.error || !!of.error || !!range.error}
              onClick={run}
            />
            <ResultPanel task={task} />
          </>
        }
      />
    </ToolShell>
  );
};

// ---------------------------------------------------------------------------
// Nén nhiều PDF thành ZIP
// ---------------------------------------------------------------------------
export const PdfToZip: React.FC = () => {
  const toolId = 'pdf-to-zip';
  const files = useToolFiles(toolId, { multiple: true });
  const task = useTask();
  const [zipName, setZipName] = useToolState(toolId, 'name', 'tai-lieu');

  const run = () =>
    task.run(async (report) => {
      const blob = await buildZip(
        files.files.map((f): OutputFile => ({ name: f.file.name, bytes: new Uint8Array(f.buffer) })),
        (p) => report(p, `Đang nén ${p}%...`)
      );
      const name = (zipName.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'tai-lieu').replace(/\.zip$/i, '') + '.zip';
      return [{ name, bytes: new Uint8Array(await blob.arrayBuffer()) }];
    });

  return (
    <MultiFileTool
      toolId={toolId}
      files={files}
      dropTitle="Chọn các tệp PDF cần đóng gói"
      panel={
        <>
          <h3>Đóng gói ZIP</h3>
          <Field label="Tên tệp ZIP" htmlFor="zip-name">
            <input id="zip-name" className="pdft-input" value={zipName} onChange={(e) => setZipName(e.target.value)} />
          </Field>
          <ProcessButton
            task={task}
            label={`Đóng gói ${files.files.length} tệp`}
            icon={<FileArchive size={18} />}
            disabled={!files.files.length}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      }
    />
  );
};
