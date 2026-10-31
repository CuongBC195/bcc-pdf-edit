import React, { useState } from 'react';
import { FileBar, FileDrop, FileList, Notice, ToolLayout, ToolShell } from '../ui/components';
import type { LoadedFile, ToolFiles } from '../ui/useToolFiles';
import { parseRange } from '../ui/selection';

/**
 * Khung cho công cụ xử lý 1 tệp PDF: chưa có tệp -> vùng chọn tệp; có tệp -> thanh tệp + nội dung + bảng tùy chọn.
 */
export const SingleFileTool: React.FC<{
  toolId: string;
  files: ToolFiles;
  dropTitle?: string;
  main: (file: LoadedFile) => React.ReactNode;
  panel: (file: LoadedFile | null) => React.ReactNode;
}> = ({ toolId, files, dropTitle, main, panel }) => {
  const f = files.file;
  const ready = f && f.pageCount !== null && !f.error;
  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          f ? (
            <>
              <FileBar files={files} />
              {ready ? main(f) : null}
            </>
          ) : (
            <FileDrop files={files} title={dropTitle} />
          )
        }
        panel={panel(ready ? f : null)}
      />
    </ToolShell>
  );
};

/** Khung cho công cụ nhận nhiều tệp */
export const MultiFileTool: React.FC<{
  toolId: string;
  files: ToolFiles;
  dropTitle?: string;
  renderExtra?: (f: LoadedFile, index: number) => React.ReactNode;
  before?: React.ReactNode;
  panel: React.ReactNode;
}> = ({ toolId, files, dropTitle, renderExtra, before, panel }) => (
  <ToolShell toolId={toolId}>
    <ToolLayout
      main={
        <>
          {before}
          {files.files.length ? <FileList files={files} renderExtra={renderExtra} /> : <FileDrop files={files} title={dropTitle} />}
        </>
      }
      panel={panel}
    />
  </ToolShell>
);

/**
 * Ô nhập dải trang ("1-3, 5, 8-10") đồng bộ hai chiều với lựa chọn trên lưới.
 */
export const RangeInput: React.FC<{
  id: string;
  total: number;
  value: string;
  onApply: (pages: number[]) => void;
  placeholder?: string;
}> = ({ id, total, value, onApply, placeholder = 'Ví dụ: 1-3, 5, 8-10' }) => {
  // Đồng bộ lại ô nhập khi lựa chọn trên lưới thay đổi
  const [draft, setDraft] = useState({ base: value, text: value, error: undefined as string | undefined });
  const state = draft.base === value ? draft : { base: value, text: value, error: undefined };
  if (state !== draft) setDraft(state);
  const { text, error } = state;
  const setText = (t: string) => setDraft({ ...state, text: t });
  const apply = () => {
    const r = parseRange(text, total);
    setDraft({ ...state, error: r.error });
    if (!r.error) onApply(r.pages);
  };
  return (
    <div>
      <input
        id={id}
        className="pdft-input"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
        aria-invalid={!!error}
      />
      {error && (
        <div style={{ marginTop: 6 }}>
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </div>
  );
};
