import React, { useState } from 'react';
import { Download, Eye, FileCheck2, FileCode, FolderDown, Layers, Paperclip, ShieldOff, Trash2 } from 'lucide-react';
import { getPdfDocumentProxy } from '../../services/thumbnailService';
import { downloadOutput, formatBytes } from '../core/download';
import { getPageDimensions } from '../core/ops';
import { renderPageToCanvas } from '../core/render';
import {
  addAttachments,
  listAttachments,
  listLayers,
  readInfo,
  removeMetadata,
  rewriteAttachments,
  updateLayers,
  writeMetadata,
  type PdfMetadata,
} from '../core/structure';
import { Field, Notice, NumberInput, ProcessButton, ResultPanel, Segmented, Toggle } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { useAsyncResult } from '../ui/useAsyncResult';
import { useToolFiles } from '../ui/useToolFiles';
import { MultiFileTool, SingleFileTool } from './common';
import { outName } from './naming';

const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleString('vi-VN') : '—');

// ---------------------------------------------------------------------------
// 1. Xem thông tin tệp (view-metadata)
// ---------------------------------------------------------------------------
export const ViewMetadata: React.FC = () => {
  const toolId = 'view-metadata';
  const files = useToolFiles(toolId);
  const f = files.file;

  const info = useAsyncResult(
    f ? f.id : null,
    async () => {
      if (!f) return null;
      const [meta, dims] = await Promise.all([readInfo(f.buffer), getPageDimensions(f.buffer)]);
      return { meta, dims };
    }
  );

  const exportJson = () => {
    if (!f || !info.value) return;
    const json = JSON.stringify(info.value, null, 2);
    downloadOutput({
      name: `${f.file.name.replace(/\.pdf$/i, '')}_thong-tin.json`,
      bytes: new TextEncoder().encode(json),
    });
  };

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => {
        const v = info.value;
        if (!v) return <div className="pdft-empty">Đang đọc thông tin tệp...</div>;
        const m = v.meta;
        const rows: [string, string][] = [
          ['Tiêu đề (Title)', m.title || '—'],
          ['Tác giả (Author)', m.author || '—'],
          ['Chủ đề (Subject)', m.subject || '—'],
          ['Từ khóa (Keywords)', m.keywords || '—'],
          ['Ứng dụng tạo (Creator)', m.creator || '—'],
          ['Bộ xuất PDF (Producer)', m.producer || '—'],
          ['Ngày tạo', fmtDate(m.creationDate)],
          ['Ngày sửa gần nhất', fmtDate(m.modificationDate)],
          ['Phiên bản PDF', `PDF ${m.version}`],
          ['Số trang', String(m.pageCount)],
          ['Dung lượng tệp', formatBytes(m.fileSize)],
          ['Mã hóa', m.encrypted ? 'Có' : 'Không'],
          ['Siêu dữ liệu XMP', m.hasXmp ? 'Có' : 'Không'],
          ['Trường biểu mẫu (AcroForm)', String(m.formFields)],
          ['Tệp đính kèm', String(m.attachments)],
          ['Lớp nội dung (OCG Layers)', String(m.layers)],
          ['Chứa JavaScript', m.hasJavaScript ? 'Có (cần lưu ý)' : 'Không'],
        ];
        return (
          <table className="pdft-table">
            <thead>
              <tr>
                <th>Thuộc tính</th>
                <th>Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, val]) => (
                <tr key={k}>
                  <td>
                    <strong>{k}</strong>
                  </td>
                  <td>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
      panel={(file) => (
        <>
          <h3>Thông tin tài liệu</h3>
          <Notice>Hiển thị toàn bộ thông tin nội tại (Document Info, XMP, biểu mẫu, tệp nhúng, lớp và mã thực thi).</Notice>
          <button type="button" className="btn btn-primary" disabled={!file || !info.value} onClick={exportJson}>
            <Download size={18} /> Tải báo cáo JSON
          </button>
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 2. Sửa thông tin tệp (edit-metadata)
// ---------------------------------------------------------------------------
export const EditMetadata: React.FC = () => {
  const toolId = 'edit-metadata';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;

  const info = useAsyncResult(f ? f.id : null, () => (f ? readInfo(f.buffer) : Promise.resolve(null)));
  const [draft, setDraft] = useState<{ fileId: string; meta: Partial<PdfMetadata> } | null>(null);

  const cur: Partial<PdfMetadata> =
    draft && draft.fileId === f?.id
      ? draft.meta
      : {
          title: info.value?.title ?? '',
          author: info.value?.author ?? '',
          subject: info.value?.subject ?? '',
          keywords: info.value?.keywords ?? '',
          creator: info.value?.creator ?? '',
          producer: info.value?.producer ?? '',
        };

  const setField = (patch: Partial<PdfMetadata>) => f && setDraft({ fileId: f.id, meta: { ...cur, ...patch } });

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'thong-tin'),
        bytes: await writeMetadata(f.buffer, cur),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <div className="pdft-files">
          <Field label="Tiêu đề tài liệu (Title)" htmlFor="md-title">
            <input id="md-title" className="pdft-input" value={cur.title ?? ''} onChange={(e) => setField({ title: e.target.value })} />
          </Field>
          <Field label="Tác giả / Cơ quan ban hành (Author)" htmlFor="md-author">
            <input id="md-author" className="pdft-input" value={cur.author ?? ''} onChange={(e) => setField({ author: e.target.value })} />
          </Field>
          <Field label="Chủ đề / Trích yếu (Subject)" htmlFor="md-subject">
            <input id="md-subject" className="pdft-input" value={cur.subject ?? ''} onChange={(e) => setField({ subject: e.target.value })} />
          </Field>
          <Field label="Từ khóa (phân cách bằng dấu phẩy)" htmlFor="md-kw">
            <input id="md-kw" className="pdft-input" value={cur.keywords ?? ''} onChange={(e) => setField({ keywords: e.target.value })} />
          </Field>
          <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Ứng dụng tạo (Creator)" htmlFor="md-creator">
              <input id="md-creator" className="pdft-input" value={cur.creator ?? ''} onChange={(e) => setField({ creator: e.target.value })} />
            </Field>
            <Field label="Bộ xuất PDF (Producer)" htmlFor="md-prod">
              <input id="md-prod" className="pdft-input" value={cur.producer ?? ''} onChange={(e) => setField({ producer: e.target.value })} />
            </Field>
          </div>
        </div>
      )}
      panel={(file) => (
        <>
          <h3>Sửa thông tin PDF</h3>
          <Notice>Cập nhật tiêu đề, tác giả, trích yếu và từ khóa chuẩn Unicode tiếng Việt, đồng thời xóa gói XMP cũ để tránh mâu thuẫn dữ liệu.</Notice>
          <ProcessButton task={task} label="Lưu thông tin mới" icon={<FileCode size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. Xóa thông tin ẩn (remove-metadata)
// ---------------------------------------------------------------------------
export const RemoveMetadata: React.FC = () => {
  const toolId = 'remove-metadata';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [removeId, setRemoveId] = useToolState(toolId, 'removeId', true);
  const info = useAsyncResult(f ? f.id : null, () => (f ? readInfo(f.buffer) : Promise.resolve(null)));

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'xoa-thong-tin'),
        bytes: await removeMetadata(f.buffer, { removeId }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => {
        const m = info.value;
        if (!m) return <div className="pdft-empty">Đang kiểm tra thông tin ẩn...</div>;
        return (
          <Notice>
            Tệp hiện chứa: Tiêu đề <strong>“{m.title || 'Trống'}”</strong>, Tác giả <strong>“{m.author || 'Trống'}”</strong>, Phần mềm tạo{' '}
            <strong>“{m.creator || m.producer || 'Trống'}”</strong>, XMP: <strong>{m.hasXmp ? 'Có' : 'Không'}</strong>. Tất cả các mục này sẽ được xóa sạch.
          </Notice>
        );
      }}
      panel={(file) => (
        <>
          <h3>Xóa thông tin ẩn</h3>
          <Toggle checked={removeId} onChange={setRemoveId} label="Xóa cả mã định danh tệp (/ID trong trailer)" />
          <Notice>Loại bỏ hoàn toàn Document Info, luồng XMP cấp tài liệu và cấp trang trước khi gửi tài liệu ra ngoài.</Notice>
          <ProcessButton task={task} label="Xóa sạch metadata" icon={<ShieldOff size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 4. Đính kèm tệp vào PDF (add-attachments)
// ---------------------------------------------------------------------------
interface PendingAttachment {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
  description: string;
}

export const AddAttachments: React.FC = () => {
  const toolId = 'add-attachments';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    const loaded: PendingAttachment[] = [];
    for (const pf of picked) {
      loaded.push({
        name: pf.name,
        bytes: new Uint8Array(await pf.arrayBuffer()),
        mimeType: pf.type || 'application/octet-stream',
        description: '',
      });
    }
    setPending([...pending, ...loaded]);
  };

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'dinh-kem'),
        bytes: await addAttachments(f.buffer, pending),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <div>
          <div className="pdft-bar" style={{ marginBottom: 12 }}>
            <strong>{pending.length} tệp sẽ đính kèm</strong>
            <div className="pdft-bar__spacer" />
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              + Chọn tệp đính kèm
              <input type="file" multiple hidden onChange={onPickFiles} />
            </label>
          </div>
          {pending.length === 0 ? (
            <div className="pdft-empty">Chọn một hoặc nhiều tệp (Word, Excel, ảnh, ZIP...) để nhúng vào bên trong tệp PDF.</div>
          ) : (
            <div className="pdft-files">
              {pending.map((p, i) => (
                <div key={i} className="pdft-file" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                  <div>
                    <strong>{p.name}</strong>
                    <div className="pdft-file__meta">{formatBytes(p.bytes.byteLength)}</div>
                  </div>
                  <input
                    className="pdft-input"
                    placeholder="Ghi chú mô tả (tùy chọn)"
                    value={p.description}
                    onChange={(e) => setPending(pending.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))}
                  />
                  <button
                    type="button"
                    className="pdft-icon-btn pdft-icon-btn--danger"
                    onClick={() => setPending(pending.filter((_, k) => k !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      panel={(file) => (
        <>
          <h3>Đính kèm tệp vào PDF</h3>
          <Notice>Các tệp được nhúng vào mục EmbeddedFiles chuẩn PDF, người nhận có thể mở từ thanh Tệp đính kèm của Adobe Reader, Foxit hoặc trình duyệt.</Notice>
          <ProcessButton
            task={task}
            label="Nhúng tệp vào PDF"
            icon={<Paperclip size={18} />}
            disabled={!file || pending.length === 0}
            onClick={run}
          />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 5. Lấy tệp đính kèm (extract-attachments)
// ---------------------------------------------------------------------------
export const ExtractAttachments: React.FC = () => {
  const toolId = 'extract-attachments';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;

  const list = useAsyncResult(f ? f.id : null, () => (f ? listAttachments(f.buffer) : Promise.resolve([])));
  const items = list.value ?? [];

  const run = () =>
    task.run(async () =>
      items.map((a) => ({
        name: a.name,
        bytes: a.data(),
      }))
    );

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() =>
        items.length === 0 ? (
          <div className="pdft-empty">Tệp PDF này không chứa tệp đính kèm nào.</div>
        ) : (
          <div className="pdft-files">
            {items.map((a, i) => (
              <div key={i} className="pdft-file" style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <strong>{a.name}</strong>
                  <div className="pdft-file__meta">
                    {a.scope === 'doc' ? 'Đính kèm cấp tài liệu' : `Chú thích trang ${a.page}`}
                    {a.description ? ` · ${a.description}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => downloadOutput({ name: a.name, bytes: a.data() })}
                >
                  <Download size={15} /> Tải về
                </button>
              </div>
            ))}
          </div>
        )
      }
      panel={(file) => (
        <>
          <h3>Lấy tệp đính kèm</h3>
          <Notice>Tìm thấy {items.length} tệp đính kèm trong PDF.</Notice>
          <ProcessButton
            task={task}
            label="Trích xuất tất cả"
            icon={<FolderDown size={18} />}
            disabled={!file || items.length === 0}
            onClick={run}
          />
          <ResultPanel task={task} zipName="tep-dinh-kem.zip" />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 6. Quản lý / xóa tệp đính kèm (edit-attachments)
// ---------------------------------------------------------------------------
interface EditableAttachment {
  originalName: string;
  newName: string;
  description: string;
  keep: boolean;
}

export const EditAttachments: React.FC = () => {
  const toolId = 'edit-attachments';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;

  const loaded = useAsyncResult(
    f ? f.id : null,
    async () => {
      if (!f) return { docItems: [] as EditableAttachment[], pageCount: 0 };
      const all = await listAttachments(f.buffer);
      return {
        docItems: all
          .filter((a) => a.scope === 'doc')
          .map((a) => ({ originalName: a.name, newName: a.name, description: a.description, keep: true })),
        pageCount: all.filter((a) => a.scope === 'page').length,
      };
    }
  );

  const [draft, setDraft] = useState<{ fileId: string; items: EditableAttachment[] } | null>(null);
  const [removePageAtt, setRemovePageAtt] = useToolState(toolId, 'rmPage', false);
  const items = draft && draft.fileId === f?.id ? draft.items : (loaded.value?.docItems ?? []);
  const setItems = (next: EditableAttachment[]) => f && setDraft({ fileId: f.id, items: next });

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'quan-ly-dinh-kem'),
        bytes: await rewriteAttachments(
          f.buffer,
          items.filter((x) => x.keep),
          removePageAtt
        ),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() =>
        items.length === 0 && !(loaded.value?.pageCount ?? 0) ? (
          <div className="pdft-empty">Tệp PDF này không có tệp đính kèm nào để chỉnh sửa.</div>
        ) : (
          <div className="pdft-files">
            {items.map((it, i) => (
              <div key={i} className="pdft-file" style={{ gridTemplateColumns: 'auto 1fr 1fr' }}>
                <Toggle
                  checked={it.keep}
                  onChange={(v) => setItems(items.map((x, k) => (k === i ? { ...x, keep: v } : x)))}
                  label="Giữ"
                />
                <input
                  className="pdft-input"
                  value={it.newName}
                  disabled={!it.keep}
                  onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, newName: e.target.value } : x)))}
                />
                <input
                  className="pdft-input"
                  placeholder="Mô tả"
                  value={it.description}
                  disabled={!it.keep}
                  onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))}
                />
              </div>
            ))}
          </div>
        )
      }
      panel={(file) => (
        <>
          <h3>Quản lý tệp đính kèm</h3>
          <Notice>Đổi tên, sửa mô tả hoặc bỏ chọn để xóa các tệp nhúng khỏi tài liệu PDF.</Notice>
          {(loaded.value?.pageCount ?? 0) > 0 && (
            <Toggle
              checked={removePageAtt}
              onChange={setRemovePageAtt}
              label={`Xóa ${loaded.value?.pageCount} chú thích đính kèm trên trang`}
            />
          )}
          <ProcessButton task={task} label="Lưu thay đổi" icon={<Trash2 size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 7. Lớp nội dung PDF (pdf-layers)
// ---------------------------------------------------------------------------
export const PdfLayers: React.FC = () => {
  const toolId = 'pdf-layers';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;

  const loaded = useAsyncResult(f ? f.id : null, () => (f ? listLayers(f.buffer) : Promise.resolve([])));
  const [draft, setDraft] = useState<{ fileId: string; layers: { index: number; name: string; visible: boolean }[] } | null>(null);
  const layers =
    draft && draft.fileId === f?.id
      ? draft.layers
      : (loaded.value ?? []).map((l) => ({ index: l.index, name: l.name, visible: l.visible }));
  const setLayers = (next: typeof layers) => f && setDraft({ fileId: f.id, layers: next });

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, 'lop-noi-dung'),
        bytes: await updateLayers(f.buffer, layers),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() =>
        layers.length === 0 ? (
          <div className="pdft-empty">Tệp PDF này không có lớp nội dung (Optional Content Groups / OCG).</div>
        ) : (
          <div className="pdft-files">
            {layers.map((l, i) => (
              <div key={l.index} className="pdft-file" style={{ gridTemplateColumns: 'auto 1fr' }}>
                <Toggle
                  checked={l.visible}
                  onChange={(v) => setLayers(layers.map((x, k) => (k === i ? { ...x, visible: v } : x)))}
                  label="Hiển thị"
                />
                <input
                  className="pdft-input"
                  value={l.name}
                  onChange={(e) => setLayers(layers.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                />
              </div>
            ))}
          </div>
        )
      }
      panel={(file) => (
        <>
          <h3>Lớp nội dung (Layers)</h3>
          <Notice>Bật/tắt trạng thái hiển thị mặc định và đổi tên các lớp bản vẽ CAD / Illustrator trong tệp PDF.</Notice>
          <ProcessButton task={task} label="Lưu cấu hình lớp" icon={<Layers size={18} />} disabled={!file || layers.length === 0} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 8. So sánh hai tệp PDF (compare-pdfs)
// ---------------------------------------------------------------------------
async function extractPageTextLines(buffer: ArrayBuffer, pageNo: number): Promise<string[]> {
  const pdf = await getPdfDocumentProxy(buffer);
  if (pageNo > pdf.numPages) return [];
  const page = await pdf.getPage(pageNo);
  const tc = await page.getTextContent();
  const byY = new Map<number, { x: number; str: string }[]>();
  for (const it of tc.items as any[]) {
    const str = String(it.str ?? '').trim();
    if (!str || !it.transform) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    const row = byY.get(y) ?? [];
    row.push({ x: it.transform[4], str });
    byY.set(y, row);
  }
  return [...byY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) =>
      parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

async function buildVisualDiff(bufA: ArrayBuffer, bufB: ArrayBuffer, pageNo: number) {
  const [canA, canB] = await Promise.all([renderPageToCanvas(bufA, pageNo, 520), renderPageToCanvas(bufB, pageNo, 520)]);
  const w = Math.max(canA.canvas.width, canB.canvas.width);
  const h = Math.max(canA.canvas.height, canB.canvas.height);
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const ctx = diffCanvas.getContext('2d')!;
  const ctxA = canA.canvas.getContext('2d')!;
  const ctxB = canB.canvas.getContext('2d')!;
  const dA = ctxA.getImageData(0, 0, canA.canvas.width, canA.canvas.height);
  const dB = ctxB.getImageData(0, 0, canB.canvas.width, canB.canvas.height);
  const out = ctx.createImageData(w, h);
  let changedPixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const iA = x < dA.width && y < dA.height ? (y * dA.width + x) * 4 : -1;
      const iB = x < dB.width && y < dB.height ? (y * dB.width + x) * 4 : -1;
      const rA = iA >= 0 ? dA.data[iA] : 255;
      const gA = iA >= 0 ? dA.data[iA + 1] : 255;
      const bA = iA >= 0 ? dA.data[iA + 2] : 255;
      const rB = iB >= 0 ? dB.data[iB] : 255;
      const gB = iB >= 0 ? dB.data[iB + 1] : 255;
      const bB = iB >= 0 ? dB.data[iB + 2] : 255;
      const delta = Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB);
      if (delta > 45) {
        changedPixels++;
        out.data[idx] = 220;
        out.data[idx + 1] = 38;
        out.data[idx + 2] = 38;
        out.data[idx + 3] = 255;
      } else {
        const gray = Math.round(0.3 * rA + 0.59 * gA + 0.11 * bA);
        out.data[idx] = Math.min(255, gray + 35);
        out.data[idx + 1] = Math.min(255, gray + 35);
        out.data[idx + 2] = Math.min(255, gray + 35);
        out.data[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return {
    imgA: canA.canvas.toDataURL('image/png'),
    imgB: canB.canvas.toDataURL('image/png'),
    imgDiff: diffCanvas.toDataURL('image/png'),
    percentChanged: ((changedPixels / (w * h)) * 100).toFixed(2),
  };
}

export const ComparePdfs: React.FC = () => {
  const toolId = 'compare-pdfs';
  const files = useToolFiles(toolId, { multiple: true });
  const ready = files.files.filter((x) => x.pageCount && !x.error);
  const fileA = ready[0];
  const fileB = ready[1];
  const maxPage = Math.max(fileA?.pageCount ?? 1, fileB?.pageCount ?? 1);

  const [mode, setMode] = useToolState<'text' | 'visual'>(toolId, 'mode', 'text');
  const [page, setPage] = useState(1);
  const curPage = Math.min(page, maxPage);

  const comparison = useAsyncResult(
    fileA && fileB ? `${fileA.id}|${fileB.id}|${curPage}|${mode}` : null,
    async () => {
      if (!fileA || !fileB) return null;
      const [linesA, linesB] = await Promise.all([
        extractPageTextLines(fileA.buffer, curPage),
        extractPageTextLines(fileB.buffer, curPage),
      ]);
      const setA = new Set(linesA);
      const setB = new Set(linesB);
      const removed = linesA.filter((l) => !setB.has(l));
      const added = linesB.filter((l) => !setA.has(l));
      const visual =
        mode === 'visual' && curPage <= (fileA.pageCount ?? 0) && curPage <= (fileB.pageCount ?? 0)
          ? await buildVisualDiff(fileA.buffer, fileB.buffer, curPage)
          : null;
      return { linesA, linesB, removed, added, visual };
    }
  );

  return (
    <MultiFileTool
      toolId={toolId}
      files={files}
      dropTitle="Chọn 2 tệp PDF cần đối chiếu (bản gốc và bản sửa đổi)"
      before={
        fileA && fileB && comparison.value ? (
          <div style={{ marginBottom: 16 }}>
            <div className="pdft-bar" style={{ marginBottom: 12 }}>
              <strong>
                Đối chiếu trang {curPage}/{maxPage}
              </strong>
              <div className="pdft-bar__spacer" />
              <span className="pdft-badge">-{comparison.value.removed.length} dòng bớt</span>
              <span className="pdft-badge">+{comparison.value.added.length} dòng thêm</span>
            </div>
            {mode === 'text' ? (
              <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="pdft-file" style={{ display: 'block' }}>
                  <strong>Bản 1: {fileA.file.name}</strong>
                  {comparison.value.removed.length === 0 ? (
                    <div className="pdft-file__meta" style={{ marginTop: 8 }}>
                      Không có dòng nào bị xóa trên trang này.
                    </div>
                  ) : (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#b91c1c' }}>
                      {comparison.value.removed.map((l, i) => (
                        <li key={i}>- {l}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="pdft-file" style={{ display: 'block' }}>
                  <strong>Bản 2: {fileB.file.name}</strong>
                  {comparison.value.added.length === 0 ? (
                    <div className="pdft-file__meta" style={{ marginTop: 8 }}>
                      Không có dòng nào mới thêm trên trang này.
                    </div>
                  ) : (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#15803d' }}>
                      {comparison.value.added.map((l, i) => (
                        <li key={i}>+ {l}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : comparison.value.visual ? (
              <div>
                <Notice>
                  Tỉ lệ điểm ảnh khác biệt trên trang {curPage}: <strong>{comparison.value.visual.percentChanged}%</strong> (vùng màu đỏ là chỗ thay đổi).
                </Notice>
                <div className="pdft-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                  <img src={comparison.value.visual.imgA} alt="Bản 1" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)' }} />
                  <img src={comparison.value.visual.imgB} alt="Bản 2" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)' }} />
                  <img src={comparison.value.visual.imgDiff} alt="Khác biệt" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-subtle)' }} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null
      }
      panel={
        <>
          <h3>So sánh 2 tệp PDF</h3>
          <Notice>Chọn ít nhất 2 tệp PDF ở khung bên trái để so sánh từng trang theo câu chữ hoặc chồng hình điểm ảnh.</Notice>
          <Field label="Chế độ đối chiếu">
            <Segmented
              label="Chế độ đối chiếu"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'text', label: 'So sánh câu chữ' },
                { value: 'visual', label: 'So sánh hình ảnh' },
              ]}
            />
          </Field>
          <Field label={`Trang đang xem (1..${maxPage})`} htmlFor="cmp-page">
            <NumberInput id="cmp-page" value={curPage} min={1} max={Math.max(1, maxPage)} onChange={(v) => setPage(Math.round(v))} />
          </Field>
          {fileA && fileB && (
            <div className="pdft-file__meta">
              <FileCheck2 size={15} style={{ verticalAlign: 'middle' }} /> {fileA.file.name} ({fileA.pageCount} trang) ↔ {fileB.file.name} ({fileB.pageCount} trang)
            </div>
          )}
          {!fileA || !fileB ? (
            <div className="pdft-file__meta">
              <Eye size={15} style={{ verticalAlign: 'middle' }} /> Hãy thêm đủ 2 tệp PDF để bắt đầu.
            </div>
          ) : null}
        </>
      }
    />
  );
};
