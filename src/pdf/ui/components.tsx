import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  FileArchive,
  GripVertical,
  Info,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { HubShell } from '../../hub/HubShell';
import { ToolPageHeader } from '../../tools/ToolPageHeader';
import { loadRecentFiles, storedToFile, type RecentFile } from '../core/fileStore';
import { buildZip, downloadOutput, formatBytes, triggerDownload } from '../core/download';
import { getCachedThumbnail, getThumbnail } from '../core/render';
import { PAPER_SIZES, type Orientation, type PaperId } from '../core/paper';
import type { OutputFile } from '../core/ops';
import type { LoadedFile, ToolFiles } from './useToolFiles';
import type { TaskState } from './hooks';
import './pdfTools.css';

// ---------------------------------------------------------------------------
// Khung trang
// ---------------------------------------------------------------------------

export const ToolShell: React.FC<{ toolId: string; children: React.ReactNode }> = ({ toolId, children }) => (
  <HubShell>
    <ToolPageHeader toolId={toolId} />
    {children}
  </HubShell>
);

export const ToolLayout: React.FC<{ main: React.ReactNode; panel?: React.ReactNode }> = ({ main, panel }) => (
  <div className={`pdft-layout ${panel ? '' : 'pdft-layout--single'}`}>
    <div className="bento-card pdft-main">{main}</div>
    {panel && <aside className="bento-card pdft-panel">{panel}</aside>}
  </div>
);

// ---------------------------------------------------------------------------
// Ảnh thu nhỏ (vẽ khi cuộn tới)
// ---------------------------------------------------------------------------

export const Thumbnail: React.FC<{
  buffer: ArrayBuffer;
  page: number;
  width?: number;
  rotation?: number;
  alt?: string;
}> = ({ buffer, page, width = 140, rotation = 0, alt }) => {
  const ref = useRef<HTMLDivElement>(null);
  const key = `${page}@${width}`;
  const [loaded, setLoaded] = useState<{ buffer: ArrayBuffer; key: string; src?: string; failed?: boolean } | null>(null);
  const cached = getCachedThumbnail(buffer, page, width);
  const current = loaded && loaded.buffer === buffer && loaded.key === key ? loaded : null;
  const src = cached ?? current?.src;
  const failed = !src && !!current?.failed;

  useEffect(() => {
    if (getCachedThumbnail(buffer, page, width)) return;
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        getThumbnail(buffer, page, width)
          .then((url) => !cancelled && setLoaded({ buffer, key: `${page}@${width}`, src: url }))
          .catch(() => !cancelled && setLoaded({ buffer, key: `${page}@${width}`, failed: true }));
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [buffer, page, width]);

  return (
    <div ref={ref} className="pdft-page__frame">
      {src ? (
        <img src={src} alt={alt ?? `Trang ${page}`} style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }} draggable={false} />
      ) : failed ? (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Lỗi hiển thị</span>
      ) : (
        <Loader2 size={18} className="spin" style={{ color: 'var(--accent-cyan)', animation: 'spin 0.9s linear infinite' }} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chọn tệp
// ---------------------------------------------------------------------------

interface FileDropProps {
  files: ToolFiles;
  title?: string;
  hint?: string;
  compact?: boolean;
}

export const FileDrop: React.FC<FileDropProps> = ({ files, title, hint, compact }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [recent, setRecent] = useState<RecentFile[]>([]);

  useEffect(() => {
    if (compact) return;
    let cancelled = false;
    loadRecentFiles(files.accept, 6).then((list) => !cancelled && setRecent(list));
    return () => {
      cancelled = true;
    };
  }, [files.accept, compact]);

  const open = () => inputRef.current?.click();
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={files.accept}
      multiple={files.multiple}
      className="pdft-sr-only"
      tabIndex={-1}
      onChange={(e) => {
        if (e.target.files?.length) files.addFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <>
        {input}
        <button type="button" className="btn btn-secondary btn-sm" onClick={open}>
          <Upload size={14} />
          <span>{files.multiple ? 'Thêm tệp' : 'Đổi tệp'}</span>
        </button>
      </>
    );
  }

  return (
    <div>
      {input}
      <div
        role="button"
        tabIndex={0}
        className={`pdft-drop ${over ? 'is-over' : ''}`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) files.addFiles(e.dataTransfer.files);
        }}
      >
        <i className="ph ph-file-arrow-up pdft-drop__icon" aria-hidden="true" />
        <div className="pdft-drop__title">{title ?? (files.multiple ? 'Chọn hoặc kéo-thả các tệp PDF' : 'Chọn hoặc kéo-thả tệp PDF')}</div>
        <div className="pdft-drop__hint">
          {hint ?? 'Tệp được xử lý ngay trên trình duyệt, không tải lên máy chủ. Lần sau mở lại vẫn còn.'}
        </div>
        {files.loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={16} style={{ animation: 'spin 0.9s linear infinite' }} /> Đang đọc tệp...
          </div>
        )}
      </div>
      {recent.length > 0 && (
        <div className="pdft-recent">
          <span>Tệp gần đây:</span>
          {recent.map((r) => (
            <button
              key={r.sig}
              type="button"
              className="pdft-chip"
              title={`Mở ${r.name}`}
              onClick={() => files.addFiles([storedToFile(r)])}
            >
              <span>{r.name}</span>
              <small>{formatBytes(r.size)}</small>
            </button>
          ))}
        </div>
      )}
      {files.rejected && (
        <div className="pdft-notice pdft-notice--error" style={{ marginTop: 12 }}>
          <AlertTriangle size={16} />
          <span>{files.rejected}</span>
        </div>
      )}
    </div>
  );
};

/** Thanh tệp đang mở (chế độ 1 tệp) */
export const FileBar: React.FC<{ files: ToolFiles; extra?: React.ReactNode }> = ({ files, extra }) => {
  const f = files.file;
  if (!f) return null;
  return (
    <>
      {files.restored && (
        <div className="pdft-notice pdft-notice--success" style={{ marginBottom: 10 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>Đã mở lại tệp lần trước.</strong> Bấm “Đổi tệp” để chọn tệp khác.
          </span>
          <button type="button" className="pdft-icon-btn" aria-label="Ẩn thông báo" onClick={files.dismissRestored}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="pdft-filebar">
        <i className="ph ph-file-pdf" style={{ fontSize: '1.5rem', color: 'var(--accent-rose)' }} aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <div className="pdft-filebar__name">{f.file.name}</div>
          <div className="pdft-filebar__meta">
            {formatBytes(f.file.size)}
            {f.pageCount !== null && ` • ${f.pageCount} trang`}
          </div>
        </div>
        <div className="pdft-filebar__actions">
          {extra}
          <FileDrop files={files} compact />
          <button type="button" className="btn btn-ghost btn-sm" onClick={files.clear}>
            <X size={14} />
            <span>Đóng tệp</span>
          </button>
        </div>
      </div>
      {f.error && (
        <div className="pdft-notice pdft-notice--error" style={{ marginBottom: 12 }}>
          <AlertTriangle size={16} />
          <span>{f.error}</span>
        </div>
      )}
    </>
  );
};

/** Danh sách nhiều tệp: kéo thả / mũi tên để sắp xếp */
export const FileList: React.FC<{
  files: ToolFiles;
  renderExtra?: (f: LoadedFile, index: number) => React.ReactNode;
}> = ({ files, renderExtra }) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  return (
    <div className="pdft-files">
      {files.restored && (
        <div className="pdft-notice pdft-notice--success">
          <CheckCircle2 size={16} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <strong>Đã mở lại {files.files.length} tệp lần trước.</strong>
          </span>
          <button type="button" className="pdft-icon-btn" aria-label="Ẩn thông báo" onClick={files.dismissRestored}>
            <X size={14} />
          </button>
        </div>
      )}
      {files.files.map((f, i) => (
        <div
          key={f.id}
          className={`pdft-file ${dragIndex === i ? 'is-dragging' : ''} ${overIndex === i && dragIndex !== i ? 'is-drop-target' : ''}`}
          draggable
          onDragStart={(e) => {
            setDragIndex(i);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) files.moveFile(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
        >
          <span className="pdft-file__handle" aria-hidden="true">
            <GripVertical size={16} />
          </span>
          <div className="pdft-file__thumb">
            {f.pageCount ? <Thumbnail buffer={f.buffer} page={1} width={42} /> : <i className="ph ph-file" />}
          </div>
          <div className="pdft-file__info">
            <div className="pdft-file__name" title={f.file.name}>
              {i + 1}. {f.file.name}
            </div>
            <div className="pdft-file__meta">
              <span>{formatBytes(f.file.size)}</span>
              {f.pageCount !== null && <span>{f.pageCount} trang</span>}
              {f.error && <span style={{ color: 'var(--accent-rose)' }}>{f.error}</span>}
              {renderExtra?.(f, i)}
            </div>
          </div>
          <div className="pdft-file__actions">
            <button type="button" className="pdft-icon-btn" aria-label="Lên trên" disabled={i === 0} onClick={() => files.moveFile(i, i - 1)}>
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              className="pdft-icon-btn"
              aria-label="Xuống dưới"
              disabled={i === files.files.length - 1}
              onClick={() => files.moveFile(i, i + 1)}
            >
              <ArrowDown size={14} />
            </button>
            <button type="button" className="pdft-icon-btn pdft-icon-btn--danger" aria-label={`Bỏ tệp ${f.file.name}`} onClick={() => files.removeFile(f.id)}>
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <div className="pdft-toolbar" style={{ marginTop: 4, marginBottom: 0 }}>
        <FileDrop files={files} compact />
        {files.files.length > 1 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => files.setOrder([...files.files].sort((a, b) => a.file.name.localeCompare(b.file.name, 'vi', { numeric: true })))}
          >
            Sắp xếp theo tên
          </button>
        )}
        <span className="pdft-toolbar__spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={files.clear}>
          <X size={14} />
          <span>Bỏ tất cả</span>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Điều khiển
// ---------------------------------------------------------------------------

export const Field: React.FC<{ label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }> = ({
  label,
  hint,
  htmlFor,
  children,
}) => (
  <div className="pdft-field">
    {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="pdft-field__label">{label}</span>}
    {children}
    {hint && <small>{hint}</small>}
  </div>
);

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="pdft-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="pdft-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);

export const NumberInput: React.FC<{
  id?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  'aria-label'?: string;
}> = ({ id, value, onChange, min, max, step = 1, ...rest }) => (
  <input
    id={id}
    className="pdft-input"
    type="number"
    inputMode="decimal"
    value={Number.isFinite(value) ? value : ''}
    min={min}
    max={max}
    step={step}
    aria-label={rest['aria-label']}
    onChange={(e) => {
      const v = parseFloat(e.target.value);
      if (Number.isNaN(v)) return;
      onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
    }}
  />
);

export type PaperChoice = PaperId | 'auto';

export const PaperPicker: React.FC<{
  id: string;
  value: PaperChoice;
  onChange: (v: PaperChoice) => void;
  allowAuto?: boolean;
  autoLabel?: string;
}> = ({ id, value, onChange, allowAuto, autoLabel = 'Tự động (theo trang gốc)' }) => (
  <select id={id} className="pdft-select" value={value} onChange={(e) => onChange(e.target.value as PaperChoice)}>
    {allowAuto && <option value="auto">{autoLabel}</option>}
    {PAPER_SIZES.map((p) => (
      <option key={p.id} value={p.id}>
        {p.label}
      </option>
    ))}
  </select>
);

export const OrientationPicker: React.FC<{ value: Orientation; onChange: (v: Orientation) => void }> = ({ value, onChange }) => (
  <Segmented
    label="Hướng giấy"
    value={value}
    onChange={onChange}
    options={[
      { value: 'portrait', label: 'Dọc' },
      { value: 'landscape', label: 'Ngang' },
    ]}
  />
);

export const Notice: React.FC<{ kind?: 'info' | 'success' | 'error'; children: React.ReactNode }> = ({ kind = 'info', children }) => {
  const Icon = kind === 'error' ? AlertTriangle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`pdft-notice pdft-notice--${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Nút xử lý + kết quả
// ---------------------------------------------------------------------------

export const ProcessButton: React.FC<{
  task: TaskState;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}> = ({ task, disabled, onClick, label, icon }) => (
  <div className="pdft-actions">
    <button type="button" className="btn btn-primary btn-lg" disabled={disabled || task.busy} onClick={onClick}>
      {task.busy ? <Loader2 size={18} style={{ animation: 'spin 0.9s linear infinite' }} /> : icon}
      <span>{task.busy ? task.message || 'Đang xử lý...' : label}</span>
    </button>
    {task.busy && task.progress !== null && (
      <div className="pdft-progress" role="progressbar" aria-valuenow={task.progress} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${task.progress}%` }} />
      </div>
    )}
    {task.error && <Notice kind="error">{task.error}</Notice>}
  </div>
);

export const ResultPanel: React.FC<{
  task: TaskState;
  zipName?: string;
  onReset?: () => void;
}> = ({ task, zipName = 'ket-qua.zip', onReset }) => {
  const [zipping, setZipping] = useState(false);
  if (!task.outputs.length) return null;
  const total = task.outputs.reduce((s, f) => s + f.bytes.byteLength, 0);
  const single = task.outputs.length === 1;
  const downloadZip = async () => {
    setZipping(true);
    try {
      triggerDownload(await buildZip(task.outputs as OutputFile[]), zipName);
    } finally {
      setZipping(false);
    }
  };
  return (
    <div className="pdft-results" aria-live="polite">
      <Notice kind="success">
        <strong>Xong!</strong> {single ? '1 tệp' : `${task.outputs.length} tệp`} • {formatBytes(total)}
        {task.note && <div>{task.note}</div>}
      </Notice>
      {single ? (
        <button type="button" className="btn btn-success btn-lg" onClick={() => downloadOutput(task.outputs[0])}>
          <Download size={18} />
          <span>Tải xuống</span>
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-success btn-lg" disabled={zipping} onClick={downloadZip}>
            {zipping ? <Loader2 size={18} style={{ animation: 'spin 0.9s linear infinite' }} /> : <FileArchive size={18} />}
            <span>Tải tất cả (.zip)</span>
          </button>
          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {task.outputs.map((f, i) => (
              <div key={`${f.name}-${i}`} className="pdft-result">
                <span title={f.name}>{f.name}</span>
                <small>{formatBytes(f.bytes.byteLength)}</small>
                <button type="button" className="pdft-icon-btn" aria-label={`Tải ${f.name}`} onClick={() => downloadOutput(f)}>
                  <Download size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {onReset && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
          <RefreshCw size={14} />
          <span>Làm lại</span>
        </button>
      )}
    </div>
  );
};
