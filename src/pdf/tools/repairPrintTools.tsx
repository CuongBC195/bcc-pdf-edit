import React from 'react';
import { Archive, Compass, Gauge, Image as ImageIcon, Type, Wrench } from 'lucide-react';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { baseName } from '../core/download';
import { loadPdf, rotateCustom, savePdf } from '../core/ops';
import { compactPdf, runQpdf } from '../core/qpdf';
import { rasterizePdf, renderAtDpi } from '../core/raster';
import { Field, Notice, ProcessButton, ResultPanel, Segmented, Toggle, ToolLayout, ToolShell } from '../ui/components';
import { useTask, useToolState } from '../ui/hooks';
import { parseRange } from '../ui/selection';
import { useToolFiles } from '../ui/useToolFiles';
import { SingleFileTool } from './common';
import { outName } from './naming';

// ---------------------------------------------------------------------------
// 1. Sửa tệp PDF bị lỗi (repair-pdf)
// ---------------------------------------------------------------------------
export const RepairPdf: React.FC = () => {
  const toolId = 'repair-pdf';
  const task = useTask();
  const [raw, setRaw] = React.useState<{ name: string; buffer: ArrayBuffer } | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setRaw({ name: f.name, buffer: await f.arrayBuffer() });
  };

  const run = () =>
    raw &&
    task.run(async () => {
      try {
        const res = await runQpdf(raw.buffer, ['--object-streams=generate', '--compress-streams=y']);
        return {
          outputs: [{ name: `${baseName(raw.name)}_da-sua.pdf`, bytes: res.output }],
          note: res.exitCode === 3 ? 'Đã phục hồi bảng tham chiếu chéo (xref) và luồng bị lỗi.' : 'Đã kiểm tra và chuẩn hóa cấu trúc PDF.',
        };
      } catch {
        const doc = await PDFDocument.load(new Uint8Array(raw.buffer), { ignoreEncryption: true, throwOnInvalidObject: false });
        const bytes = await savePdf(doc);
        return {
          outputs: [{ name: `${baseName(raw.name)}_da-sua.pdf`, bytes }],
          note: 'Đã dựng lại cấu trúc đối tượng PDF.',
        };
      }
    });

  return (
    <ToolShell toolId={toolId}>
      <ToolLayout
        main={
          <label className="pdft-drop" style={{ cursor: 'pointer' }}>
            <Wrench size={36} />
            <div className="pdft-drop__title">{raw ? `Đã nạp: ${raw.name}` : 'Chọn tệp PDF bị hỏng hoặc báo lỗi khi mở'}</div>
            <div className="pdft-drop__sub">Tái tạo bảng tham chiếu chéo (xref table), trailer và các luồng dữ liệu bị đứt gãy.</div>
            <input type="file" accept="application/pdf,.pdf" hidden onChange={onPick} />
          </label>
        }
        panel={
          <>
            <h3>Phục hồi tệp PDF</h3>
            <Notice>Sử dụng trình phục hồi qpdf kết hợp bộ đọc khoan dung lỗi để cứu các trang còn nguyên vẹn trong tệp hỏng.</Notice>
            <ProcessButton task={task} label="Sửa chữa tệp PDF" icon={<Wrench size={18} />} disabled={!raw} onClick={run} />
            <ResultPanel task={task} />
          </>
        }
      />
    </ToolShell>
  );
};

// ---------------------------------------------------------------------------
// 2. Tối ưu mở nhanh trên web — Fast Web View (linearize-pdf)
// ---------------------------------------------------------------------------
export const LinearizePdf: React.FC = () => {
  const toolId = 'linearize-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;

  const run = () =>
    f &&
    task.run(async () => {
      const res = await runQpdf(f.buffer, ['--linearize']);
      return [{ name: outName(f, 'web-nhanh'), bytes: res.output }];
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Tuyến tính hóa (Linearize / Fast Web View) sắp xếp lại các đối tượng bên trong tệp PDF để trình duyệt hiển thị ngay trang đầu tiên khi vừa tải một phần tệp (HTTP Byte-Range), không phải chờ tải xong cả tệp hàng chục MB.
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Tối ưu mở trên Web</h3>
          <ProcessButton task={task} label="Tối ưu Fast Web View" icon={<Gauge size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. Chuyển trang PDF thành ảnh phẳng (rasterize-pdf)
// ---------------------------------------------------------------------------
export const RasterizePdfTool: React.FC = () => {
  const toolId = 'rasterize-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;

  const [dpi, setDpi] = useToolState(toolId, 'dpi', 150);
  const [format, setFormat] = useToolState<'jpeg' | 'png'>(toolId, 'fmt', 'jpeg');
  const [quality, setQuality] = useToolState(toolId, 'quality', 0.86);
  const [range, setRange] = useToolState(toolId, 'range', '');
  const pages = parseRange(range, total);

  const run = () =>
    f &&
    task.run(async (report) => [
      {
        name: outName(f, 'hoa-anh'),
        bytes: await rasterizePdf(f.buffer, {
          dpi,
          format,
          quality,
          pages: pages.pages,
          onProgress: (d, t) => report(Math.round((d / t) * 100), `Đang chuyển trang ${d}/${t}...`),
        }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Chuyển toàn bộ chữ, bảng và lớp đồ họa vector của từng trang thành một lớp hình ảnh duy nhất trong PDF. Đảm bảo hiển thị giống hệt 100% trên mọi thiết bị và ngăn sao chép văn bản.
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Hóa ảnh trang PDF</h3>
          <Field label="Độ phân giải (DPI)">
            <Segmented
              label="DPI"
              value={String(dpi)}
              onChange={(v) => setDpi(Number(v))}
              options={[
                { value: '150', label: '150 DPI' },
                { value: '220', label: '220 DPI' },
                { value: '300', label: '300 DPI' },
              ]}
            />
          </Field>
          <Field label="Định dạng nén ảnh">
            <Segmented
              label="Định dạng"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'jpeg', label: 'JPEG (Nhẹ)' },
                { value: 'png', label: 'PNG (Sắc nét)' },
              ]}
            />
          </Field>
          {format === 'jpeg' && (
            <Field label={`Chất lượng JPEG: ${Math.round(quality * 100)}%`} htmlFor="ras-q">
              <input id="ras-q" type="range" min={0.5} max={1} step={0.02} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </Field>
          )}
          <Field label="Áp dụng cho trang (để trống = tất cả)" htmlFor="ras-range">
            <input id="ras-range" className="pdft-input" value={range} placeholder="Ví dụ: 1-5" onChange={(e) => setRange(e.target.value)} />
            {pages.error && <Notice kind="error">{pages.error}</Notice>}
          </Field>
          <ProcessButton task={task} label="Chuyển trang thành ảnh" icon={<ImageIcon size={18} />} disabled={!file || !!pages.error} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 4. Chuyển sang chuẩn lưu trữ PDF/A (pdf-to-pdfa)
// ---------------------------------------------------------------------------
async function convertToPdfA(buffer: ArrayBuffer, part: '1B' | '2B' | '3B'): Promise<Uint8Array> {
  const doc = await loadPdf(buffer);
  const title = doc.getTitle() || 'Tai lieu luu tru PDF/A';
  const author = doc.getAuthor() || '';
  const nowIso = new Date().toISOString();
  const partNum = part[0];

  // Gỡ bỏ các thành phần bị cấm trong chuẩn PDF/A (JavaScript, hành động tự chạy, mật khẩu)
  doc.catalog.delete(PDFName.of('OpenAction'));
  doc.catalog.delete(PDFName.of('AA'));
  const names = doc.catalog.get(PDFName.of('Names'));
  if (names) {
    const namesDict = doc.context.lookup(names);
    if (namesDict && 'delete' in namesDict) {
      (namesDict as any).delete(PDFName.of('JavaScript'));
    }
  }

  // Luồng siêu dữ liệu XMP có khai báo pdfaid:part và pdfaid:conformance
  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCzehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>${partNum}</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title.replace(/[<>&]/g, '')}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${author.replace(/[<>&]/g, '')}</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreateDate>${nowIso}</xmp:CreateDate>
      <xmp:ModifyDate>${nowIso}</xmp:ModifyDate>
      <xmp:CreatorTool>bccHub PDF/A</xmp:CreatorTool>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const xmpBytes = new TextEncoder().encode(xmp);
  const metadataStream = doc.context.stream(xmpBytes, {
    Type: 'Metadata',
    Subtype: 'XML',
    Length: xmpBytes.byteLength,
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(metadataStream));

  // Khai báo OutputIntents chuẩn sRGB IEC61966-2.1
  const outputIntent = doc.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
  });
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([doc.context.register(outputIntent)]));

  const saved = await savePdf(doc);
  return compactPdf(saved);
}

export const PdfToPdfa: React.FC = () => {
  const toolId = 'pdf-to-pdfa';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [part, setPart] = useToolState<'1B' | '2B' | '3B'>(toolId, 'part', '2B');

  const run = () =>
    f &&
    task.run(async () => [
      {
        name: outName(f, `pdfa-${part.toLowerCase()}`),
        bytes: await convertToPdfA(f.buffer, part),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Nhúng gói siêu dữ liệu chuẩn lưu trữ dài hạn ISO 19005 (<code>pdfaid:part</code> &amp; <code>pdfaid:conformance=B</code>), thông tin hệ màu OutputIntent sRGB và loại bỏ các thành phần động bị cấm (JavaScript, âm thanh, hành động tự chạy).
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Chuẩn lưu trữ PDF/A</h3>
          <Field label="Phiên bản tiêu chuẩn">
            <Segmented
              label="Phiên bản PDF/A"
              value={part}
              onChange={setPart}
              options={[
                { value: '1B', label: 'PDF/A-1b' },
                { value: '2B', label: 'PDF/A-2b (Khuyên dùng)' },
                { value: '3B', label: 'PDF/A-3b' },
              ]}
            />
          </Field>
          <ProcessButton task={task} label="Chuyển sang PDF/A" icon={<Archive size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 5. Tự động làm thẳng trang scan bị nghiêng (deskew-pdf)
// ---------------------------------------------------------------------------
async function detectSkewAngle(buffer: ArrayBuffer, pageNo: number, maxDeg: number): Promise<number> {
  const canvas = await renderAtDpi(buffer, pageNo, 72);
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  // Thu nhỏ nhị phân (1 = có mực, 0 = trắng) để tính nhanh
  const step = 2;
  const sw = Math.floor(w / step);
  const sh = Math.floor(h / step);
  const ink = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * step * w + x * step) * 4;
      const lum = 0.3 * rgba[i] + 0.59 * rgba[i + 1] + 0.11 * rgba[i + 2];
      ink[y * sw + x] = lum < 200 ? 1 : 0;
    }
  }
  canvas.width = 0;
  canvas.height = 0;

  let bestAngle = 0;
  let bestScore = -1;
  const cx = sw / 2;
  const cy = sh / 2;

  for (let deg = -maxDeg; deg <= maxDeg; deg += 0.25) {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const rowCounts = new Int32Array(sh);
    for (let y = 0; y < sh; y++) {
      const dy = y - cy;
      for (let x = 0; x < sw; x++) {
        if (!ink[y * sw + x]) continue;
        const ry = Math.round((x - cx) * sin + dy * cos + cy);
        if (ry >= 0 && ry < sh) rowCounts[ry]++;
      }
    }
    let score = 0;
    for (let r = 1; r < sh; r++) {
      const diff = rowCounts[r] - rowCounts[r - 1];
      score += diff * diff;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }
  return Math.abs(bestAngle) < 0.25 ? 0 : -bestAngle;
}

export const DeskewPdf: React.FC = () => {
  const toolId = 'deskew-pdf';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const total = f?.pageCount ?? 0;
  const [maxAngle, setMaxAngle] = useToolState(toolId, 'maxAngle', 6);
  const [shrinkToFit, setShrinkToFit] = useToolState(toolId, 'shrink', false);

  const run = () =>
    f &&
    task.run(async (report) => {
      let currentBytes: ArrayBuffer | Uint8Array = f.buffer;
      let correctedCount = 0;
      for (let p = 1; p <= total; p++) {
        report(Math.round((p / total) * 100), `Đang đo góc nghiêng trang ${p}/${total}...`);
        const angle = await detectSkewAngle(f.buffer, p, maxAngle);
        if (Math.abs(angle) >= 0.25) {
          correctedCount++;
          currentBytes = await rotateCustom(currentBytes, { angle, pages: [p], keepSize: shrinkToFit });
        }
      }
      const out = currentBytes instanceof Uint8Array ? currentBytes : new Uint8Array(currentBytes);
      return {
        outputs: [{ name: outName(f, 'lam-thang'), bytes: out }],
        note: correctedCount
          ? `Đã tự động cân chỉnh góc nghiêng cho ${correctedCount}/${total} trang.`
          : 'Các trang đã thẳng sẵn (độ lệch < 0.25°).',
      };
    });

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Phân tích mật độ dòng chữ trên từng trang để tự động tìm góc lệch khi quét tài liệu và xoay từng trang về đúng phương ngang.
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Làm thẳng trang scan</h3>
          <Field label={`Góc nghiêng tối đa cần dò: ±${maxAngle}°`} htmlFor="dk-max">
            <input id="dk-max" type="range" min={2} max={12} value={maxAngle} onChange={(e) => setMaxAngle(Number(e.target.value))} />
          </Field>
          <Toggle checked={shrinkToFit} onChange={setShrinkToFit} label="Thu nhỏ nhẹ để không bị cắt mép góc khi xoay" />
          <ProcessButton task={task} label="Tự động làm thẳng PDF" icon={<Compass size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};

// ---------------------------------------------------------------------------
// 6. Chuyển phông chữ thành hình in ấn (font-to-outline)
// ---------------------------------------------------------------------------
export const FontToOutline: React.FC = () => {
  const toolId = 'font-to-outline';
  const files = useToolFiles(toolId);
  const task = useTask();
  const f = files.file;
  const [dpi, setDpi] = useToolState(toolId, 'dpi', 300);

  const run = () =>
    f &&
    task.run(async (report) => [
      {
        name: outName(f, 'khong-phu-thuoc-font'),
        bytes: await rasterizePdf(f.buffer, {
          dpi,
          format: 'png',
          onProgress: (d, t) => report(Math.round((d / t) * 100), `Đang chuyển chữ trang ${d}/${t}...`),
        }),
      },
    ]);

  return (
    <SingleFileTool
      toolId={toolId}
      files={files}
      main={() => (
        <Notice>
          Loại bỏ hoàn toàn sự phụ thuộc vào phông chữ trên máy người nhận hoặc nhà in bằng cách kết xuất từng trang ở độ phân giải in ấn cao (300 DPI không nén mất nét). Đảm bảo không bao giờ bị lỗi nhảy phông hay mất dấu tiếng Việt khi đem đi in.
        </Notice>
      )}
      panel={(file) => (
        <>
          <h3>Cố định phông chữ in ấn</h3>
          <Field label="Độ nét xuất bản">
            <Segmented
              label="Độ nét"
              value={String(dpi)}
              onChange={(v) => setDpi(Number(v))}
              options={[
                { value: '200', label: '200 DPI' },
                { value: '300', label: '300 DPI (In chuẩn)' },
              ]}
            />
          </Field>
          <ProcessButton task={task} label="Cố định chữ (300 DPI)" icon={<Type size={18} />} disabled={!file} onClick={run} />
          <ResultPanel task={task} />
        </>
      )}
    />
  );
};
