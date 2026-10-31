import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Copy,
  FilePlus2,
  FileStack,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Scissors,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  combineSinglePage,
  composePages,
  deletePages,
  dividePages,
  insertBlankPages,
  reversePages,
  rotateCustom,
  rotatePages,
  type BlankPosition,
  type PageRef,
} from '../core/ops';
import { fileSignature } from '../core/fileStore';
import { getPaper, paperDims, type PaperId } from '../core/paper';
import { inkRatio, renderPageToCanvas } from '../core/render';
import {
  Field,
  FileList,
  FileDrop,
  FileBar,
  Notice,
  NumberInput,
  ProcessButton,
  ResultPanel,
  Segmented,
  Thumbnail,
  Toggle,
  ToolLayout,
  ToolShell,
} from '../ui/components';
import { PdfPageGrid, SelectionToolbar, type GridItem } from '../ui/PdfPageGrid';
import { pagesOf } from '../ui/gridItems';
import { useTask, useToolState } from '../ui/hooks';
import { useToolFiles } from '../ui/useToolFiles';
import { fileScope, usePageSelection } from '../ui/selection';
import { RangeInput, SingleFileTool } from './common';
import { outName } from './naming';
import { useAsyncResult } from '../ui/useAsyncResult';

// ---------------------------------------------------------------------------
// Trình sửa trang (Sắp xếp PDF / Bộ công cụ trang đa năng)
// ---------------------------------------------------------------------------
interface EditorPage {
  key: string;
  /** Chữ ký tệp nguồn; null = trang trắng */
  src: string | null;
  page: number;
  rotation: number;
  blank?: [number, number];
}

interface EditorState {
  pages: EditorPage[];
  /** Các tệp đã được đưa vào danh sách (để không tự thêm lại khi người dùng xóa hết trang của tệp đó) */
  known: string[];
}

let keySeq = 0;
const newKey = () => `p${Date.now().toString(36)}${(keySeq++).toString(36)}`;
const FILE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const PageEditor: React.FC<{ toolId: string; multiple: boolean }> = ({ toolId, multiple }) => {
  const files = useToolFiles(toolId, { multiple });
  const task = useTask();
  const [state, setState] = useToolState<EditorState>(toolId, 'editor', { pages: [], known: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<EditorState[]>([]);

  const ready = useMemo(() => files.files.filter((f) => f.pageCount && !f.error), [files.files]);
  const bySig = useMemo(() => new Map(ready.map((f) => [fileSignature(f.file), f])), [ready]);
  const letterOf = useMemo(() => new Map(ready.map((f, i) => [fileSignature(f.file), FILE_LETTERS[i % 26]])), [ready]);

  // Đồng bộ danh sách trang với danh sách tệp
  useEffect(() => {
    if (files.loading) return;
    setState((prev) => {
      const sigs = new Set(bySig.keys());
      let pages = prev.pages.filter((p) => p.src === null || sigs.has(p.src));
      const known = prev.known.filter((s) => sigs.has(s));
      let changed = pages.length !== prev.pages.length || known.length !== prev.known.length;
      for (const [sig, f] of bySig) {
        if (known.includes(sig)) continue;
        known.push(sig);
        pages = [...pages, ...Array.from({ length: f.pageCount! }, (_, i) => ({ key: newKey(), src: sig, page: i + 1, rotation: 0 }))];
        changed = true;
      }
      // Không còn tệp nào -> bỏ cả trang trắng
      if (!sigs.size && pages.length) {
        pages = [];
        changed = true;
      }
      return changed ? { pages, known } : prev;
    });
  }, [bySig, files.loading, setState]);

  const update = (fn: (pages: EditorPage[]) => EditorPage[]) => {
    setHistory((h) => [...h.slice(-30), state]);
    setState((prev) => ({ ...prev, pages: fn(prev.pages) }));
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setState(last);
  };

  const targets = (pages: EditorPage[]) => (selected.size ? pages.filter((p) => selected.has(p.key)) : pages);
  const rotate = (delta: number, only?: string) =>
    update((pages) => {
      const ids = new Set(only ? [only] : targets(pages).map((p) => p.key));
      return pages.map((p) => (ids.has(p.key) ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 } : p));
    });
  const remove = (only?: string) => {
    update((pages) => {
      const ids = new Set(only ? [only] : [...selected]);
      return pages.filter((p) => !ids.has(p.key));
    });
    setSelected(new Set());
  };
  const duplicate = () =>
    update((pages) => pages.flatMap((p) => (selected.has(p.key) ? [p, { ...p, key: newKey() }] : [p])));
  const insertBlank = () =>
    update((pages) => {
      const lastSel = pages.map((p, i) => (selected.has(p.key) ? i : -1)).filter((i) => i >= 0).pop();
      const at = lastSel === undefined ? pages.length : lastSel + 1;
      const blank: EditorPage = { key: newKey(), src: null, page: 0, rotation: 0, blank: paperDims('A4', 'portrait') };
      return [...pages.slice(0, at), blank, ...pages.slice(at)];
    });
  const reverse = () => update((pages) => [...pages].reverse());
  const resetAll = () => {
    update(() =>
      [...bySig.entries()].flatMap(([sig, f]) =>
        Array.from({ length: f.pageCount! }, (_, i) => ({ key: newKey(), src: sig, page: i + 1, rotation: 0 }))
      )
    );
    setSelected(new Set());
  };

  const items: GridItem[] = state.pages.map((p, i) => {
    const f = p.src ? bySig.get(p.src) : undefined;
    return {
      key: p.key,
      buffer: f?.buffer ?? null,
      page: p.page,
      sourcePageCount: f?.pageCount ?? 1,
      rotation: p.rotation,
      label: f ? `${i + 1} · tr.${p.page}` : `${i + 1} · trắng`,
      badge: multiple && p.src ? { text: letterOf.get(p.src) ?? '?', tone: 'cyan' } : undefined,
    };
  });

  const exportPages = (onlySelected: boolean) => {
    const sigs = [...bySig.keys()];
    const list = onlySelected ? state.pages.filter((p) => selected.has(p.key)) : state.pages;
    const refs: PageRef[] = list.map((p) => ({
      source: p.src ? sigs.indexOf(p.src) : 0,
      page: p.src ? p.page : null,
      rotation: p.rotation,
      blankSize: p.blank,
    }));
    const first = ready[0];
    task.run(async () => [
      {
        name: first ? outName(first, onlySelected ? 'trang-da-chon' : multiple ? 'da-sua' : 'da-sap-xep') : 'tai-lieu.pdf',
        bytes: await composePages(
          sigs.map((s) => bySig.get(s)!.buffer),
          refs
        ),
      },
    ]);
  };

  const main = (
    <>
      {multiple ? (
        files.files.length ? <FileList files={files} /> : <FileDrop files={files} title="Chọn một hoặc nhiều tệp PDF" />
      ) : files.file ? (
        <FileBar files={files} />
      ) : (
        <FileDrop files={files} />
      )}
      {state.pages.length > 0 && (
        <>
          <div style={{ height: 14 }} />
          <div className="pdft-toolbar">
            <strong style={{ color: 'var(--text-main)' }}>
              {state.pages.length} trang{selected.size ? ` • đã chọn ${selected.size}` : ''}
            </strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(state.pages.map((p) => p.key)))}>
              Chọn hết
            </button>
            {selected.size > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
                Bỏ chọn
              </button>
            )}
            <span className="pdft-toolbar__spacer" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => rotate(-90)} title="Xoay trái các trang đã chọn (hoặc tất cả)">
              <RotateCcw size={14} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => rotate(90)} title="Xoay phải các trang đã chọn (hoặc tất cả)">
              <RotateCw size={14} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!selected.size} onClick={duplicate} title="Nhân bản trang đã chọn">
              <Copy size={14} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={insertBlank} title="Chèn trang trắng sau trang chọn cuối (hoặc cuối tài liệu)">
              <FilePlus2 size={14} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={reverse} title="Đảo ngược thứ tự">
              <ArrowDownUp size={14} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!selected.size} onClick={() => remove()} title="Xóa trang đã chọn">
              <Trash2 size={14} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!history.length} onClick={undo} title="Hoàn tác">
              <Undo2 size={14} />
            </button>
          </div>
          <PdfPageGrid
            items={items}
            selected={selected}
            onToggle={(key, range) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (range) range.forEach((k) => next.add(k));
                else if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
            onReorder={(from, to) =>
              update((pages) => {
                const next = [...pages];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              })
            }
            onRotate={(key) => rotate(90, key)}
            onDelete={(key) => remove(key)}
          />
        </>
      )}
    </>
  );

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={main}
        panel={
          <>
            <h3>{multiple ? 'Sửa trang nhiều tệp' : 'Sắp xếp trang'}</h3>
            <Notice>
              Kéo thả để đổi thứ tự. Bấm để chọn (Shift + bấm chọn dải), Space để xem trước. Mọi thay đổi được lưu tự động, quay lại vẫn còn.
            </Notice>
            <ProcessButton
              task={task}
              label={`Xuất PDF (${state.pages.length} trang)`}
              icon={<FileStack size={18} />}
              disabled={!state.pages.length || !ready.length}
              onClick={() => exportPages(false)}
            />
            {selected.size > 0 && (
              <button type="button" className="btn btn-secondary" disabled={task.busy} onClick={() => exportPages(true)}>
                <Scissors size={16} />
                <span>Chỉ xuất {selected.size} trang đã chọn</span>
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll} disabled={!ready.length}>
              <RotateCcw size={14} />
              <span>Khôi phục thứ tự gốc</span>
            </button>
            <ResultPanel task={task} />
          </>
        }
      />
    </ToolShell>
  );
};

export const OrganizePdf: React.FC = () => <PageEditor toolId="organize-pdf" multiple={false} />;
export const PdfMultiTool: React.FC = () => <PageEditor toolId="pdf-multi-tool" multiple />;

// ---------------------------------------------------------------------------
// Xóa trang
// ---------------------------------------------------------------------------
export const DeletePages: React.FC = () => {
  const toolId = 'delete-pages';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const sel = usePageSelection(toolId, f);

  const run = () => {
    if (!f) return;
    task.run(async () => [{ name: outName(f, 'da-xoa-trang'), bytes: await deletePages(f.buffer, sel.sorted) }]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <SelectionToolbar total={total} selectedCount={sel.selected.size} onSelect={sel.setPages} />
          <PdfPageGrid items={pagesOf(file.buffer, total, { marked: sel.selected })} selected={sel.keys} onToggle={sel.toggle} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Trang cần xóa</h3>
          <Field label="Dải trang" htmlFor="delete-range" hint="Bấm trang trên lưới để đánh dấu xóa, hoặc nhập rồi nhấn Enter.">
            <RangeInput id="delete-range" total={total} value={sel.rangeText} onApply={sel.setPages} />
          </Field>
          {file && sel.selected.size >= total && <Notice kind="error">Không thể xóa toàn bộ trang.</Notice>}
          <ProcessButton
            task={task}
            label={`Xóa ${sel.selected.size} trang`}
            icon={<Trash2 size={18} />}
            disabled={!file || !sel.selected.size || sel.selected.size >= total}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Chèn trang trắng
// ---------------------------------------------------------------------------
type BlankKind = BlankPosition['kind'];

export const AddBlankPage: React.FC = () => {
  const toolId = 'add-blank-page';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [kind, setKind] = useToolState<BlankKind>(toolId, 'kind', 'after');
  const [page, setPage] = useToolState(toolId, 'page', 1, fileScope(f));
  const [step, setStep] = useToolState(toolId, 'step', 1);
  const [count, setCount] = useToolState(toolId, 'count', 1);
  const [size, setSize] = useToolState<'same' | PaperId>(toolId, 'size', 'same');
  const safePage = Math.min(Math.max(1, page), Math.max(1, total));

  const position: BlankPosition =
    kind === 'after' || kind === 'before' ? { kind, page: safePage } : kind === 'every' ? { kind, step } : { kind };

  const run = () => {
    if (!f) return;
    const dims = size === 'same' ? undefined : (paperDims(size, 'portrait') as [number, number]);
    task.run(async () => [{ name: outName(f, 'them-trang-trang'), bytes: await insertBlankPages(f.buffer, { position, count, size: dims }) }]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          {(kind === 'after' || kind === 'before') && <Notice>Bấm vào một trang để chọn vị trí chèn.</Notice>}
          <div style={{ height: 12 }} />
          <PdfPageGrid
            items={pagesOf(file.buffer, total, {
              badge: (p) =>
                (kind === 'after' || kind === 'before') && p === safePage
                  ? { text: kind === 'after' ? 'Chèn sau' : 'Chèn trước', tone: 'amber' }
                  : kind === 'every' && p % step === 0
                    ? { text: 'Chèn sau', tone: 'amber' }
                    : undefined,
            })}
            selected={kind === 'after' || kind === 'before' ? new Set([String(safePage)]) : undefined}
            onToggle={(key) => {
              setPage(Number(key));
              if (kind !== 'after' && kind !== 'before') setKind('after');
            }}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Chèn trang trắng</h3>
          <Field label="Vị trí">
            <select className="pdft-select" aria-label="Vị trí chèn" value={kind} onChange={(e) => setKind(e.target.value as BlankKind)}>
              <option value="after">Sau trang được chọn</option>
              <option value="before">Trước trang được chọn</option>
              <option value="start">Đầu tài liệu</option>
              <option value="end">Cuối tài liệu</option>
              <option value="every">Sau mỗi N trang</option>
            </select>
          </Field>
          {(kind === 'after' || kind === 'before') && (
            <Field label="Trang" htmlFor="blank-page">
              <NumberInput id="blank-page" value={safePage} min={1} max={Math.max(1, total)} onChange={setPage} />
            </Field>
          )}
          {kind === 'every' && (
            <Field label="Mỗi N trang" htmlFor="blank-step" hint="Ví dụ 1 = xen trang trắng sau mỗi trang (in 1 mặt thành 2 mặt).">
              <NumberInput id="blank-step" value={step} min={1} max={Math.max(1, total)} onChange={setStep} />
            </Field>
          )}
          <Field label="Số trang trắng mỗi lần chèn" htmlFor="blank-count">
            <NumberInput id="blank-count" value={count} min={1} max={100} onChange={setCount} />
          </Field>
          <Field label="Khổ giấy">
            <select className="pdft-select" aria-label="Khổ giấy trang trắng" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
              <option value="same">Giống trang bên cạnh</option>
              {(['A4', 'A3', 'A5', 'Letter', 'Legal'] as PaperId[]).map((id) => (
                <option key={id} value={id}>
                  {getPaper(id).label}
                </option>
              ))}
            </select>
          </Field>
          <ProcessButton task={task} label="Chèn trang trắng" icon={<FilePlus2 size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Xóa trang trắng tự động
// ---------------------------------------------------------------------------
export const RemoveBlankPages: React.FC = () => {
  const toolId = 'remove-blank-pages';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [threshold, setThreshold] = useToolState(toolId, 'threshold', 0.5);
  const [overrides, setOverrides] = useToolState<Record<number, boolean>>(toolId, 'overrides', {}, fileScope(f));
  const { value: ratios, progress } = useAsyncResult(f?.pageCount ? f.id : null, async (report, isCancelled) => {
    const result: Record<number, number> = {};
    const count = f!.pageCount!;
    for (let p = 1; p <= count; p++) {
      if (isCancelled()) break;
      try {
        const { canvas } = await renderPageToCanvas(f!.buffer, p, 160);
        result[p] = inkRatio(canvas) * 100;
      } catch {
        result[p] = 100;
      }
      report(Math.round((p / count) * 100));
    }
    return result;
  });

  const blank = useMemo(() => {
    const set = new Set<number>();
    if (!ratios) return set;
    for (let p = 1; p <= total; p++) {
      const auto = (ratios[p] ?? 100) <= threshold;
      const v = overrides[p] ?? auto;
      if (v) set.add(p);
    }
    return set;
  }, [ratios, threshold, overrides, total]);

  const run = () => {
    if (!f) return;
    task.run(async () => [{ name: outName(f, 'bo-trang-trang'), bytes: await deletePages(f.buffer, [...blank]) }]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          {!ratios && (
            <div style={{ marginBottom: 12 }}>
              <Notice>Đang phân tích trang... {progress ?? 0}%</Notice>
            </div>
          )}
          {ratios && (
            <Notice>
              Phát hiện <strong>{blank.size}</strong> trang trắng (viền đỏ). Bấm vào trang để đổi: giữ lại / xóa.
            </Notice>
          )}
          <div style={{ height: 12 }} />
          <PdfPageGrid
            items={pagesOf(file.buffer, total, {
              marked: blank,
              badge: (p) => (ratios ? { text: `${(ratios[p] ?? 0).toFixed(1)}% mực`, tone: blank.has(p) ? 'rose' : 'cyan' } : undefined),
            })}
            onToggle={(key) => {
              const p = Number(key);
              setOverrides((o) => ({ ...o, [p]: !blank.has(p) }));
            }}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Nhận diện trang trắng</h3>
          <Field
            label={`Ngưỡng mực: ≤ ${threshold.toFixed(1)}%`}
            htmlFor="blank-threshold"
            hint="Trang có tỉ lệ điểm ảnh có mực nhỏ hơn ngưỡng được coi là trắng. Tăng nếu bản scan có nhiều hạt nhiễu."
          >
            <input
              id="blank-threshold"
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
            />
          </Field>
          {Object.keys(overrides).length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOverrides({})}>
              Bỏ các chỉnh tay ({Object.keys(overrides).length})
            </button>
          )}
          {file && blank.size >= total && <Notice kind="error">Tất cả trang đều bị coi là trắng — hãy giảm ngưỡng.</Notice>}
          <ProcessButton
            task={task}
            label={ratios ? `Xóa ${blank.size} trang trắng` : 'Đang phân tích...'}
            icon={<ScanSearch size={18} />}
            disabled={!file || !ratios || !blank.size || blank.size >= total}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Đảo ngược thứ tự trang
// ---------------------------------------------------------------------------
export const ReversePages: React.FC = () => {
  const toolId = 'reverse-pages';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const run = () => {
    if (!f) return;
    task.run(async () => [{ name: outName(f, 'dao-nguoc'), bytes: await reversePages(f.buffer) }]);
  };
  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <Notice>Xem trước thứ tự sau khi đảo:</Notice>
          <div style={{ height: 12 }} />
          <PdfPageGrid items={pagesOf(file.buffer, total).reverse().map((it, i) => ({ ...it, label: `${i + 1} ← tr.${it.page}` }))} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Đảo ngược thứ tự</h3>
          <Notice>Trang cuối thành trang đầu. Hữu ích khi máy scan nạp giấy ngược.</Notice>
          <ProcessButton task={task} label="Đảo ngược" icon={<ArrowDownUp size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Xoay trang (bội số 90°)
// ---------------------------------------------------------------------------
export const RotatePdf: React.FC = () => {
  const toolId = 'rotate-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const sel = usePageSelection(toolId, f);
  const [rotations, setRotations] = useToolState<Record<number, number>>(toolId, 'rotations', {}, fileScope(f));

  const rotate = (delta: number, pages?: number[]) => {
    const list = pages ?? (sel.selected.size ? sel.sorted : Array.from({ length: total }, (_, i) => i + 1));
    setRotations((r) => {
      const next = { ...r };
      list.forEach((p) => (next[p] = ((((next[p] ?? 0) + delta) % 360) + 360) % 360));
      return next;
    });
  };
  const changed = Object.values(rotations).filter((v) => v % 360).length;

  const run = () => {
    if (!f) return;
    task.run(async () => [{ name: outName(f, 'da-xoay'), bytes: await rotatePages(f.buffer, rotations) }]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <SelectionToolbar total={total} selectedCount={sel.selected.size} onSelect={sel.setPages}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => rotate(-90)}>
              <RotateCcw size={14} />
              <span>Trái</span>
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => rotate(90)}>
              <RotateCw size={14} />
              <span>Phải</span>
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => rotate(180)}>
              180°
            </button>
          </SelectionToolbar>
          <PdfPageGrid
            items={pagesOf(file.buffer, total, {
              rotations,
              badge: (p) => (rotations[p] ? { text: `${rotations[p]}°`, tone: 'amber' } : undefined),
            })}
            selected={sel.keys}
            onToggle={sel.toggle}
            onRotate={(key) => rotate(90, [Number(key)])}
          />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Xoay trang</h3>
          <Notice>Chọn trang rồi bấm Trái/Phải (không chọn = xoay tất cả). Di chuột lên trang để xoay riêng từng trang.</Notice>
          {changed > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRotations({})}>
              <Undo2 size={14} />
              <span>Đặt lại ({changed} trang)</span>
            </button>
          )}
          <ProcessButton task={task} label={`Lưu ${changed} trang đã xoay`} icon={<RotateCw size={18} />} disabled={!file || !changed} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Xoay góc tùy ý
// ---------------------------------------------------------------------------
export const RotateCustom: React.FC = () => {
  const toolId = 'rotate-custom';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [angle, setAngle] = useToolState(toolId, 'angle', 1);
  const [keepSize, setKeepSize] = useToolState(toolId, 'keep', true);
  const sel = usePageSelection(toolId, f);
  const previewPage = sel.sorted[0] ?? 1;

  const run = () => {
    if (!f) return;
    task.run(async () => [{ name: outName(f, `xoay-${angle}do`), bytes: await rotateCustom(f.buffer, { angle, keepSize, pages: sel.sorted }) }]);
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <div className="pdft-preview" style={{ marginBottom: 14 }}>
            <div style={{ width: 280, transform: `rotate(${angle}deg) scale(${keepSize ? 0.92 : 1})`, transition: 'transform 0.15s' }}>
              <Thumbnail buffer={file.buffer} page={previewPage} width={280} />
            </div>
          </div>
          <SelectionToolbar total={total} selectedCount={sel.selected.size} onSelect={sel.setPages} />
          <PdfPageGrid items={pagesOf(file.buffer, total)} selected={sel.keys} onToggle={sel.toggle} thumbWidth={110} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Góc xoay</h3>
          <Field label={`Góc: ${angle}° (dương = theo chiều kim đồng hồ)`} htmlFor="rot-angle">
            <input
              id="rot-angle"
              type="range"
              min={-45}
              max={45}
              step={0.1}
              value={Math.max(-45, Math.min(45, angle))}
              onChange={(e) => setAngle(parseFloat(e.target.value))}
            />
            <NumberInput value={angle} min={-180} max={180} step={0.1} onChange={setAngle} aria-label="Góc xoay (độ)" />
          </Field>
          <Toggle checked={keepSize} onChange={setKeepSize} label="Giữ nguyên khổ giấy (thu nhỏ nội dung cho vừa)" />
          <Notice>{sel.selected.size ? `Áp dụng cho ${sel.selected.size} trang đã chọn.` : 'Không chọn trang = áp dụng cho tất cả.'}</Notice>
          <ProcessButton task={task} label="Xoay" icon={<RotateCw size={18} />} disabled={!file || angle % 360 === 0} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Chia trang
// ---------------------------------------------------------------------------
export const DividePages: React.FC = () => {
  const toolId = 'divide-pages';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [direction, setDirection] = useToolState<'vertical' | 'horizontal'>(toolId, 'dir', 'vertical');
  const [parts, setParts] = useToolState(toolId, 'parts', 2);
  const [reverseOrder, setReverseOrder] = useToolState(toolId, 'reverse', false);
  const sel = usePageSelection(toolId, f);

  const run = () => {
    if (!f) return;
    task.run(async () => [
      { name: outName(f, 'chia-trang'), bytes: await dividePages(f.buffer, { direction, parts, reverseOrder, pages: sel.sorted }) },
    ]);
  };

  const lines = Array.from({ length: parts - 1 }, (_, i) => ((i + 1) / parts) * 100);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <div className="pdft-preview" style={{ marginBottom: 14 }}>
            <div style={{ position: 'relative', width: 260 }}>
              <Thumbnail buffer={file.buffer} page={sel.sorted[0] ?? 1} width={260} />
              {lines.map((pct) => (
                <div
                  key={pct}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    ...(direction === 'vertical'
                      ? { left: `${pct}%`, top: 0, bottom: 0, borderLeft: '2px dashed #f43f5e' }
                      : { top: `${pct}%`, left: 0, right: 0, borderTop: '2px dashed #f43f5e' }),
                  }}
                />
              ))}
            </div>
          </div>
          <SelectionToolbar total={total} selectedCount={sel.selected.size} onSelect={sel.setPages} />
          <PdfPageGrid items={pagesOf(file.buffer, total)} selected={sel.keys} onToggle={sel.toggle} thumbWidth={110} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Chia mỗi trang</h3>
          <Field label="Đường chia">
            <Segmented
              label="Đường chia"
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'vertical', label: 'Dọc (trái | phải)' },
                { value: 'horizontal', label: 'Ngang (trên / dưới)' },
              ]}
            />
          </Field>
          <Field label="Số phần" htmlFor="div-parts">
            <NumberInput id="div-parts" value={parts} min={2} max={10} onChange={(v) => setParts(Math.round(v))} />
          </Field>
          <Toggle checked={reverseOrder} onChange={setReverseOrder} label="Đảo thứ tự các phần (đọc phải sang trái)" />
          <Notice>{sel.selected.size ? `Chỉ chia ${sel.selected.size} trang đã chọn.` : 'Không chọn trang = chia tất cả.'} Hữu ích khi scan trang A3 chứa 2 trang A4.</Notice>
          <ProcessButton task={task} label="Chia trang" icon={<Scissors size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Ghép thành 1 trang dài
// ---------------------------------------------------------------------------
export const CombineSinglePage: React.FC = () => {
  const toolId = 'combine-single-page';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [direction, setDirection] = useToolState<'vertical' | 'horizontal'>(toolId, 'dir', 'vertical');
  const [gap, setGap] = useToolState(toolId, 'gap', 0);
  const [separator, setSeparator] = useToolState(toolId, 'sep', false);

  const run = () => {
    if (!f) return;
    task.run(async () => {
      const { bytes, scaled } = await combineSinglePage(f.buffer, { direction, gapMm: gap, separator });
      return {
        outputs: [{ name: outName(f, 'mot-trang'), bytes }],
        note: scaled ? 'Tài liệu quá dài so với giới hạn khổ trang PDF (5 m) nên đã được thu nhỏ cho vừa.' : undefined,
      };
    });
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => <PdfPageGrid items={pagesOf(file.buffer, total)} thumbWidth={110} />}
      panel={(file) => (
        <>
          <h3>Ghép thành 1 trang</h3>
          <Field label="Hướng ghép">
            <Segmented
              label="Hướng ghép"
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'vertical', label: 'Từ trên xuống' },
                { value: 'horizontal', label: 'Từ trái sang' },
              ]}
            />
          </Field>
          <Field label="Khoảng cách giữa các trang (mm)" htmlFor="comb-gap">
            <NumberInput id="comb-gap" value={gap} min={0} max={100} onChange={setGap} />
          </Field>
          <Toggle checked={separator} onChange={setSeparator} label="Kẻ đường phân cách" />
          <ProcessButton task={task} label={`Ghép ${total} trang`} icon={<FileStack size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};
