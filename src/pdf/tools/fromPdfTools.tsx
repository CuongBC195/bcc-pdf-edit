import React, { useState } from 'react';
import { Copy, FileDown, Image as ImageIcon, Minimize2 } from 'lucide-react';
import JSZip from 'jszip';
import { baseName, downloadOutput, formatBytes } from '../core/download';
import {
  encodeBmpFromCanvas,
  encodeSvgFromCanvas,
  encodeTiffFromCanvas,
  extractImagesFromPdf,
  extractStructuredPages,
  rowsToCsv,
  rowsToMarkdownTable,
} from '../core/extract';
import type { OutputFile } from '../core/ops';
import { compactPdf } from '../core/qpdf';
import { rasterizePdf, renderAtDpi } from '../core/raster';
import { readInfo } from '../core/structure';
import { PdfPageGrid, SelectionToolbar } from '../ui/PdfPageGrid';
import { Field, Notice, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { pagesOf } from '../ui/gridItems';
import { useTask, useToolState } from '../ui/hooks';
import { usePageSelection } from '../ui/selection';
import { useAsyncResult } from '../ui/useAsyncResult';
import { useToolFiles } from '../ui/useToolFiles';
import { MultiFileTool, RangeInput, SingleFileTool } from './common';
import { outName } from './naming';

// ---------------------------------------------------------------------------
// 1. Nhóm PDF -> Hình ảnh (JPG, PNG, WebP, BMP, TIFF, SVG, CBZ)
// ---------------------------------------------------------------------------
type ExportImgFormat = 'jpg' | 'png' | 'webp' | 'bmp' | 'tiff' | 'svg' | 'cbz';

async function canvasToFormatBytes(canvas: HTMLCanvasElement, fmt: ExportImgFormat, quality: number): Promise<Uint8Array> {
  if (fmt === 'bmp') return encodeBmpFromCanvas(canvas);
  if (fmt === 'tiff') return encodeTiffFromCanvas(canvas);
  if (fmt === 'svg') return encodeSvgFromCanvas(canvas);
  const mime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh từ trang.'))), mime, quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

const PdfToImageWorkspace: React.FC<{
  toolId: string;
  format: ExportImgFormat;
  title: string;
}> = ({ toolId, format, title }) => {
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;

  const sel = usePageSelection(toolId, f);
  const [dpi, setDpi] = useToolState(toolId, 'dpi', 150);
  const [quality, setQuality] = useToolState(toolId, 'quality', 0.88);

  const run = () =>
    f &&
    task.run(async (report) => {
      const targetPages = sel.sorted.length ? sel.sorted : Array.from({ length: total }, (_, i) => i + 1);
      const base = baseName(f.file.name);
      const ext = format === 'cbz' ? 'jpg' : format;
      const outputs: OutputFile[] = [];

      for (let i = 0; i < targetPages.length; i++) {
        const pNo = targetPages[i];
        report(Math.round(((i + 1) / targetPages.length) * 100), `Đang kết xuất trang ${pNo} (${i + 1}/${targetPages.length})...`);
        const canvas = await renderAtDpi(f.buffer, pNo, dpi);
        const bytes = await canvasToFormatBytes(canvas, format === 'cbz' ? 'jpg' : format, quality);
        canvas.width = 0;
        canvas.height = 0;
        outputs.push({
          name: `${base}_trang-${String(pNo).padStart(3, '0')}.${ext}`,
          bytes,
        });
      }

      if (format === 'cbz') {
        const zip = new JSZip();
        outputs.forEach((o) => zip.file(o.name, o.bytes));
        const cbzBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
        return [{ name: `${base}.cbz`, bytes: cbzBytes }];
      }
      return outputs;
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <SelectionToolbar total={total} selectedCount={sel.sorted.length} onSelect={sel.setPages} />
          <PdfPageGrid items={pagesOf(file.buffer, total)} selected={sel.keys} onToggle={sel.toggle} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>{title}</h3>
          <Field label="Trang cần xuất (để trống = tất cả)" htmlFor={`${toolId}-range`}>
            <RangeInput id={`${toolId}-range`} total={total} value={sel.rangeText} onApply={sel.setPages} />
          </Field>
          <Field label="Độ phân giải (DPI)">
            <Segmented
              label="Độ phân giải"
              value={String(dpi)}
              onChange={(v) => setDpi(Number(v))}
              options={[
                { value: '100', label: '100 DPI' },
                { value: '150', label: '150 DPI' },
                { value: '300', label: '300 DPI (In)' },
              ]}
            />
          </Field>
          {(format === 'jpg' || format === 'webp' || format === 'cbz') && (
            <Field label={`Chất lượng ảnh: ${Math.round(quality * 100)}%`} htmlFor={`${toolId}-q`}>
              <input
                id={`${toolId}-q`}
                type="range"
                min={0.4}
                max={1}
                step={0.02}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </Field>
          )}
          <ProcessButton task={task} label={`Xuất sang ${format.toUpperCase()}`} icon={<ImageIcon size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} zipName={`${baseName(f?.file.name ?? 'pdf')}-${format}.zip`} />
        </>
      )}
    />
  );
};

export const PdfToJpg: React.FC = () => <PdfToImageWorkspace toolId="pdf-to-jpg" format="jpg" title="PDF sang ảnh JPG" />;
export const PdfToPng: React.FC = () => <PdfToImageWorkspace toolId="pdf-to-png" format="png" title="PDF sang ảnh PNG" />;
export const PdfToWebp: React.FC = () => <PdfToImageWorkspace toolId="pdf-to-webp" format="webp" title="PDF sang ảnh WebP" />;
export const PdfToBmp: React.FC = () => <PdfToImageWorkspace toolId="pdf-to-bmp" format="bmp" title="PDF sang ảnh BMP" />;
export const PdfToTiff: React.FC = () => <PdfToImageWorkspace toolId="pdf-to-tiff" format="tiff" title="PDF sang ảnh TIFF" />;
export const PdfToSvg: React.FC = () => <PdfToImageWorkspace toolId="pdf-to-svg" format="svg" title="PDF sang hình SVG" />;
export const PdfToCbz: React.FC = () => <PdfToImageWorkspace toolId="pdf-to-cbz" format="cbz" title="PDF sang truyện tranh CBZ" />;

// ---------------------------------------------------------------------------
// 2. Trích xuất ảnh trong PDF (extract-images)
// ---------------------------------------------------------------------------
export const ExtractImages: React.FC = () => {
  const toolId = 'extract-images';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const sel = usePageSelection(toolId, f);

  const run = () =>
    f &&
    task.run(async () => extractImagesFromPdf(f.buffer, f.buffer, sel.sorted.length ? sel.sorted : undefined));

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={(file) => (
        <>
          <SelectionToolbar total={total} selectedCount={sel.sorted.length} onSelect={sel.setPages} />
          <PdfPageGrid items={pagesOf(file.buffer, total)} selected={sel.keys} onToggle={sel.toggle} />
        </>
      )}
      panel={(file) => (
        <>
          <h3>Trích xuất ảnh từ PDF</h3>
          <Notice>Tự động bóc các ảnh gốc nhúng trong trang (hoặc kết xuất ảnh trang nếu trang chỉ chứa hình vẽ phức hợp).</Notice>
          <Field label="Trang cần lấy ảnh (để trống = tất cả)" htmlFor="exi-range">
            <RangeInput id="exi-range" total={total} value={sel.rangeText} onApply={sel.setPages} />
          </Field>
          <ProcessButton task={task} label="Trích xuất ảnh" icon={<ImageIcon size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} zipName={`${baseName(f?.file.name ?? 'pdf')}-anh.zip`} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. Nhóm Trích xuất Văn bản / Markdown / JSON / CSV / Bảng / Chuẩn bị cho AI
// ---------------------------------------------------------------------------
type TextExtractMode = 'txt' | 'md' | 'json' | 'csv' | 'tables' | 'ai';

const StructuredExtractWorkspace: React.FC<{
  toolId: string;
  mode: TextExtractMode;
  title: string;
  ext: string;
}> = ({ toolId, mode, title, ext }) => {
  const files = useToolFiles(toolId);
  const f = files.file;
  const [pageBreakMarker, setPageBreakMarker] = useToolState(toolId, 'marker', true);
  const [copied, setCopied] = useState(false);

  const extracted = useAsyncResult(
    f ? `${f.id}|${mode}|${pageBreakMarker}` : null,
    async () => {
      if (!f) return '';
      const [pages, meta] = await Promise.all([
        extractStructuredPages(f.buffer),
        mode === 'json' || mode === 'ai' ? readInfo(f.buffer) : Promise.resolve(null),
      ]);

      if (mode === 'txt') {
        return pages
          .map((p) => {
            const body = p.lines.map((l) => l.text).join('\n');
            return pageBreakMarker ? `--- Trang ${p.pageNumber} ---\n${body}` : body;
          })
          .join('\n\n');
      }

      if (mode === 'md') {
        return pages
          .map((p) => {
            const parts: string[] = [];
            if (pageBreakMarker) parts.push(`<!-- Trang ${p.pageNumber} -->`);
            for (const l of p.lines) {
              parts.push(l.isHeading ? `## ${l.text}` : l.text);
            }
            for (const tb of p.tables) {
              parts.push('\n' + rowsToMarkdownTable(tb) + '\n');
            }
            return parts.join('\n\n');
          })
          .join('\n\n---\n\n');
      }

      if (mode === 'csv' || mode === 'tables') {
        const allTables = pages.flatMap((p) => p.tables);
        if (allTables.length > 0) {
          return allTables
            .map((tb, idx) =>
              mode === 'tables' && allTables.length > 1 ? `# Bảng ${idx + 1}\n${rowsToCsv(tb)}` : rowsToCsv(tb)
            )
            .join('\n\n');
        }
        // Dự phòng: gom mọi dòng của các trang thành các hàng CSV theo spans
        const fallbackRows = pages.flatMap((p) => p.lines.map((l) => l.spans.map((s) => s.str)));
        return rowsToCsv(fallbackRows);
      }

      if (mode === 'json') {
        return JSON.stringify(
          {
            fileName: f.file.name,
            metadata: meta,
            pages: pages.map((p) => ({
              page: p.pageNumber,
              width: p.width,
              height: p.height,
              headings: p.lines.filter((l) => l.isHeading).map((l) => l.text),
              lines: p.lines.map((l) => l.text),
              tables: p.tables,
            })),
          },
          null,
          2
        );
      }

      // mode === 'ai'
      const totalChars = pages.reduce((s, p) => s + p.lines.reduce((acc, l) => acc + l.text.length, 0), 0);
      const approxTokens = Math.round(totalChars / 3.6);
      const header = [
        `# TÀI LIỆU NGỮ CẢNH CHO AI: ${f.file.name}`,
        `- Tiêu đề: ${meta?.title || f.file.name}`,
        `- Tác giả: ${meta?.author || 'Không rõ'}`,
        `- Số trang: ${pages.length}`,
        `- Ước tính độ dài: ~${approxTokens.toLocaleString('vi-VN')} tokens (${totalChars.toLocaleString('vi-VN')} ký tự)`,
        '',
      ].join('\n');
      const chunks = pages
        .map((p) => {
          const lines = p.lines.map((l) => (l.isHeading ? `### ${l.text}` : l.text)).join('\n');
          const tbs = p.tables.map((tb) => '\n' + rowsToMarkdownTable(tb)).join('\n');
          return `<page number="${p.pageNumber}">\n${lines}${tbs}\n</page>`;
        })
        .join('\n\n');
      return `${header}\n${chunks}`;
    }
  );

  const content = extracted.value ?? '';

  const copyText = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadFile = () => {
    if (!f) return;
    const bom = ext === 'csv' ? '\uFEFF' : '';
    downloadOutput({
      name: `${baseName(f.file.name)}.${ext}`,
      bytes: new TextEncoder().encode(bom + content),
    });
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Field label={`Kết quả trích xuất (${content.length.toLocaleString('vi-VN')} ký tự)`} htmlFor={`${toolId}-out`}>
          <textarea
            id={`${toolId}-out`}
            className="pdft-textarea"
            rows={18}
            readOnly
            value={content || 'Không tìm thấy văn bản dạng vector (nếu là tệp scan ảnh, hãy dùng công cụ Nhận dạng chữ OCR).'}
            style={{ fontFamily: mode === 'json' || mode === 'csv' || mode === 'tables' ? 'monospace' : undefined }}
          />
        </Field>
      )}
      panel={(file) => (
        <>
          <h3>{title}</h3>
          {(mode === 'txt' || mode === 'md') && (
            <Toggle checked={pageBreakMarker} onChange={setPageBreakMarker} label="Đánh dấu phân cách giữa các trang" />
          )}
          <Notice>
            {mode === 'ai'
              ? 'Định dạng ngữ cảnh có thẻ <page> và bảng Markdown tối ưu cho ChatGPT, Claude và Gemini.'
              : 'Dữ liệu được trích xuất tức thì trên trình duyệt, giữ nguyên dấu tiếng Việt.'}
          </Notice>
          <button type="button" className="btn btn-secondary" disabled={!file || !content} onClick={copyText}>
            <Copy size={17} /> {copied ? 'Đã sao chép!' : 'Sao chép vào bộ nhớ tạm'}
          </button>
          <button type="button" className="btn btn-primary" disabled={!file || !content} onClick={downloadFile}>
            <FileDown size={18} /> Tải tệp .{ext.toUpperCase()}
          </button>
        </>
      )}
    />
  );
};

export const PdfToText: React.FC = () => (
  <StructuredExtractWorkspace toolId="pdf-to-text" mode="txt" title="PDF sang Văn bản (TXT)" ext="txt" />
);
export const PdfToMarkdown: React.FC = () => (
  <StructuredExtractWorkspace toolId="pdf-to-markdown" mode="md" title="PDF sang Markdown" ext="md" />
);
export const PdfToJson: React.FC = () => (
  <StructuredExtractWorkspace toolId="pdf-to-json" mode="json" title="PDF sang JSON" ext="json" />
);
export const PdfToCsv: React.FC = () => (
  <StructuredExtractWorkspace toolId="pdf-to-csv" mode="csv" title="PDF sang bảng CSV" ext="csv" />
);
export const ExtractTables: React.FC = () => (
  <StructuredExtractWorkspace toolId="extract-tables" mode="tables" title="Trích xuất bảng biểu từ PDF" ext="csv" />
);
export const PreparePdfForAi: React.FC = () => (
  <StructuredExtractWorkspace toolId="prepare-pdf-for-ai" mode="ai" title="Chuẩn bị PDF cho AI (LLM)" ext="md" />
);

// ---------------------------------------------------------------------------
// 4. Nén giảm dung lượng PDF (compress-pdf)
// ---------------------------------------------------------------------------
export const CompressPdf: React.FC = () => {
  const toolId = 'compress-pdf';
  const files = useToolFiles(toolId, { multiple: true });
  const task = useTask();
  const [level, setLevel] = useToolState<'lossless' | 'balanced' | 'strong'>(toolId, 'level', 'balanced');

  const run = () =>
    task.run(async (report) => {
      const outputs: OutputFile[] = [];
      let totalBefore = 0;
      let totalAfter = 0;

      for (let i = 0; i < files.files.length; i++) {
        const f = files.files[i];
        totalBefore += f.file.size;
        report(Math.round((i / files.files.length) * 100), `Đang nén ${f.file.name}...`);

        const losslessBytes = await compactPdf(new Uint8Array(f.buffer));
        let best = losslessBytes;

        if (level !== 'lossless') {
          const dpi = level === 'balanced' ? 140 : 105;
          const quality = level === 'balanced' ? 0.72 : 0.54;
          const rasterBytes = await rasterizePdf(f.buffer, { dpi, format: 'jpeg', quality });
          if (rasterBytes.byteLength < best.byteLength) best = rasterBytes;
        }
        // Không bao giờ trả ra tệp lớn hơn bản gốc
        if (best.byteLength >= f.file.size) {
          best = new Uint8Array(f.buffer);
        }
        totalAfter += best.byteLength;
        outputs.push({ name: outName(f, 'nen'), bytes: best });
      }

      const savedPct = totalBefore ? Math.max(0, Math.round(((totalBefore - totalAfter) / totalBefore) * 100)) : 0;
      return {
        outputs,
        note: `Dung lượng: ${formatBytes(totalBefore)} → ${formatBytes(totalAfter)} (giảm ${savedPct}%).`,
      };
    });

  return (
    <MultiFileTool
      toolId={toolId}
      files={files}
      dropTitle="Chọn một hoặc nhiều tệp PDF cần nén giảm dung lượng"
      panel={
        <>
          <h3>Mức độ nén PDF</h3>
          <Field label="Chế độ nén">
            <Segmented
              label="Mức nén"
              value={level}
              onChange={setLevel}
              options={[
                { value: 'lossless', label: 'Giữ nguyên nét' },
                { value: 'balanced', label: 'Cân bằng' },
                { value: 'strong', label: 'Nén mạnh' },
              ]}
            />
          </Field>
          <Notice>
            {level === 'lossless'
              ? 'Tối ưu luồng đối tượng bằng qpdf (Object Streams + Recompress Flate), giữ nguyên 100% chữ vector và độ nét ảnh.'
              : level === 'balanced'
                ? 'Kết hợp tối ưu cấu trúc và nén lại trang ảnh ở 140 DPI — giảm mạnh dung lượng hồ sơ scan mà vẫn rõ chữ.'
                : 'Nén tối đa ở 105 DPI để gửi qua cổng dịch vụ công hoặc email giới hạn dung lượng nhỏ.'}
          </Notice>
          <ProcessButton
            task={task}
            label="Nén tệp PDF"
            icon={<Minimize2 size={18} />}
            disabled={!files.files.length || files.files.some((x) => !!x.error)}
            onClick={run}
          />
          <ResultPanel task={task} zipName="pdf-da-nen.zip" />
        </>
      }
    />
  );
};
