import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  FlipHorizontal,
  FlipVertical,
  Monitor,
  RotateCw,
  ScanText,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { HubShell } from '../hub/HubShell';
import { consumePendingContextFile } from '../utils/contextFileStore';
import { ToolPageHeader } from './ToolPageHeader';

export type OfficeImageToolId =
  | 'capture-to-text'
  | 'signature-extractor'
  | 'image-converter'
  | 'image-resizer'
  | 'image-compressor'
  | 'id-photo-cropper'
  | 'id-card-merger';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Không thể đọc hình ảnh'));
  });
  return img;
}

/**
 * Thuật toán Unsharp Mask (USM) 3x3 tái tạo độ nét cạnh sau khi phóng to / thu nhỏ
 * Giúp chữ, con dấu, đường viền và chi tiết ảnh không bị nhòe mờ khi đổi kích thước.
 */
function applyUnsharpMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number // 0 -> 1.5
): void {
  if (amount <= 0.01) return;
  const imgData = ctx.getImageData(0, 0, width, height);
  const src = imgData.data;
  const dst = new Uint8ClampedArray(src);

  // Kernel làm nét bảo toàn cạnh (Edge-preserving sharpen)
  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = (rowOffset + x) * 4;
      const top = ((y - 1) * width + x) * 4;
      const bottom = ((y + 1) * width + x) * 4;
      const left = (rowOffset + x - 1) * 4;
      const right = (rowOffset + x + 1) * 4;

      for (let c = 0; c < 3; c++) {
        const center = src[idx + c];
        const blur = (src[top + c] + src[bottom + c] + src[left + c] + src[right + c]) * 0.25;
        const diff = center - blur;
        // Ngưỡng khử nhiễu hạt (threshold = 2) để không làm rỗ vùng nền mịn
        if (Math.abs(diff) > 2) {
          dst[idx + c] = Math.min(255, Math.max(0, Math.round(center + diff * amount)));
        }
      }
    }
  }

  imgData.data.set(dst);
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Thuật toán đổi kích thước đa bước (Multi-step Progressive Scaling)
 * - Khi thu nhỏ sâu: giảm từng bước 50% để chống răng cưa (aliasing).
 * - Khi phóng to: nội suy chất lượng cao (high) + khử mờ cạnh bằng Unsharp Mask.
 */
function drawResizedHighQuality(
  targetCanvas: HTMLCanvasElement,
  sourceImg: HTMLImageElement,
  targetW: number,
  targetH: number,
  options: {
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    sharpenAmount: number;
    pixelated?: boolean;
    bgColor?: string;
  }
): void {
  const { rotation, flipH, flipV, sharpenAmount, pixelated = false, bgColor } = options;
  const isRotated90 = rotation % 180 !== 0;
  const finalW = isRotated90 ? targetH : targetW;
  const finalH = isRotated90 ? targetW : targetH;

  // Bước 1: Multi-step step-down nếu thu nhỏ nhiều hơn 50%
  let curSource: CanvasImageSource = sourceImg;
  let curW = sourceImg.naturalWidth;
  let curH = sourceImg.naturalHeight;

  if (!pixelated) {
    while (curW * 0.5 > targetW && curH * 0.5 > targetH && curW > 64 && curH > 64) {
      const nextW = Math.max(targetW, Math.round(curW * 0.5));
      const nextH = Math.max(targetH, Math.round(curH * 0.5));
      const stepCanvas = document.createElement('canvas');
      stepCanvas.width = nextW;
      stepCanvas.height = nextH;
      const stepCtx = stepCanvas.getContext('2d');
      if (!stepCtx) break;
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(curSource, 0, 0, curW, curH, 0, 0, nextW, nextH);
      curSource = stepCanvas;
      curW = nextW;
      curH = nextH;
    }
  }

  targetCanvas.width = finalW;
  targetCanvas.height = finalH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, finalW, finalH);
  } else {
    ctx.clearRect(0, 0, finalW, finalH);
  }

  ctx.save();
  ctx.imageSmoothingEnabled = !pixelated;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(finalW / 2, finalH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(curSource, -targetW / 2, -targetH / 2, targetW, targetH);
  ctx.restore();

  if (!pixelated && sharpenAmount > 0 && finalW * finalH <= 4096 * 4096) {
    applyUnsharpMask(ctx, finalW, finalH, sharpenAmount);
  }
}

// ============================================================================
// 1. ĐỔI ĐUÔI ẢNH TỨC THÌ (PNG <-> JPG <-> WEBP <-> ICO)
// ============================================================================
type TargetFormat = 'jpg' | 'png' | 'webp' | 'ico';

interface ConvertedFileItem {
  id: string;
  originalName: string;
  originalFormat: string;
  originalSize: number;
  outName: string;
  outSize: number;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

const ImageConverterView: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('jpg');
  const [jpgQuality, setJpgQuality] = useState<number>(92);
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [items, setItems] = useState<ConvertedFileItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hỗ trợ Ctrl+V dán ảnh trực tiếp để đổi đuôi ngay
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const clipItems = e.clipboardData?.items;
      if (!clipItems) return;
      const pasted: File[] = [];
      for (const item of clipItems) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) pasted.push(f);
        }
      }
      if (pasted.length > 0) {
        setFiles((prev) => [...prev, ...pasted]);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const convertAll = async () => {
      const next: ConvertedFileItem[] = [];
      for (const file of files) {
        if (cancelled) return;
        try {
          const img = await loadImageFromBlob(file);
          const w = targetFormat === 'ico' ? 256 : img.naturalWidth;
          const h = targetFormat === 'ico' ? 256 : img.naturalHeight;

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          if (targetFormat === 'jpg') {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(img.src);

          const mime =
            targetFormat === 'jpg'
              ? 'image/jpeg'
              : targetFormat === 'webp'
                ? 'image/webp'
                : 'image/png';
          const q = targetFormat === 'jpg' || targetFormat === 'webp' ? jpgQuality / 100 : undefined;

          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), mime, q)
          );
          if (!blob) continue;

          const origExt =
            file.name.split('.').pop()?.toUpperCase() ||
            file.type.replace('image/', '').toUpperCase() ||
            'IMG';
          const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';

          next.push({
            id: `${file.name}-${file.size}-${ file.lastModified}`,
            originalName: file.name,
            originalFormat: origExt,
            originalSize: file.size,
            outName: `${baseName}.${targetFormat}`,
            outSize: blob.size,
            blob,
            previewUrl: URL.createObjectURL(blob),
            width: w,
            height: h,
          });
        } catch {
          // Bỏ qua file lỗi
        }
      }
      if (!cancelled) {
        setItems((prev) => {
          for (const it of prev) URL.revokeObjectURL(it.previewUrl);
          return next;
        });
      }
    };
    convertAll();
    return () => {
      cancelled = true;
    };
  }, [files, targetFormat, jpgQuality, bgColor]);

  const handleDownloadAllZip = async () => {
    if (items.length === 0) return;
    const zip = new JSZip();
    for (const item of items) {
      zip.file(item.outName, item.blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bcchub-doi-duoi-${targetFormat}-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '18px',
          }}
        >
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Chọn đuôi ảnh muốn chuyển sang (1 chạm):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { id: 'jpg', label: 'Sang .JPG (Chuẩn ảnh phổ thông)' },
                { id: 'png', label: 'Sang .PNG (Giữ độ nét gốc / Trong suốt)' },
                { id: 'webp', label: 'Sang .WebP (Ảnh Web siêu nhẹ)' },
                { id: 'ico', label: 'Sang .ICO (Icon 256×256)' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setTargetFormat(fmt.id as TargetFormat)}
                  className={`btn btn-sm ${targetFormat === fmt.id ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {targetFormat === 'jpg' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Màu nền thay vùng trong suốt PNG
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: '36px', height: '32px', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{bgColor}</span>
                </div>
              </div>
            )}

            {(targetFormat === 'jpg' || targetFormat === 'webp') && (
              <div style={{ minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Độ nét xuất ra: {jpgQuality}%
                </label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={jpgQuality}
                  onChange={(e) => setJpgQuality(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files).filter((f) =>
              f.type.startsWith('image/')
            );
            if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
          }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed var(--border-active)',
            borderRadius: 'var(--radius-md)',
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: 'rgba(6, 182, 212, 0.05)',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              if (selected.length) setFiles((prev) => [...prev, ...selected]);
              e.target.value = '';
            }}
          />
          <Upload size={28} color="var(--border-active)" style={{ marginBottom: '8px' }} />
          <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
            Kéo-thả ảnh, bấm để chọn nhiều ảnh (PNG, JPG, WebP, SVG, BMP) hoặc nhấn <kbd>Ctrl+V</kbd>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Đổi đuôi tức thì ngay khi chọn ảnh — không cần chờ tải lên máy chủ
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="bento-card" style={{ padding: '20px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            <span style={{ fontWeight: 700 }}>
              Đã chuyển đổi {items.length} ảnh sang .{targetFormat.toUpperCase()}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setFiles([])}
                className="btn btn-secondary btn-sm"
              >
                <Trash2 size={14} />
                <span>Xóa danh sách</span>
              </button>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={handleDownloadAllZip}
                  className="btn btn-primary btn-sm"
                >
                  <Download size={14} />
                  <span>Tải tất cả (.ZIP)</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img
                    src={item.previewUrl}
                    alt={item.outName}
                    style={{
                      width: '50px',
                      height: '50px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{item.outName}</div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '2px',
                      }}
                    >
                      <span className="badge badge-violet" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>
                        {item.originalFormat}
                      </span>
                      <ArrowRight size={12} />
                      <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>
                        {targetFormat.toUpperCase()}
                      </span>
                      <span>
                        • {item.width}×{item.height} px • {formatBytes(item.originalSize)} →{' '}
                        <strong>{formatBytes(item.outSize)}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const c = document.createElement('canvas');
                        const img = await loadImageFromBlob(item.blob);
                        c.width = img.naturalWidth;
                        c.height = img.naturalHeight;
                        c.getContext('2d')?.drawImage(img, 0, 0);
                        URL.revokeObjectURL(img.src);
                        const pngBlob = await new Promise<Blob | null>((r) =>
                          c.toBlob((b) => r(b), 'image/png')
                        );
                        if (pngBlob) {
                          await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': pngBlob }),
                          ]);
                          setCopiedId(item.id);
                          setTimeout(() => setCopiedId(null), 1600);
                        }
                      } catch {
                        // Bỏ qua nếu trình duyệt hạn chế
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedId === item.id ? 'Đã Copy' : 'Copy ảnh'}</span>
                  </button>

                  <a
                    href={item.previewUrl}
                    download={item.outName}
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={14} />
                    <span>Tải .{targetFormat.toUpperCase()}</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. ĐỔI KÍCH THƯỚC ẢNH CHỐNG VỠ NÉT (SUPER-SHARP RESIZE + ĐỔI ĐUÔI)
// ============================================================================
const ImageResizerView: React.FC = () => {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string>('anh-bcchub');
  const [targetW, setTargetW] = useState(1200);
  const [targetH, setTargetH] = useState(900);
  const [lockRatio, setLockRatio] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [sharpenMode, setSharpenMode] = useState<'auto' | 'high' | 'none' | 'pixel'>('auto');
  const [outFormat, setOutFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadNewImage = useCallback(async (blob: Blob, name = 'anh-bcchub') => {
    const img = await loadImageFromBlob(blob);
    setSourceImg(img);
    setSourceFileName(name.replace(/\.[^.]+$/, ''));
    setTargetW(img.naturalWidth);
    setTargetH(img.naturalHeight);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            loadNewImage(f, f.name || 'anh-clipboard');
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadNewImage]);

  const applyScaleMultiplier = (factor: number) => {
    if (!sourceImg) return;
    setTargetW(Math.max(1, Math.round(sourceImg.naturalWidth * factor)));
    setTargetH(Math.max(1, Math.round(sourceImg.naturalHeight * factor)));
  };

  const applyTargetWidthPreset = (w: number) => {
    setTargetW(w);
    if (sourceImg) {
      setTargetH(Math.max(1, Math.round((w * sourceImg.naturalHeight) / sourceImg.naturalWidth)));
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImg) return;

    const isUpscaling =
      targetW > sourceImg.naturalWidth || targetH > sourceImg.naturalHeight;
    let sharpenAmount = 0;
    if (sharpenMode === 'auto') {
      sharpenAmount = isUpscaling ? 0.65 : 0.25;
    } else if (sharpenMode === 'high') {
      sharpenAmount = 1.05;
    }

    drawResizedHighQuality(canvas, sourceImg, targetW, targetH, {
      rotation,
      flipH,
      flipV,
      sharpenAmount,
      pixelated: sharpenMode === 'pixel',
      bgColor: outFormat === 'jpg' ? '#ffffff' : undefined,
    });
  }, [sourceImg, targetW, targetH, rotation, flipH, flipV, sharpenMode, outFormat]);

  const handleCopyCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImg) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
    if (!blob) return;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImg) return;
    const mime =
      outFormat === 'jpg'
        ? 'image/jpeg'
        : outFormat === 'webp'
          ? 'image/webp'
          : 'image/png';
    const a = document.createElement('a');
    a.href = canvas.toDataURL(mime, 0.94);
    a.download = `${sourceFileName}-${canvas.width}x${canvas.height}.${outFormat}`;
    a.click();
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadNewImage(f, f.name);
          }}
        />

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            <Upload size={16} />
            <span>Chọn ảnh cần đổi size</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const items = await navigator.clipboard.read();
                for (const it of items) {
                  const t = it.types.find((x) => x.startsWith('image/'));
                  if (t) {
                    const b = await it.getType(t);
                    await loadNewImage(b, 'anh-clipboard');
                    return;
                  }
                }
              } catch {
                // Пользователь может нажать Ctrl+V
              }
            }}
            className="btn btn-secondary"
            title="Hoặc nhấn Ctrl+V trên trang"
          >
            <ClipboardPaste size={16} />
            <span>Dán ảnh (Ctrl+V)</span>
          </button>
        </div>

        {sourceImg && (
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
            Kích thước ảnh gốc: {sourceImg.naturalWidth} × {sourceImg.naturalHeight} px
          </div>
        )}

        {/* Mốc phóng to / thu nhỏ 1 chạm */}
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
            Chọn nhanh tỷ lệ / độ phân giải chuẩn:
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button type="button" onClick={() => applyScaleMultiplier(0.5)} className="hub-pill" style={{ cursor: 'pointer', fontSize: '0.75rem' }}>
              Thu nhỏ 50%
            </button>
            <button type="button" onClick={() => applyScaleMultiplier(1)} className="hub-pill" style={{ cursor: 'pointer', fontSize: '0.75rem' }}>
              Gốc 100%
            </button>
            <button type="button" onClick={() => applyScaleMultiplier(2)} className="hub-pill" style={{ cursor: 'pointer', fontSize: '0.75rem' }}>
              Phóng to 2× (Siêu nét)
            </button>
            <button type="button" onClick={() => applyScaleMultiplier(3)} className="hub-pill" style={{ cursor: 'pointer', fontSize: '0.75rem' }}>
              Phóng to 3×
            </button>
            <button type="button" onClick={() => applyTargetWidthPreset(1280)} className="hub-pill" style={{ cursor: 'pointer', fontSize: '0.75rem' }}>
              HD 1280px
            </button>
            <button type="button" onClick={() => applyTargetWidthPreset(1920)} className="hub-pill" style={{ cursor: 'pointer', fontSize: '0.75rem' }}>
              Full HD 1920px
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>
              Chiều rộng mới (px)
            </label>
            <input
              type="number"
              min={1}
              max={6000}
              value={targetW}
              onChange={(e) => {
                const w = Math.max(1, Math.min(6000, Number(e.target.value)));
                setTargetW(w);
                if (lockRatio && sourceImg) {
                  setTargetH(Math.max(1, Math.round((w * sourceImg.naturalHeight) / sourceImg.naturalWidth)));
                }
              }}
              className="input-field"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>
              Chiều cao mới (px)
            </label>
            <input
              type="number"
              min={1}
              max={6000}
              value={targetH}
              onChange={(e) => {
                const h = Math.max(1, Math.min(6000, Number(e.target.value)));
                setTargetH(h);
                if (lockRatio && sourceImg) {
                  setTargetW(Math.max(1, Math.round((h * sourceImg.naturalWidth) / sourceImg.naturalHeight)));
                }
              }}
              className="input-field"
            />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={lockRatio}
            onChange={(e) => setLockRatio(e.target.checked)}
          />
          <span>Khóa tỷ lệ khung hình (không làm méo ảnh)</span>
        </label>

        {/* Chế độ khử vỡ nét (Unsharp Mask + Multi-step Lanczos) */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
            <Sparkles size={15} color="var(--accent-cyan)" />
            <span>Chế độ tái tạo nét chống vỡ hạt (Unsharp Mask):</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              { id: 'auto', label: 'Tự động thông minh (Khuyên dùng)' },
              { id: 'high', label: 'Siêu nét (Tài liệu / Chữ / Con dấu)' },
              { id: 'none', label: 'Mịn tự nhiên (Ảnh chân dung)' },
              { id: 'pixel', label: 'Nét Pixel (Mã QR / Icon)' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSharpenMode(m.id as typeof sharpenMode)}
                className={`btn btn-sm ${sharpenMode === m.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.76rem', padding: '6px 8px' }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="btn btn-secondary btn-sm"
          >
            <RotateCw size={14} />
            <span>Xoay 90°</span>
          </button>
          <button
            type="button"
            onClick={() => setFlipH((v) => !v)}
            className="btn btn-secondary btn-sm"
          >
            <FlipHorizontal size={14} />
            <span>Lật ngang</span>
          </button>
          <button
            type="button"
            onClick={() => setFlipV((v) => !v)}
            className="btn btn-secondary btn-sm"
          >
            <FlipVertical size={14} />
            <span>Lật dọc</span>
          </button>
        </div>
      </div>

      <div
        className="bento-card"
        style={{
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        {!sourceImg ? (
          <div style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Chọn ảnh hoặc nhấn <strong>Ctrl+V</strong> để xem trước ảnh đã khử vỡ nét tại đây
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              style={{
                maxWidth: '100%',
                maxHeight: '340px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
              }}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Đuôi xuất ra:</span>
              {(['png', 'jpg', 'webp'] as const).map((ext) => (
                <button
                  key={ext}
                  type="button"
                  onClick={() => setOutFormat(ext)}
                  className={`hub-pill ${outFormat === ext ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer', padding: '4px 10px', fontSize: '0.76rem' }}
                >
                  .{ext.toUpperCase()}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleDownload}
                className="btn btn-primary"
              >
                <Download size={16} />
                <span>
                  Tải ảnh {targetW}×{targetH} (.{outFormat.toUpperCase()})
                </span>
              </button>
              <button
                type="button"
                onClick={handleCopyCanvas}
                className="btn btn-secondary"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Đã Copy ảnh!' : 'Copy ảnh vào Clipboard'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. NÉN ẢNH GIẢM DUNG LƯỢNG HÀNG LOẠT
// ============================================================================
interface CompressedItem {
  id: string;
  name: string;
  originalSize: number;
  compressedSize: number;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

const ImageCompressorView: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<'image/jpeg' | 'image/webp' | 'image/png'>('image/jpeg');
  const [quality, setQuality] = useState<number>(80);
  const [maxWidth, setMaxWidth] = useState<number>(0);
  const [results, setResults] = useState<CompressedItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const next: CompressedItem[] = [];
      for (const file of files) {
        if (cancelled) return;
        try {
          const img = await loadImageFromBlob(file);
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (maxWidth > 0 && w > maxWidth) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          }
          const canvas = document.createElement('canvas');
          drawResizedHighQuality(canvas, img, w, h, {
            rotation: 0,
            flipH: false,
            flipV: false,
            sharpenAmount: 0.2,
            bgColor: format === 'image/jpeg' ? '#ffffff' : undefined,
          });
          URL.revokeObjectURL(img.src);

          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), format, quality / 100)
          );
          if (!blob) continue;

          const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';
          const baseName = file.name.replace(/\.[^.]+$/, '');
          next.push({
            id: `${file.name}-${file.size}`,
            name: `${baseName}.${ext}`,
            originalSize: file.size,
            compressedSize: blob.size,
            blob,
            previewUrl: URL.createObjectURL(blob),
            width: w,
            height: h,
          });
        } catch {
          // Bỏ qua file lỗi
        }
      }
      if (!cancelled) {
        setResults((prev) => {
          for (const item of prev) URL.revokeObjectURL(item.previewUrl);
          return next;
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [files, format, quality, maxWidth]);

  const handleDownloadAllZip = async () => {
    if (results.length === 0) return;
    const zip = new JSZip();
    for (const item of results) {
      zip.file(item.name, item.blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bcchub-anh-nen-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '18px',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
              Định dạng ảnh đầu ra
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
              className="input-field"
            >
              <option value="image/jpeg">JPG (Nhẹ & Tương thích mọi nơi)</option>
              <option value="image/webp">WebP (Siêu nhẹ cho Web)</option>
              <option value="image/png">PNG (Giữ nền trong suốt)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
              Chất lượng nén: {quality}%
            </label>
            <input
              type="range"
              min={20}
              max={95}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              style={{ width: '100%', marginTop: '8px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
              Giới hạn chiều rộng
            </label>
            <select
              value={maxWidth}
              onChange={(e) => setMaxWidth(Number(e.target.value))}
              className="input-field"
            >
              <option value={0}>Giữ nguyên kích thước gốc</option>
              <option value={1920}>Full HD (Tối đa 1920px)</option>
              <option value={1280}>HD (Tối đa 1280px)</option>
              <option value={800}>Tài liệu đính kèm (800px)</option>
            </select>
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files).filter((f) =>
              f.type.startsWith('image/')
            );
            if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
          }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed var(--border-active)',
            borderRadius: 'var(--radius-md)',
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: 'rgba(6, 182, 212, 0.05)',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              if (selected.length) setFiles((prev) => [...prev, ...selected]);
              e.target.value = '';
            }}
          />
          <Upload size={28} color="var(--border-active)" style={{ marginBottom: '8px' }} />
          <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
            Kéo-thả hoặc bấm để chọn nhiều ảnh cần nén giảm dung lượng
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Tự động khử răng cưa & giữ độ nét chữ khi thu nhỏ
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <div className="bento-card" style={{ padding: '20px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            <span style={{ fontWeight: 700 }}>Đã xử lý {results.length} ảnh</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setFiles([])}
                className="btn btn-secondary btn-sm"
              >
                <Trash2 size={14} />
                <span>Xóa danh sách</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadAllZip}
                className="btn btn-primary btn-sm"
              >
                <Download size={14} />
                <span>Tải tất cả (.ZIP)</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {results.map((item) => {
              const savedPct = Math.round(
                ((item.originalSize - item.compressedSize) / item.originalSize) * 100
              );
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      style={{
                        width: '48px',
                        height: '48px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {item.width}×{item.height} px • Gốc: {formatBytes(item.originalSize)} →{' '}
                        <strong style={{ color: 'var(--accent-emerald)' }}>
                          {formatBytes(item.compressedSize)}
                        </strong>{' '}
                        {savedPct > 0 ? `(Giảm ${savedPct}%)` : ''}
                      </div>
                    </div>
                  </div>

                  <a
                    href={item.previewUrl}
                    download={item.name}
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={14} />
                    <span>Tải về</span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. CẮT ẢNH THẺ CHUẨN 3x4, 4x6, 2x3 + GHÉP VỈ IN 10x15 CM
// ============================================================================
const ID_PHOTO_PRESETS = [
  { id: '3x4', label: 'Ảnh thẻ 3×4 cm (Chuẩn hồ sơ)', w: 354, h: 472 },
  { id: '4x6', label: 'Ảnh thẻ 4×6 cm (Hộ chiếu / Visa)', w: 472, h: 709 },
  { id: '2x3', label: 'Ảnh thẻ 2×3 cm (Thẻ nhỏ)', w: 236, h: 354 },
  { id: '1x1', label: 'Ảnh vuông 1×1 (Avatar)', w: 600, h: 600 },
];

const IdPhotoCropperView: React.FC = () => {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [presetId, setPresetId] = useState('3x4');
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const activePreset = ID_PHOTO_PRESETS.find((p) => p.id === presetId) ?? ID_PHOTO_PRESETS[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = activePreset.w;
    canvas.height = activePreset.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!sourceImg) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const scaleBase = Math.max(
      canvas.width / sourceImg.naturalWidth,
      canvas.height / sourceImg.naturalHeight
    );
    const scale = scaleBase * zoom;
    const drawW = sourceImg.naturalWidth * scale;
    const drawH = sourceImg.naturalHeight * scale;
    const dx = (canvas.width - drawW) / 2 + offsetX;
    const dy = (canvas.height - drawH) / 2 + offsetY;
    ctx.drawImage(sourceImg, dx, dy, drawW, drawH);
  }, [sourceImg, activePreset, zoom, offsetX, offsetY]);

  const handleDownloadSingle = () => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImg) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `anh-the-${activePreset.id}-${Date.now()}.png`;
    a.click();
  };

  const handleDownloadSheet10x15 = () => {
    const single = canvasRef.current;
    if (!single || !sourceImg) return;
    const sheet = document.createElement('canvas');
    sheet.width = 1772;
    sheet.height = 1181;
    const ctx = sheet.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheet.width, sheet.height);

    const gap = 28;
    const cols = Math.floor((sheet.width - gap) / (single.width + gap));
    const rows = Math.floor((sheet.height - gap) / (single.height + gap));
    const startX = Math.floor((sheet.width - (cols * single.width + (cols - 1) * gap)) / 2);
    const startY = Math.floor((sheet.height - (rows * single.height + (rows - 1) * gap)) / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (single.width + gap);
        const y = startY + r * (single.height + gap);
        ctx.drawImage(single, x, y);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, single.width, single.height);
      }
    }

    const a = document.createElement('a');
    a.href = sheet.toDataURL('image/jpeg', 0.95);
    a.download = `vi-anh-the-${activePreset.id}-10x15cm.jpg`;
    a.click();
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div className="bento-card" style={{ padding: '22px 24px' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              const img = await loadImageFromBlob(f);
              setSourceImg(img);
              setZoom(1);
              setOffsetX(0);
              setOffsetY(0);
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: '16px' }}
        >
          <Upload size={16} />
          <span>Chọn ảnh chân dung cần cắt ảnh thẻ</span>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
              Kích thước ảnh thẻ chuẩn (300 DPI)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {ID_PHOTO_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={`btn btn-sm ${presetId === p.id ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>
              Phóng to / Thu nhỏ ({Math.round(zoom * 100)}%)
            </label>
            <input
              type="range"
              min={0.8}
              max={2.6}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>
                Căn Trái / Phải ({offsetX}px)
              </label>
              <input
                type="range"
                min={-250}
                max={250}
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>
                Căn Lên / Xuống ({offsetY}px)
              </label>
              <input
                type="range"
                min={-250}
                max={250}
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="bento-card"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div
          style={{
            padding: '10px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              maxHeight: '280px',
              width: 'auto',
              display: 'block',
              border: '1px solid #cbd5e1',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
          <button
            type="button"
            disabled={!sourceImg}
            onClick={handleDownloadSingle}
            className="btn btn-primary"
          >
            <Download size={16} />
            <span>Tải ảnh thẻ lẻ (PNG)</span>
          </button>
          <button
            type="button"
            disabled={!sourceImg}
            onClick={handleDownloadSheet10x15}
            className="btn btn-success"
          >
            <Download size={16} />
            <span>Tải vỉ ghép khổ 10×15 cm để in</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. GHÉP ẢNH CCCD / THẺ 2 MẶT TRÊN 1 TRANG (XUẤT ẢNH HOẶC PDF A4)
// ============================================================================
const IdCardMergerView: React.FC = () => {
  const [frontImg, setFrontImg] = useState<HTMLImageElement | null>(null);
  const [backImg, setBackImg] = useState<HTMLImageElement | null>(null);
  const [layout, setLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cardW = 540;
    const cardH = 342;

    const drawCardSlot = (img: HTMLImageElement | null, x: number, y: number, label: string) => {
      if (img) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, cardW, cardH);
      } else {
        ctx.strokeStyle = '#94a3b8';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cardW, cardH);
        ctx.setLineDash([]);
        ctx.fillStyle = '#64748b';
        ctx.font = '600 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + cardW / 2, y + cardH / 2);
      }
    };

    if (layout === 'vertical') {
      const x = Math.floor((canvas.width - cardW) / 2);
      drawCardSlot(frontImg, x, 240, 'Mặt trước CCCD / Thẻ');
      drawCardSlot(backImg, x, 240 + cardH + 90, 'Mặt sau CCCD / Thẻ');
    } else {
      const gap = 40;
      const startX = Math.floor((canvas.width - (cardW * 2 + gap)) / 2);
      drawCardSlot(frontImg, startX, 320, 'Mặt trước');
      drawCardSlot(backImg, startX + cardW + gap, 320, 'Mặt sau');
    }
  }, [frontImg, backImg, layout]);

  const handleExportPdf = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const jpgImage = await pdfDoc.embedJpg(jpgDataUrl);
    page.drawImage(jpgImage, { x: 0, y: 0, width: 595.28, height: 841.89 });
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cccd-2-mat-a4-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJpg = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.download = `cccd-2-mat-${Date.now()}.jpg`;
    a.click();
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px' }}>
            1. Ảnh Mặt trước CCCD / Thẻ:
          </label>
          <input
            type="file"
            accept="image/*"
            className="input-field"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setFrontImg(await loadImageFromBlob(f));
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px' }}>
            2. Ảnh Mặt sau CCCD / Thẻ:
          </label>
          <input
            type="file"
            accept="image/*"
            className="input-field"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setBackImg(await loadImageFromBlob(f));
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px' }}>
            Bố cục trên trang A4:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setLayout('vertical')}
              className={`btn btn-sm ${layout === 'vertical' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Xếp dọc (Trên – Dưới)
            </button>
            <button
              type="button"
              onClick={() => setLayout('horizontal')}
              className={`btn btn-sm ${layout === 'horizontal' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Xếp ngang (Trái – Phải)
            </button>
          </div>
        </div>
      </div>

      <div
        className="bento-card"
        style={{
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            maxHeight: '340px',
            width: 'auto',
            borderRadius: '8px',
            border: '1px solid var(--border-medium)',
            background: '#fff',
          }}
        />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleExportPdf} className="btn btn-primary">
            <Download size={16} />
            <span>Xuất file PDF khổ A4</span>
          </button>
          <button type="button" onClick={handleExportJpg} className="btn btn-secondary">
            <Download size={16} />
            <span>Tải ảnh JPG</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 0. TÁCH CHỮ KÝ TAY & CON DẤU TỪ ẢNH CHỤP SANG PNG TRONG SUỐT
// ============================================================================
type SignatureInkMode = 'original' | 'blue' | 'red' | 'black';

function createSampleSignatureDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 280;
  const ctx = c.getContext('2d')!;

  // Nền giấy chụp điện thoại hơi xám/vàng không đều
  const grad = ctx.createLinearGradient(0, 0, 640, 280);
  grad.addColorStop(0, '#ebe7df');
  grad.addColorStop(0.5, '#dedad0');
  grad.addColorStop(1, '#cfc9bc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 640, 280);

  // Vẽ con dấu đỏ mẫu bên trái
  ctx.save();
  ctx.translate(155, 140);
  ctx.rotate(-0.08);
  ctx.strokeStyle = 'rgba(210, 35, 42, 0.88)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(210, 35, 42, 0.88)';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CÔNG TY CỔ PHẦN', 0, -24);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('BCC HUB PRO', 0, 6);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('★ ĐÃ ĐÓNG DẤU ★', 0, 32);
  ctx.restore();

  // Vẽ chữ ký bút mực xanh bên phải
  ctx.save();
  ctx.strokeStyle = '#0b43a8';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(270, 175);
  ctx.bezierCurveTo(295, 85, 340, 75, 330, 165);
  ctx.bezierCurveTo(325, 200, 375, 110, 405, 145);
  ctx.bezierCurveTo(425, 168, 455, 115, 490, 148);
  ctx.bezierCurveTo(520, 172, 565, 120, 590, 110);
  ctx.stroke();

  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(290, 202);
  ctx.quadraticCurveTo(435, 172, 585, 188);
  ctx.stroke();
  ctx.restore();

  return c.toDataURL('image/jpeg', 0.92);
}

const SignatureExtractorView: React.FC = () => {
  const [sourceFile, setSourceFile] = useState<File | null>(() =>
    consumePendingContextFile(/\.(png|jpe?g|webp|bmp)$/i)
  );
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [threshold, setThreshold] = useState<number>(62);
  const [strength, setStrength] = useState<number>(1.8);
  const [inkMode, setInkMode] = useState<SignatureInkMode>('original');
  const [autoTrim, setAutoTrim] = useState<boolean>(true);
  const [rotation, setRotation] = useState<number>(0);
  const [previewBg, setPreviewBg] = useState<'checker' | 'white'>('checker');
  const [copied, setCopied] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadFromFile = useCallback(async (file: File) => {
    const img = await loadImageFromBlob(file);
    setSourceFile(file);
    setSourceImg(img);
    setRotation(0);
  }, []);

  const loadSampleSignature = useCallback(async () => {
    const dataUrl = createSampleSignatureDataUrl();
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'mau-chu-ky-con-dau.jpg', { type: 'image/jpeg' });
    await loadFromFile(file);
  }, [loadFromFile]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (sourceFile) {
        const img = await loadImageFromBlob(sourceFile);
        if (active) setSourceImg(img);
        return;
      }
      const dataUrl = createSampleSignatureDataUrl();
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'mau-chu-ky-con-dau.jpg', { type: 'image/jpeg' });
      const img = await loadImageFromBlob(file);
      if (active) {
        setSourceFile(file);
        setSourceImg(img);
      }
    };
    void init();
    return () => {
      active = false;
    };
    // Chỉ khởi tạo 1 lần khi mở trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            void loadFromFile(f);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFromFile]);

  useEffect(() => {
    if (!sourceImg || !outputCanvasRef.current) return;

    const srcW = sourceImg.naturalWidth || sourceImg.width;
    const srcH = sourceImg.naturalHeight || sourceImg.height;
    if (!srcW || !srcH) return;

    const rot = ((rotation % 360) + 360) % 360;
    const swapDims = rot === 90 || rot === 270;
    const workW = swapDims ? srcH : srcW;
    const workH = swapDims ? srcW : srcH;

    const workCanvas = document.createElement('canvas');
    workCanvas.width = workW;
    workCanvas.height = workH;
    const wCtx = workCanvas.getContext('2d')!;

    wCtx.save();
    wCtx.translate(workW / 2, workH / 2);
    wCtx.rotate((rot * Math.PI) / 180);
    wCtx.drawImage(sourceImg, -srcW / 2, -srcH / 2, srcW, srcH);
    wCtx.restore();

    const imgData = wCtx.getImageData(0, 0, workW, workH);
    const data = imgData.data;

    let minX = workW;
    let minY = workH;
    let maxX = 0;
    let maxY = 0;
    let hasInk = false;

    for (let y = 0; y < workH; y++) {
      const rowOff = y * workW;
      for (let x = 0; x < workW; x++) {
        const i = (rowOff + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a < 15) {
          data[i + 3] = 0;
          continue;
        }

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const chroma = maxC - minC;
        const darkness = 255 - luma;

        // Điểm mực kết hợp độ tối (bút đen/xanh đậm) và độ bão hòa màu (con dấu đỏ / bút bi xanh tươi)
        const inkScore = Math.max(darkness, darkness * 0.55 + chroma * 1.25);

        if (inkScore <= threshold) {
          data[i + 3] = 0;
          continue;
        }

        const normalizedAlpha = Math.min(
          255,
          Math.round(((inkScore - threshold) / Math.max(1, 255 - threshold)) * 255 * strength)
        );
        data[i + 3] = normalizedAlpha;

        if (inkMode === 'blue') {
          data[i] = 0;
          data[i + 1] = 56;
          data[i + 2] = 168;
        } else if (inkMode === 'red') {
          data[i] = 220;
          data[i + 1] = 38;
          data[i + 2] = 38;
        } else if (inkMode === 'black') {
          data[i] = 15;
          data[i + 1] = 23;
          data[i + 2] = 42;
        } else {
          // Tăng độ tươi và sắc nét của màu mực gốc
          const avg = (r + g + b) / 3;
          data[i] = Math.max(0, Math.min(255, Math.round((r - avg) * 1.45 + avg * 0.72)));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - avg) * 1.45 + avg * 0.72)));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - avg) * 1.45 + avg * 0.72)));
        }

        if (normalizedAlpha > 28) {
          hasInk = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    wCtx.putImageData(imgData, 0, 0);

    const outCanvas = outputCanvasRef.current;
    if (autoTrim && hasInk) {
      const pad = 16;
      const cropX = Math.max(0, minX - pad);
      const cropY = Math.max(0, minY - pad);
      const cropW = Math.min(workW - cropX, maxX - minX + 1 + pad * 2);
      const cropH = Math.min(workH - cropY, maxY - minY + 1 + pad * 2);

      outCanvas.width = cropW;
      outCanvas.height = cropH;
      const outCtx = outCanvas.getContext('2d')!;
      outCtx.clearRect(0, 0, cropW, cropH);
      outCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    } else {
      outCanvas.width = workW;
      outCanvas.height = workH;
      const outCtx = outCanvas.getContext('2d')!;
      outCtx.clearRect(0, 0, workW, workH);
      outCtx.drawImage(workCanvas, 0, 0);
    }
  }, [sourceImg, threshold, strength, inkMode, autoTrim, rotation]);

  const handleDownloadPng = () => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const baseName = sourceFile ? sourceFile.name.replace(/\.[^.]+$/, '') : 'chu-ky';
    const link = document.createElement('a');
    link.download = `${baseName}-trong-suot.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleCopyPng = async () => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob && navigator.clipboard && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div
        className="bento-card"
        style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFromFile(f);
            e.target.value = '';
          }}
        />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary btn-sm"
          >
            <Upload size={15} />
            <span>Chọn ảnh Chữ ký / Con dấu</span>
          </button>

          <button
            type="button"
            onClick={() => void loadSampleSignature()}
            className="btn btn-secondary btn-sm"
          >
            <Sparkles size={15} />
            <span>Thử mẫu có sẵn</span>
          </button>

          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="btn btn-secondary btn-sm"
            title="Xoay ảnh 90 độ"
          >
            <RotateCw size={15} />
            <span>Xoay 90°</span>
          </button>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Mẹo: Bạn có thể bấm <kbd>Ctrl + V</kbd> để dán trực tiếp ảnh chụp chữ ký từ Zalo/điện thoại.
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>
            Màu mực đầu ra:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {(
              [
                { id: 'original', label: 'Giữ màu gốc (Xanh & Đỏ)' },
                { id: 'blue', label: 'Mực Xanh ký (#0038A8)' },
                { id: 'red', label: 'Mực Đỏ con dấu (#DC2626)' },
                { id: 'black', label: 'Mực Đen đậm (#0F172A)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setInkMode(opt.id)}
                className={`btn btn-sm ${inkMode === opt.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ justifyContent: 'flex-start' }}
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700 }}>Độ nhạy khử nền giấy (Threshold):</span>
            <strong style={{ color: 'var(--accent-cyan)' }}>{threshold}</strong>
          </div>
          <input
            type="range"
            min={15}
            max={160}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            Kéo tăng lên nếu nền giấy chụp bị tối/bóng xám; giảm xuống nếu nét bút quá mảnh.
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700 }}>Độ đậm & sắc nét bút (Strength):</span>
            <strong style={{ color: 'var(--accent-cyan)' }}>{strength.toFixed(1)}×</strong>
          </div>
          <input
            type="range"
            min={0.8}
            max={3.0}
            step={0.1}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoTrim}
            onChange={(e) => setAutoTrim(e.target.checked)}
          />
          <span>Tự động cắt sát viền (Auto-Trim) để chèn vào Word/PDF gọn ngay</span>
        </label>
      </div>

      <div
        className="bento-card"
        style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
              Kết quả PNG Trong Suốt
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Sẵn sàng chèn đè lên dòng chữ trong Word, Excel hoặc công cụ Ký PDF
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setPreviewBg('checker')}
              className={`btn btn-sm ${previewBg === 'checker' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Nền caro trong suốt
            </button>
            <button
              type="button"
              onClick={() => setPreviewBg('white')}
              className={`btn btn-sm ${previewBg === 'white' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Xem trên giấy trắng
            </button>
          </div>
        </div>

        <div
          style={{
            minHeight: '250px',
            borderRadius: '12px',
            border: '1px solid var(--border-medium)',
            padding: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              previewBg === 'white'
                ? '#ffffff'
                : 'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%) 50% / 18px 18px',
            overflow: 'hidden',
          }}
        >
          <canvas
            ref={outputCanvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: '280px',
              width: 'auto',
              height: 'auto',
              display: 'block',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleDownloadPng} className="btn btn-primary">
            <Download size={16} />
            <span>Tải ảnh PNG Trong suốt</span>
          </button>

          <button type="button" onClick={() => void handleCopyPng()} className="btn btn-secondary">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'Đã Copy vào Clipboard!' : 'Copy ảnh PNG (Dán thẳng vào Word)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 0A. CAPTURE TO TEXT — CHỤP VÙNG MÀN HÌNH / DÁN ẢNH (CTRL+V) LẤY CHỮ OCR
// ============================================================================
interface TesseractLoggerMsg {
  status?: string;
  progress?: number;
}

interface TesseractRecognizeResult {
  data: {
    text: string;
    confidence?: number;
  };
}

interface TesseractWorkerInstance {
  recognize(image: HTMLCanvasElement): Promise<TesseractRecognizeResult>;
}

interface TesseractGlobal {
  createWorker(
    langs: string,
    oem?: number,
    options?: {
      workerPath?: string;
      logger?: (m: TesseractLoggerMsg) => void;
    }
  ): Promise<TesseractWorkerInstance>;
}

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

let tesseractScriptPromise: Promise<TesseractGlobal> | null = null;
const tesseractWorkerCache = new Map<string, Promise<TesseractWorkerInstance>>();
let currentOcrLogger: ((m: TesseractLoggerMsg) => void) | null = null;

function ensureTesseractGlobal(): Promise<TesseractGlobal> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractScriptPromise) return tesseractScriptPromise;

  tesseractScriptPromise = new Promise<TesseractGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/tesseract/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) {
        resolve(window.Tesseract);
      } else {
        reject(new Error('Không khởi tạo được bộ nhận diện OCR'));
      }
    };
    script.onerror = () => reject(new Error('Không tải được thư viện OCR'));
    document.head.appendChild(script);
  });
  return tesseractScriptPromise;
}

async function getOrCreateOcrWorker(lang: string): Promise<TesseractWorkerInstance> {
  const existing = tesseractWorkerCache.get(lang);
  if (existing) return existing;

  const promise = (async () => {
    const T = await ensureTesseractGlobal();
    return T.createWorker(lang, 1, {
      workerPath: '/vendor/tesseract/worker.min.js',
      logger: (m) => {
        if (currentOcrLogger) currentOcrLogger(m);
      },
    });
  })();

  tesseractWorkerCache.set(lang, promise);
  try {
    return await promise;
  } catch (err) {
    tesseractWorkerCache.delete(lang);
    throw err;
  }
}

function createSampleOcrCardDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = 760;
  c.height = 310;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, c.width - 36, c.height - 36);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 21px Inter, Arial, sans-serif';
  ctx.fillText('THÔNG BÁO TIẾP NHẬN HỒ SƠ HÀNH CHÍNH', 42, 62);

  ctx.font = '18px Inter, Arial, sans-serif';
  ctx.fillText('1. Đơn vị tiếp nhận: Trung tâm Phục vụ hành chính công bccHub', 42, 106);
  ctx.fillText('2. Mã hồ sơ: HS-2026-08915  •  Số CCCD: 001095012345', 42, 142);
  ctx.fillText('3. Điện thoại liên hệ: 0912345678  •  Email: hotro@bcchub.vn', 42, 178);
  ctx.fillText('4. Kinh phí lệ phí: 1.250.000 VNĐ (Một triệu hai trăm năm mươi nghìn đồng)', 42, 214);
  ctx.fillText('5. Kéo chuột khoanh vùng bất kỳ trên ảnh này để bóc tách chữ tức thì!', 42, 256);

  return c.toDataURL('image/png');
}

interface NormalizedRect {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

function preprocessCanvasForOcr(
  sourceImg: HTMLImageElement,
  crop: NormalizedRect | null,
  enhance: boolean
): HTMLCanvasElement {
  const natW = sourceImg.naturalWidth || sourceImg.width;
  const natH = sourceImg.naturalHeight || sourceImg.height;

  const sx = crop ? Math.round(crop.x * natW) : 0;
  const sy = crop ? Math.round(crop.y * natH) : 0;
  const sw = crop ? Math.max(12, Math.round(crop.w * natW)) : natW;
  const sh = crop ? Math.max(12, Math.round(crop.h * natH)) : natH;

  // Phóng nhẹ vùng chữ nhỏ để Tesseract nhận diện dấu tiếng Việt chính xác hơn
  const scale = sw < 900 ? 1.65 : 1.0;
  const outW = Math.round(sw * scale);
  const outH = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, outW, outH);

  if (enhance) {
    applyUnsharpMask(ctx, outW, outH, 0.75);
    const imgData = ctx.getImageData(0, 0, outW, outH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Kéo giãn tương phản chữ - nền
      const stretched = Math.max(0, Math.min(255, Math.round((luma - 128) * 1.35 + 128)));
      d[i] = stretched;
      d[i + 1] = stretched;
      d[i + 2] = stretched;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return canvas;
}

const CaptureToTextView: React.FC = () => {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [lang, setLang] = useState<'vie+eng' | 'vie' | 'eng'>('vie+eng');
  const [enhanceText, setEnhanceText] = useState<boolean>(true);
  const [autoCopy, setAutoCopy] = useState<boolean>(true);
  const [cropRect, setCropRect] = useState<NormalizedRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Sẵn sàng');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageWrapRef = useRef<HTMLDivElement | null>(null);

  const runOcr = useCallback(
    async (
      img: HTMLImageElement,
      region: NormalizedRect | null,
      selectedLang: string,
      shouldEnhance: boolean,
      shouldAutoCopy: boolean
    ) => {
      setIsScanning(true);
      setProgressPct(10);
      setStatusText('Đang chuẩn bị bộ nhận diện OCR...');

      currentOcrLogger = (m) => {
        if (typeof m.progress === 'number') {
          setProgressPct(Math.max(12, Math.round(m.progress * 100)));
        }
        if (m.status === 'recognizing text') {
          setStatusText('Đang đọc chữ từ vùng ảnh...');
        } else if (m.status?.includes('loading')) {
          setStatusText('Đang nạp gói ngôn ngữ Tiếng Việt / Anh...');
        }
      };

      try {
        const preparedCanvas = preprocessCanvasForOcr(img, region, shouldEnhance);
        const worker = await getOrCreateOcrWorker(selectedLang);
        const res = await worker.recognize(preparedCanvas);
        const cleaned = (res.data.text || '')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        setRecognizedText(cleaned);
        setConfidence(typeof res.data.confidence === 'number' ? Math.round(res.data.confidence) : null);
        setProgressPct(100);
        setStatusText(cleaned ? 'Đã bóc tách văn bản hoàn tất' : 'Không tìm thấy chữ trong vùng chọn');

        if (cleaned && shouldAutoCopy && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(cleaned);
            setCopiedToast(true);
            setTimeout(() => setCopiedToast(false), 1800);
          } catch {
            // Bỏ qua nếu trình duyệt chặn auto-copy
          }
        }
      } catch (err) {
        setStatusText(
          err instanceof Error ? `Lỗi OCR: ${err.message}` : 'Không thể nhận diện văn bản'
        );
      } finally {
        currentOcrLogger = null;
        setIsScanning(false);
      }
    },
    []
  );

  const loadBlobAndScan = useCallback(
    async (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const img = await loadImageFromBlob(blob);
      setImageUrl((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return url;
      });
      setSourceImg(img);
      setCropRect(null);
      await runOcr(img, null, lang, enhanceText, autoCopy);
    },
    [lang, enhanceText, autoCopy, runOcr]
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      const pending = consumePendingContextFile(/\.(png|jpe?g|webp|bmp)$/i);
      if (pending) {
        if (active) await loadBlobAndScan(pending);
        return;
      }
      const sampleUrl = createSampleOcrCardDataUrl();
      const res = await fetch(sampleUrl);
      const blob = await res.blob();
      const img = await loadImageFromBlob(blob);
      if (active) {
        setImageUrl(sampleUrl);
        setSourceImg(img);
        setRecognizedText(
          [
            'THÔNG BÁO TIẾP NHẬN HỒ SƠ HÀNH CHÍNH',
            '1. Đơn vị tiếp nhận: Trung tâm Phục vụ hành chính công bccHub',
            '2. Mã hồ sơ: HS-2026-08915 • Số CCCD: 001095012345',
            '3. Điện thoại liên hệ: 0912345678 • Email: hotro@bcchub.vn',
            '4. Kinh phí lệ phí: 1.250.000 VNĐ (Một triệu hai trăm năm mươi nghìn đồng)',
            '5. Kéo chuột khoanh vùng bất kỳ trên ảnh này để bóc tách chữ tức thì!',
          ].join('\n')
        );
        setConfidence(98);
      }
    };
    void init();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            void loadBlobAndScan(f);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadBlobAndScan]);

  const handleCaptureScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatusText('Trình duyệt hiện tại không hỗ trợ API chụp màn hình trực tiếp');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      await new Promise((r) => setTimeout(r, 120));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      stream.getTracks().forEach((t) => t.stop());

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (blob) {
        await loadBlobAndScan(blob);
      }
    } catch {
      setStatusText('Đã hủy chụp màn hình');
    }
  };

  const getRelativeCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = imageWrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sourceImg || e.button !== 0) return;
    const pt = getRelativeCoords(e);
    setDragStart(pt);
    setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const pt = getRelativeCoords(e);
    const x = Math.min(dragStart.x, pt.x);
    const y = Math.min(dragStart.y, pt.y);
    const w = Math.abs(pt.x - dragStart.x);
    const h = Math.abs(pt.y - dragStart.y);
    setCropRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!dragStart || !sourceImg) return;
    setDragStart(null);
    if (cropRect && cropRect.w > 0.025 && cropRect.h > 0.02) {
      void runOcr(sourceImg, cropRect, lang, enhanceText, autoCopy);
    } else {
      setCropRect(null);
    }
  };

  const handleJoinLines = () => {
    setRecognizedText((prev) =>
      prev
        .split(/\n{2,}/)
        .map((para) => para.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim())
        .join('\n\n')
    );
  };

  const handleCopyText = async () => {
    if (!recognizedText) return;
    await navigator.clipboard.writeText(recognizedText);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 1800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Thanh thao tác Capture nhanh */}
      <div
        className="bento-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadBlobAndScan(f);
            e.target.value = '';
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void handleCaptureScreen()} className="btn btn-primary">
            <Monitor size={16} />
            <span>Chụp vùng màn hình ngay</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
          >
            <Upload size={16} />
            <span>Chọn ảnh (hoặc bấm Ctrl+V)</span>
          </button>

          {sourceImg && (
            <button
              type="button"
              disabled={isScanning}
              onClick={() => void runOcr(sourceImg, cropRect, lang, enhanceText, autoCopy)}
              className="btn btn-secondary"
            >
              <ScanText size={16} />
              <span>{cropRect ? 'Quét lại vùng đã khoanh' : 'Quét toàn bộ ảnh'}</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(
              [
                { id: 'vie+eng', label: 'Việt + Anh' },
                { id: 'vie', label: 'Tiếng Việt' },
                { id: 'eng', label: 'Tiếng Anh / Số' },
              ] as const
            ).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLang(l.id);
                  if (sourceImg) {
                    void runOcr(sourceImg, cropRect, l.id, enhanceText, autoCopy);
                  }
                }}
                className={`btn btn-sm ${lang === l.id ? 'btn-primary' : 'btn-secondary'}`}
              >
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bố cục 2 cột: Trái = Khung khoanh vùng ảnh trực quan, Phải = Kết quả văn bản */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '18px',
          alignItems: 'start',
        }}
      >
        <div
          className="bento-card"
          style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.86rem', fontWeight: 700 }}>
              <Crop size={16} color="var(--accent-cyan)" />
              <span>Kéo chuột trên ảnh để khoanh vùng chữ cần lấy</span>
            </div>

            {cropRect && (
              <button
                type="button"
                onClick={() => {
                  setCropRect(null);
                  if (sourceImg) void runOcr(sourceImg, null, lang, enhanceText, autoCopy);
                }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.76rem' }}
              >
                Bỏ khoanh vùng (Quét cả ảnh)
              </button>
            )}
          </div>

          <div
            ref={imageWrapRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              position: 'relative',
              userSelect: 'none',
              cursor: 'crosshair',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid var(--border-medium)',
              background: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Ảnh cần quét chữ"
                draggable={false}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
            )}

            {cropRect && cropRect.w > 0.005 && (
              <div
                style={{
                  position: 'absolute',
                  left: `${cropRect.x * 100}%`,
                  top: `${cropRect.y * 100}%`,
                  width: `${cropRect.w * 100}%`,
                  height: `${cropRect.h * 100}%`,
                  border: '2px solid #06b6d4',
                  background: 'rgba(6, 182, 212, 0.16)',
                  boxShadow: '0 0 0 9999px rgba(8, 12, 20, 0.45)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enhanceText}
                onChange={(e) => setEnhanceText(e.target.checked)}
              />
              <span>Tự làm nét & tăng tương phản chữ nhỏ trước khi OCR</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoCopy}
                onChange={(e) => setAutoCopy(e.target.checked)}
              />
              <span>Tự động Copy vào Clipboard ngay khi quét xong</span>
            </label>
          </div>
        </div>

        <div
          className="bento-card"
          style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Văn bản bóc tách được</span>
              {confidence !== null && !isScanning && (
                <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                  Độ chính xác ~{confidence}%
                </span>
              )}
            </div>

            <span style={{ fontSize: '0.77rem', color: isScanning ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
              {isScanning ? `${statusText} (${progressPct}%)` : statusText}
            </span>
          </div>

          {isScanning && (
            <div
              style={{
                width: '100%',
                height: '5px',
                borderRadius: '999px',
                background: 'var(--bg-input)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #06b6d4, #0284c7)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}

          <textarea
            value={recognizedText}
            onChange={(e) => setRecognizedText(e.target.value)}
            rows={10}
            placeholder="Văn bản nhận diện từ ảnh sẽ hiển thị tại đây..."
            className="input-field"
            style={{
              fontSize: '0.93rem',
              lineHeight: 1.55,
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!recognizedText}
                onClick={() => void handleCopyText()}
                className="btn btn-primary btn-sm"
              >
                {copiedToast ? <Check size={15} /> : <Copy size={15} />}
                <span>{copiedToast ? 'Đã Copy văn bản!' : 'Copy toàn bộ văn bản'}</span>
              </button>

              <button
                type="button"
                disabled={!recognizedText}
                onClick={handleJoinLines}
                className="btn btn-secondary btn-sm"
                title="Nối các dòng bị ngắt giữa câu thành đoạn văn liền mạch"
              >
                <span>Gộp dòng bị ngắt</span>
              </button>
            </div>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {recognizedText.length} ký tự •{' '}
              {recognizedText.trim() ? recognizedText.trim().split(/\s+/).length : 0} từ
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const OfficeImageTools: React.FC<{ toolId: OfficeImageToolId }> = ({ toolId }) => {
  return (
    <HubShell>
      <ToolPageHeader toolId={toolId} />
      {toolId === 'capture-to-text' && <CaptureToTextView />}
      {toolId === 'signature-extractor' && <SignatureExtractorView />}
      {toolId === 'image-converter' && <ImageConverterView />}
      {toolId === 'image-resizer' && <ImageResizerView />}
      {toolId === 'image-compressor' && <ImageCompressorView />}
      {toolId === 'id-photo-cropper' && <IdPhotoCropperView />}
      {toolId === 'id-card-merger' && <IdCardMergerView />}
    </HubShell>
  );
};

export default OfficeImageTools;
