import React, { useCallback, useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  FlipHorizontal,
  FlipVertical,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { HubShell } from '../hub/HubShell';
import { ToolPageHeader } from './ToolPageHeader';

export type OfficeImageToolId =
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

export const OfficeImageTools: React.FC<{ toolId: OfficeImageToolId }> = ({ toolId }) => {
  return (
    <HubShell>
      <ToolPageHeader toolId={toolId} />
      {toolId === 'image-converter' && <ImageConverterView />}
      {toolId === 'image-resizer' && <ImageResizerView />}
      {toolId === 'image-compressor' && <ImageCompressorView />}
      {toolId === 'id-photo-cropper' && <IdPhotoCropperView />}
      {toolId === 'id-card-merger' && <IdCardMergerView />}
    </HubShell>
  );
};

export default OfficeImageTools;
