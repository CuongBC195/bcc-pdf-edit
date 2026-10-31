import React, { useState } from 'react';
import { Bookmark, ListTree, Sparkles } from 'lucide-react';
import { PDFName, rgb } from 'pdf-lib';
import { extractBookmarks, getPdfDocumentProxy } from '../../services/thumbnailService';
import { embedFont, type FontFamily } from '../core/fonts';
import { loadPdf, savePdf, type PdfInput } from '../core/ops';
import { MM_TO_PT } from '../core/paper';
import { treeFromFlat, writeOutline, writeOutlineInto } from '../core/structure';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { useAsyncResult } from '../ui/useAsyncResult';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';
import { outName } from './naming';

interface FlatBookmark {
  title: string;
  page: number;
  level: number;
}

/** Tự động dò tiêu đề chương/mục dựa trên cỡ chữ lớn hơn mặt bằng chung */
async function detectHeadings(buffer: ArrayBuffer): Promise<FlatBookmark[]> {
  const pdf = await getPdfDocumentProxy(buffer);
  const lines: { page: number; y: number; size: number; text: string }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const byLine = new Map<number, { size: number; parts: { x: number; str: string }[] }>();
    for (const raw of tc.items as any[]) {
      const str = String(raw.str ?? '').trim();
      if (!str || !raw.transform) continue;
      const size = Math.round(Math.hypot(raw.transform[0], raw.transform[1]) * 2) / 2;
      const y = Math.round(raw.transform[5] / 3) * 3;
      const x = raw.transform[4];
      const bucket = byLine.get(y) ?? { size: 0, parts: [] };
      bucket.size = Math.max(bucket.size, size);
      bucket.parts.push({ x, str });
      byLine.set(y, bucket);
    }
    for (const [y, b] of [...byLine.entries()].sort((a, c) => c[0] - a[0])) {
      const text = b.parts
        .sort((a, c) => a.x - c.x)
        .map((x) => x.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length >= 3 && text.length <= 120) lines.push({ page: p, y, size: b.size, text });
    }
  }
  if (!lines.length) return [];
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length * 0.5)] || 11;
  const headingLines = lines.filter(
    (l) => l.size >= body * 1.18 || /^(chương|phần|mục|điều|phụ lục|i{1,3}v?\b|[0-9]+\.)/i.test(l.text)
  );
  const uniqueSizes = [...new Set(headingLines.map((l) => Math.round(l.size)))].sort((a, b) => b - a);
  return headingLines.slice(0, 120).map((l) => ({
    title: l.text,
    page: l.page,
    level: Math.min(2, Math.max(0, uniqueSizes.indexOf(Math.round(l.size)))),
  }));
}

/** Chèn trang Mục lục có liên kết bấm được + cập nhật Outline */
async function buildTocDocument(
  input: PdfInput,
  items: FlatBookmark[],
  options: { title: string; insertAtPage: number; family: FontFamily; updateOutline: boolean }
): Promise<Uint8Array> {
  const doc = await loadPdf(input);
  const origPages = doc.getPages();
  const firstBox = origPages[0]?.getCropBox() ?? { width: 595.28, height: 841.89 };
  const pageW = firstBox.width;
  const pageH = firstBox.height;
  const margin = 20 * MM_TO_PT;
  const contentW = pageW - margin * 2;
  const rowH = 22;
  const headerH = 44;
  const usableFirst = pageH - margin * 2 - headerH;
  const usableNext = pageH - margin * 2;
  const rowsFirst = Math.max(1, Math.floor(usableFirst / rowH));
  const rowsNext = Math.max(1, Math.floor(usableNext / rowH));

  const tocPageCount =
    items.length <= rowsFirst ? 1 : 1 + Math.ceil((items.length - rowsFirst) / rowsNext);

  const fontReg = await embedFont(doc, options.family, 'regular');
  const fontBold = await embedFont(doc, options.family, 'bold');

  const insertIdx = Math.min(Math.max(0, options.insertAtPage - 1), origPages.length);
  const tocPages = Array.from({ length: tocPageCount }, (_, i) => doc.insertPage(insertIdx + i, [pageW, pageH]));

  // Trang đích dịch thêm tocPageCount nếu nằm từ vị trí chèn trở đi
  const shiftedPage = (origPage: number) => (origPage >= insertIdx + 1 ? origPage + tocPageCount : origPage);

  let cursor = 0;
  tocPages.forEach((tocPage, pIdx) => {
    let y = pageH - margin;
    if (pIdx === 0) {
      const titleSize = 18;
      const tw = fontBold.widthOfTextAtSize(options.title, titleSize);
      tocPage.drawText(options.title, {
        x: (pageW - tw) / 2,
        y: y - titleSize,
        font: fontBold,
        size: titleSize,
        color: rgb(0.08, 0.12, 0.22),
      });
      y -= headerH;
    }
    const limit = pIdx === 0 ? rowsFirst : rowsNext;
    const annots: any[] = [];
    for (let r = 0; r < limit && cursor < items.length; r++, cursor++) {
      const it = items[cursor];
      const dispPage = shiftedPage(it.page);
      const isTop = it.level === 0;
      const font = isTop ? fontBold : fontReg;
      const size = isTop ? 11.5 : 10.5;
      const indent = Math.min(3, it.level) * 16;
      const rowY = y - r * rowH - size;
      const pageStr = String(dispPage);
      const pageWText = font.widthOfTextAtSize(pageStr, size);
      const maxTitleW = contentW - indent - pageWText - 24;

      let titleText = it.title || 'Mục không tên';
      while (titleText.length > 4 && font.widthOfTextAtSize(titleText, size) > maxTitleW) {
        titleText = `${titleText.slice(0, -2)}…`;
      }
      const titleW = font.widthOfTextAtSize(titleText, size);
      tocPage.drawText(titleText, {
        x: margin + indent,
        y: rowY,
        font,
        size,
        color: isTop ? rgb(0.07, 0.1, 0.18) : rgb(0.2, 0.24, 0.32),
      });
      tocPage.drawText(pageStr, {
        x: pageW - margin - pageWText,
        y: rowY,
        font,
        size,
        color: rgb(0.15, 0.2, 0.3),
      });

      // Chấm nối (leader dots)
      const dotsStart = margin + indent + titleW + 6;
      const dotsEnd = pageW - margin - pageWText - 6;
      if (dotsEnd > dotsStart + 8) {
        const dotW = fontReg.widthOfTextAtSize(' .', 9);
        const count = Math.max(0, Math.floor((dotsEnd - dotsStart) / dotW));
        if (count > 0) {
          tocPage.drawText(' .'.repeat(count), {
            x: dotsStart,
            y: rowY,
            font: fontReg,
            size: 9,
            color: rgb(0.55, 0.6, 0.68),
          });
        }
      }

      // Liên kết nhảy tới trang đích
      const allPages = doc.getPages();
      const targetPage = allPages[Math.min(Math.max(1, dispPage), allPages.length) - 1];
      const linkAnnot = doc.context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: [margin + indent, rowY - 3, pageW - margin, rowY + size + 3],
        Border: [0, 0, 0],
        Dest: [targetPage.ref, PDFName.of('XYZ'), null, null, null],
      });
      annots.push(doc.context.register(linkAnnot));
    }
    if (annots.length) tocPage.node.set(PDFName.of('Annots'), doc.context.obj(annots));
  });

  if (options.updateOutline) {
    const shifted = items.map((it) => ({ ...it, page: shiftedPage(it.page) }));
    shifted.unshift({ title: options.title, page: insertIdx + 1, level: 0 });
    writeOutlineInto(doc, treeFromFlat(shifted));
  }
  return savePdf(doc);
}

// ---------------------------------------------------------------------------
// Bảng chỉnh sửa danh sách mục (dùng chung cho Bookmark & Mục lục)
// ---------------------------------------------------------------------------
const BookmarkListEditor: React.FC<{
  items: FlatBookmark[];
  totalPages: number;
  onChange: (items: FlatBookmark[]) => void;
  onAutoDetect: () => void;
  detecting: boolean;
}> = ({ items, totalPages, onChange, onAutoDetect, detecting }) => {
  const update = (idx: number, patch: Partial<FlatBookmark>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  return (
    <div>
      <div className="pdft-bar" style={{ marginBottom: 12 }}>
        <strong>{items.length} mục</strong>
        <div className="pdft-bar__spacer" />
        <button type="button" className="btn btn-secondary btn-sm" disabled={detecting} onClick={onAutoDetect}>
          <Sparkles size={15} /> {detecting ? 'Đang dò tiêu đề...' : 'Tự dò tiêu đề từ văn bản'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChange([...items, { title: `Mục ${items.length + 1}`, page: items[items.length - 1]?.page ?? 1, level: 0 }])}
        >
          + Thêm mục
        </button>
        {items.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([])}>
            Xóa hết
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="pdft-empty">
          Chưa có mục nào. Nhấn <strong>“Tự dò tiêu đề từ văn bản”</strong> hoặc <strong>“+ Thêm mục”</strong> để bắt đầu.
        </div>
      ) : (
        <div className="pdft-files">
          {items.map((it, i) => (
            <div
              key={i}
              className="pdft-file"
              style={{
                gridTemplateColumns: 'auto 1fr 90px auto',
                paddingLeft: 12 + it.level * 18,
              }}
            >
              <span className="pdft-badge">Cấp {it.level + 1}</span>
              <input
                className="pdft-input"
                aria-label={`Tiêu đề mục ${i + 1}`}
                value={it.title}
                onChange={(e) => update(i, { title: e.target.value })}
              />
              <NumberInput
                value={it.page}
                min={1}
                max={Math.max(1, totalPages)}
                onChange={(v) => update(i, { page: Math.round(v) })}
              />
              <div className="pdft-file__actions">
                <button
                  type="button"
                  className="pdft-icon-btn"
                  title="Giảm cấp"
                  disabled={it.level <= 0}
                  onClick={() => update(i, { level: Math.max(0, it.level - 1) })}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="pdft-icon-btn"
                  title="Tăng cấp (mục con)"
                  disabled={it.level >= 3}
                  onClick={() => update(i, { level: Math.min(3, it.level + 1) })}
                >
                  →
                </button>
                <button
                  type="button"
                  className="pdft-icon-btn pdft-icon-btn--danger"
                  title="Xóa mục"
                  onClick={() => onChange(items.filter((_, k) => k !== i))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Công cụ: Sửa mục lục (bookmark)
// ---------------------------------------------------------------------------
export const BookmarkTool: React.FC = () => {
  const toolId = 'bookmark';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;

  const loaded = useAsyncResult(
    f ? f.id : null,
    async () => {
      if (!f) return [];
      const bms = await extractBookmarks(f.buffer);
      return bms.map((b) => ({ title: b.title, page: b.pageNumber, level: b.level }));
    }
  );

  const [draft, setDraft] = useState<{ fileId: string; items: FlatBookmark[] } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const items = draft && draft.fileId === f?.id ? draft.items : (loaded.value ?? []);
  const setItems = (next: FlatBookmark[]) => f && setDraft({ fileId: f.id, items: next });

  const autoDetect = async () => {
    if (!f) return;
    setDetecting(true);
    try {
      const detected = await detectHeadings(f.buffer);
      if (detected.length) setItems(detected);
    } finally {
      setDetecting(false);
    }
  };

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'muc-luc'),
        bytes: await writeOutline(f.buffer, treeFromFlat(items)),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <BookmarkListEditor
          items={items}
          totalPages={total}
          onChange={setItems}
          onAutoDetect={autoDetect}
          detecting={detecting}
        />
      )}
      panel={(file) => (
        <>
          <h3>Mục lục (Bookmark)</h3>
          <Notice>
            Bookmark hiển thị ở thanh bên trái của trình đọc PDF, giúp nhảy nhanh tới từng chương/mục. Để trống danh sách sẽ xóa sạch bookmark cũ.
          </Notice>
          <ProcessButton task={task} label="Lưu mục lục vào PDF" icon={<Bookmark size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// Công cụ: Tạo trang mục lục (table-of-contents)
// ---------------------------------------------------------------------------
export const TableOfContentsTool: React.FC = () => {
  const toolId = 'table-of-contents';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;

  const [title, setTitle] = useToolState(toolId, 'title', 'MỤC LỤC');
  const [insertAt, setInsertAt] = useToolState(toolId, 'insertAt', 1);
  const [family, setFamily] = useToolState<FontFamily>(toolId, 'family', 'sans');
  const [updateOutline, setUpdateOutline] = useToolState(toolId, 'outline', true);

  const loaded = useAsyncResult(
    f ? f.id : null,
    async () => {
      if (!f) return [];
      const bms = await extractBookmarks(f.buffer);
      if (bms.length) return bms.map((b) => ({ title: b.title, page: b.pageNumber, level: b.level }));
      return detectHeadings(f.buffer);
    }
  );

  const [draft, setDraft] = useState<{ fileId: string; items: FlatBookmark[] } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const items = draft && draft.fileId === f?.id ? draft.items : (loaded.value ?? []);
  const setItems = (next: FlatBookmark[]) => f && setDraft({ fileId: f.id, items: next });

  const autoDetect = async () => {
    if (!f) return;
    setDetecting(true);
    try {
      setItems(await detectHeadings(f.buffer));
    } finally {
      setDetecting(false);
    }
  };

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'trang-muc-luc'),
        bytes: await buildTocDocument(f.buffer, items, { title, insertAtPage: insertAt, family, updateOutline }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <BookmarkListEditor
          items={items}
          totalPages={total}
          onChange={setItems}
          onAutoDetect={autoDetect}
          detecting={detecting}
        />
      )}
      panel={(file) => (
        <>
          <h3>Trang mục lục</h3>
          <Field label="Tiêu đề trang" htmlFor="toc-title">
            <input id="toc-title" className="pdft-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Chèn vào trước trang số" htmlFor="toc-insert">
            <NumberInput id="toc-insert" value={insertAt} min={1} max={Math.max(1, total + 1)} onChange={(v) => setInsertAt(Math.round(v))} />
          </Field>
          <Field label="Phông chữ">
            <Segmented
              label="Phông chữ"
              value={family}
              onChange={setFamily}
              options={[
                { value: 'sans', label: 'Không chân' },
                { value: 'serif', label: 'Có chân' },
              ]}
            />
          </Field>
          <Toggle checked={updateOutline} onChange={setUpdateOutline} label="Đồng thời cập nhật thanh Bookmark của tệp" />
          <Notice>Trang mục lục có sẵn liên kết: bấm vào dòng nào sẽ nhảy tới đúng trang đó (số trang tự cộng thêm số trang mục lục vừa chèn).</Notice>
          <ProcessButton
            task={task}
            label="Tạo trang mục lục"
            icon={<ListTree size={18} />}
            disabled={!file || items.length === 0}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};
