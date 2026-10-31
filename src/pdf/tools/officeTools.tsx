import React, { useState } from 'react';
import { Briefcase, FileSpreadsheet, FileText, Presentation, Upload } from 'lucide-react';
import { baseName, formatBytes } from '../core/download';
import type { FontFamily } from '../core/fonts';
import {
  convertDocxToPdf,
  convertExcelToPdf,
  convertOdfToPdf,
  convertPdfToDocx,
  convertPdfToXlsx,
  convertPptxToPdf,
} from '../core/office';
import type { OutputFile } from '../core/ops';
import { PAPER_SIZES, type Orientation, type PaperId } from '../core/paper';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented, Toggle, ToolLayout, ToolShell } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';

// ---------------------------------------------------------------------------
// Khung chung cho nhóm Tài liệu Văn phòng -> PDF
// ---------------------------------------------------------------------------
type OfficeInputKind = 'docx' | 'xlsx' | 'pptx' | 'odt' | 'ods' | 'odp' | 'odg';

const OfficeToPdfWorkspace: React.FC<{
  toolId: string;
  kind: OfficeInputKind;
  accept: string;
  dropTitle: string;
  defaultOrient?: Orientation;
}> = ({ toolId, kind, accept, dropTitle, defaultOrient = 'portrait' }) => {
  const task = useTask();
  const [loadedFiles, setLoadedFiles] = useState<{ name: string; size: number; buffer: ArrayBuffer }[]>([]);
  const [paper, setPaper] = useToolState<PaperId>(toolId, 'paper', 'A4');
  const [orient, setOrient] = useToolState<Orientation>(toolId, 'orient', defaultOrient);
  const [family, setFamily] = useToolState<FontFamily>(toolId, 'family', 'sans');
  const [fontSize, setFontSize] = useToolState(toolId, 'size', 11);

  const onPickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const next: { name: string; size: number; buffer: ArrayBuffer }[] = [];
    for (const f of Array.from(list)) {
      next.push({ name: f.name, size: f.size, buffer: await f.arrayBuffer() });
    }
    setLoadedFiles((prev) => [...prev, ...next]);
  };

  const run = () =>
    task.run(async (report) => {
      const outputs: OutputFile[] = [];
      for (let i = 0; i < loadedFiles.length; i++) {
        const f = loadedFiles[i];
        report(Math.round(((i + 1) / loadedFiles.length) * 100), `Đang chuyển đổi ${f.name}...`);
        const layout = { paper, orientation: orient, family, fontSize, title: baseName(f.name) };
        let bytes: Uint8Array;
        switch (kind) {
          case 'docx':
            bytes = await convertDocxToPdf(f.buffer, layout);
            break;
          case 'xlsx':
            bytes = await convertExcelToPdf(f.buffer, f.name, layout);
            break;
          case 'pptx':
            bytes = await convertPptxToPdf(f.buffer, family);
            break;
          case 'odt':
          case 'ods':
          case 'odp':
          case 'odg':
            bytes = await convertOdfToPdf(f.buffer, kind, layout);
            break;
        }
        outputs.push({ name: `${baseName(f.name)}.pdf`, bytes });
      }
      return outputs;
    });

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          <div>
            <div className="pdft-bar" style={{ marginBottom: 12 }}>
              <strong>{loadedFiles.length} tệp đã chọn</strong>
              <div className="pdft-bar__spacer" />
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={15} /> + Thêm tệp
                <input type="file" accept={accept} multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
              </label>
              {loadedFiles.length > 0 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLoadedFiles([])}>
                  Xóa hết
                </button>
              )}
            </div>
            {loadedFiles.length === 0 ? (
              <label className="pdft-drop" style={{ cursor: 'pointer' }}>
                {kind === 'pptx' || kind === 'odp' ? <Presentation size={36} /> : <Briefcase size={36} />}
                <div className="pdft-drop__title">{dropTitle}</div>
                <div className="pdft-drop__sub">Xử lý trực tiếp trên trình duyệt — hỗ trợ chọn nhiều tệp cùng lúc.</div>
                <input type="file" accept={accept} multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
              </label>
            ) : (
              <div className="pdft-files">
                {loadedFiles.map((f, i) => (
                  <div key={i} className="pdft-file" style={{ gridTemplateColumns: '1fr auto' }}>
                    <div>
                      <strong>{f.name}</strong>
                      <div className="pdft-file__meta">{formatBytes(f.size)}</div>
                    </div>
                    <button
                      type="button"
                      className="pdft-icon-btn pdft-icon-btn--danger"
                      onClick={() => setLoadedFiles(loadedFiles.filter((_, k) => k !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
        panel={
          <>
            <h3>Tùy chọn xuất PDF</h3>
            {kind !== 'pptx' && (
              <>
                <Field label="Khổ giấy" htmlFor={`${toolId}-paper`}>
                  <select
                    id={`${toolId}-paper`}
                    className="pdft-select"
                    value={paper}
                    onChange={(e) => setPaper(e.target.value as PaperId)}
                  >
                    {PAPER_SIZES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Hướng giấy">
                  <Segmented
                    label="Hướng giấy"
                    value={orient}
                    onChange={setOrient}
                    options={[
                      { value: 'portrait', label: 'Khổ dọc' },
                      { value: 'landscape', label: 'Khổ ngang' },
                    ]}
                  />
                </Field>
                <Field label="Cỡ chữ (pt)" htmlFor={`${toolId}-size`}>
                  <NumberInput id={`${toolId}-size`} value={fontSize} min={8} max={20} onChange={setFontSize} />
                </Field>
              </>
            )}
            <Field label="Phông chữ tiếng Việt">
              <Segmented
                label="Phông chữ"
                value={family}
                onChange={setFamily}
                options={[
                  { value: 'sans', label: 'Không chân' },
                  { value: 'serif', label: 'Có chân (Times)' },
                ]}
              />
            </Field>
            <ProcessButton
              task={task}
              label="Chuyển sang PDF"
              icon={<FileText size={18} />}
              disabled={loadedFiles.length === 0}
              onClick={run}
            />
            <ResultPanel task={task} zipName="van-phong-sang-pdf.zip" />
          </>
        }
      />
    </ToolShell>
  );
};

export const WordToPdf: React.FC = () => (
  <OfficeToPdfWorkspace
    toolId="word-to-pdf"
    kind="docx"
    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    dropTitle="Chọn tệp Microsoft Word (.docx)"
  />
);

export const ExcelToPdf: React.FC = () => (
  <OfficeToPdfWorkspace
    toolId="excel-to-pdf"
    kind="xlsx"
    accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    dropTitle="Chọn tệp bảng tính Microsoft Excel (.xlsx, .csv)"
    defaultOrient="landscape"
  />
);

export const PowerpointToPdf: React.FC = () => (
  <OfficeToPdfWorkspace
    toolId="powerpoint-to-pdf"
    kind="pptx"
    accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
    dropTitle="Chọn bài trình chiếu Microsoft PowerPoint (.pptx)"
    defaultOrient="landscape"
  />
);

export const OdtToPdf: React.FC = () => (
  <OfficeToPdfWorkspace
    toolId="odt-to-pdf"
    kind="odt"
    accept=".odt,application/vnd.oasis.opendocument.text"
    dropTitle="Chọn tệp văn bản OpenDocument (.odt)"
  />
);

export const OdsToPdf: React.FC = () => (
  <OfficeToPdfWorkspace
    toolId="ods-to-pdf"
    kind="ods"
    accept=".ods,application/vnd.oasis.opendocument.spreadsheet"
    dropTitle="Chọn bảng tính OpenDocument (.ods)"
    defaultOrient="landscape"
  />
);

export const OdpToPdf: React.FC = () => (
  <OfficeToPdfWorkspace
    toolId="odp-to-pdf"
    kind="odp"
    accept=".odp,application/vnd.oasis.opendocument.presentation"
    dropTitle="Chọn bài trình chiếu OpenDocument (.odp)"
    defaultOrient="landscape"
  />
);

export const OdgToPdf: React.FC = () => (
  <OfficeToPdfWorkspace
    toolId="odg-to-pdf"
    kind="odg"
    accept=".odg,application/vnd.oasis.opendocument.graphics"
    dropTitle="Chọn bản vẽ OpenDocument (.odg)"
  />
);

// ---------------------------------------------------------------------------
// PDF -> Word (.docx)
// ---------------------------------------------------------------------------
export const PdfToWord: React.FC = () => {
  const toolId = 'pdf-to-word';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [pageBreaks, setPageBreaks] = useToolState(toolId, 'breaks', true);

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: `${baseName(f.file.name)}.docx`,
        bytes: await convertPdfToDocx(f.buffer, pageBreaks),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Trích xuất toàn bộ đoạn văn, tiêu đề và bảng biểu trong PDF sang tệp Microsoft Word <strong>.docx</strong> chuẩn Unicode tiếng Việt, mở trực tiếp bằng Word hoặc Google Docs.
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>PDF sang Word (.DOCX)</h3>
          <Toggle checked={pageBreaks} onChange={setPageBreaks} label="Giữ ngắt trang theo đúng trang PDF gốc" />
          <ProcessButton task={task} label="Tạo tệp Word (.docx)" icon={<FileText size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// PDF -> Excel (.xlsx)
// ---------------------------------------------------------------------------
export const PdfToExcel: React.FC = () => {
  const toolId = 'pdf-to-excel';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [sheetPerPage, setSheetPerPage] = useToolState(toolId, 'sheetPerPage', false);

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: `${baseName(f.file.name)}.xlsx`,
        bytes: await convertPdfToXlsx(f.buffer, sheetPerPage),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Nhận diện các cột và bảng số liệu trên trang PDF để dựng thành tệp bảng tính Microsoft Excel <strong>.xlsx</strong> chuẩn (tự động giữ kiểu số để tính tổng SUM/AVERAGE được ngay).
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>PDF sang Excel (.XLSX)</h3>
          <Toggle
            checked={sheetPerPage}
            onChange={setSheetPerPage}
            label="Mỗi trang PDF tách thành 1 Sheet riêng (bỏ chọn = gộp chung 1 Sheet)"
          />
          <ProcessButton task={task} label="Tạo tệp Excel (.xlsx)" icon={<FileSpreadsheet size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};
