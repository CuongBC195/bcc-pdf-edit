import React, { useState } from 'react';
import { Copy, ScanText } from 'lucide-react';
import { rgb } from 'pdf-lib';
import { createWorker } from 'tesseract.js';
import { baseName } from '../core/download';
import { inVisualSpace } from '../core/draw';
import { embedFont } from '../core/fonts';
import { loadPdf, savePdf, type OutputFile } from '../core/ops';
import { renderAtDpi } from '../core/raster';
import { Field, Notice, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { parseRange } from '../ui/selection';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';
import { outName } from './naming';

export const OcrPdf: React.FC = () => {
  const toolId = 'ocr-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;

  const [lang, setLang] = useToolState<'vie+eng' | 'vie' | 'eng'>(toolId, 'lang', 'vie+eng');
  const [dpi, setDpi] = useToolState(toolId, 'dpi', 180);
  const [includeTxt, setIncludeTxt] = useToolState(toolId, 'txt', true);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const [recognizedText, setRecognizedText] = useState('');
  const [copied, setCopied] = useState(false);

  const pages = parseRange(range, total);

  const run = () =>
    f &&
    task.run(async (report) => {
      const targetPages = pages.pages.length ? pages.pages : Array.from({ length: total }, (_, i) => i + 1);
      report(5, 'Đang khởi tạo bộ nhận dạng chữ Tesseract OCR...');
      const worker = await createWorker(lang);
      const doc = await loadPdf(f.buffer);
      const font = await embedFont(doc, 'sans', 'regular');
      const allPages = doc.getPages();
      const textChunks: string[] = [];

      try {
        for (let i = 0; i < targetPages.length; i++) {
          const pNo = targetPages[i];
          report(
            Math.round(((i + 0.2) / targetPages.length) * 90),
            `Đang nhận dạng chữ trang ${pNo} (${i + 1}/${targetPages.length})...`
          );
          const canvas = await renderAtDpi(f.buffer, pNo, dpi);
          const res = await worker.recognize(canvas, {}, { text: true, blocks: true });
          const pageText = (res.data.text ?? '').trim();
          textChunks.push(`--- Trang ${pNo} ---\n${pageText}`);

          const pdfPage = allPages[pNo - 1];
          const cw = Math.max(1, canvas.width);
          const ch = Math.max(1, canvas.height);

          if (pdfPage) {
            inVisualSpace(pdfPage, (geo) => {
              const blocks = res.data.blocks ?? [];
              for (const blk of blocks) {
                for (const par of blk.paragraphs ?? []) {
                  for (const ln of par.lines ?? []) {
                    const lineText = (ln.text ?? '').trim();
                    if (!lineText || !ln.bbox) continue;
                    const { x0, y0, x1, y1 } = ln.bbox;
                    const xPt = (x0 / cw) * geo.width;
                    const yPt = (1 - y1 / ch) * geo.height;
                    const hPt = Math.max(6, ((y1 - y0) / ch) * geo.height * 0.82);
                    const wPt = Math.max(10, ((x1 - x0) / cw) * geo.width);
                    const rawW = Math.max(1, font.widthOfTextAtSize(lineText, hPt));
                    const fitSize = Math.min(hPt, (wPt / rawW) * hPt);
                    try {
                      pdfPage.drawText(lineText, {
                        x: xPt,
                        y: yPt,
                        font,
                        size: Math.max(4, fitSize),
                        color: rgb(0, 0, 0),
                        opacity: 0.01,
                      });
                    } catch {
                      /* bỏ qua ký tự lạ không vẽ được */
                    }
                  }
                }
              }
            });
          }
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        await worker.terminate();
      }

      const fullText = textChunks.join('\n\n');
      setRecognizedText(fullText);

      const pdfBytes = await savePdf(doc);
      const outputs: OutputFile[] = [{ name: outName(f, 'ocr'), bytes: pdfBytes }];
      if (includeTxt) {
        outputs.push({
          name: `${baseName(f.file.name)}_ocr.txt`,
          bytes: new TextEncoder().encode(fullText),
        });
      }
      return {
        outputs,
        note: `Đã nhận dạng ${targetPages.length} trang (${fullText.length.toLocaleString('vi-VN')} ký tự).`,
      };
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <div>
          <Notice>
            Nhận dạng văn bản tiếng Việt và tiếng Anh trên tài liệu PDF scan, đồng thời chèn lớp chữ ẩn đúng vị trí lên trang PDF để có thể bôi đen sao chép và tìm kiếm (Ctrl+F).
          </Notice>
          {recognizedText && (
            <div style={{ marginTop: 14 }}>
              <div className="pdft-bar" style={{ marginBottom: 8 }}>
                <strong>Văn bản đã nhận dạng ({recognizedText.length.toLocaleString('vi-VN')} ký tự)</strong>
                <div className="pdft-bar__spacer" />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(recognizedText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  <Copy size={15} /> {copied ? 'Đã sao chép!' : 'Sao chép chữ'}
                </button>
              </div>
              <textarea className="pdft-textarea" rows={14} readOnly value={recognizedText} />
            </div>
          )}
        </div>
      )}
      panel={(file) => (
        <>
          <h3>Nhận dạng chữ (OCR)</h3>
          <Field label="Ngôn ngữ tài liệu">
            <Segmented
              label="Ngôn ngữ OCR"
              value={lang}
              onChange={setLang}
              options={[
                { value: 'vie+eng', label: 'Việt + Anh' },
                { value: 'vie', label: 'Tiếng Việt' },
                { value: 'eng', label: 'Tiếng Anh' },
              ]}
            />
          </Field>
          <Field label="Độ nét quét ảnh">
            <Segmented
              label="Độ nét OCR"
              value={String(dpi)}
              onChange={(v) => setDpi(Number(v))}
              options={[
                { value: '150', label: '150 DPI (Nhanh)' },
                { value: '180', label: '180 DPI (Chuẩn)' },
                { value: '240', label: '240 DPI (Chữ nhỏ)' },
              ]}
            />
          </Field>
          <Field label="Trang cần OCR (để trống = tất cả)" htmlFor="ocr-range">
            <input
              id="ocr-range"
              className="pdft-input"
              value={range}
              placeholder="Ví dụ: 1-5"
              onChange={(e) => setRange(e.target.value)}
            />
            {pages.error && <Notice kind="error">{pages.error}</Notice>}
          </Field>
          <Toggle checked={includeTxt} onChange={setIncludeTxt} label="Xuất kèm tệp văn bản .TXT ngoài tệp PDF" />
          <ProcessButton task={task} label="Chạy nhận dạng OCR" icon={<ScanText size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} zipName="ket-qua-ocr.zip" />
        </>
      )}
    />
  );
};

