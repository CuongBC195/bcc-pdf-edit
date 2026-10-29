import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { PDFDocument, rgb } from 'pdf-lib';
import {
  Barcode,
  Camera,
  CameraOff,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Landmark,
  Link2,
  QrCode,
  RefreshCw,
  ScanLine,
  Upload,
  UserSquare2,
  Wifi,
} from 'lucide-react';
import { HubShell } from '../hub/HubShell';
import { ToolPageHeader } from './ToolPageHeader';
import {
  renderQrToCanvas,
  renderQrToSvgString,
  type QrEccLevel,
} from '../utils/qrCode';
import { VIETQR_BANKS } from '../data/vietqrBanks';
import { buildVietQrPayload, sanitizeTransferNote } from '../utils/vietqr';
import { encodeCode128, isCode128Encodable, renderCode128Svg } from '../utils/barcode128';

export type QrBarcodeToolId =
  | 'qr-generator'
  | 'qr-scanner'
  | 'batch-qr-generator'
  | 'vietqr-generator'
  | 'barcode-generator';

type QrPresetKind = 'text' | 'wifi' | 'vcard';

interface BarcodeDetectionResult {
  rawValue: string;
  format?: string;
}

interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectionResult[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorInstance;
    };
  }
}

interface ScanHistoryItem {
  id: string;
  value: string;
  time: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeWifiField(val: string): string {
  return val.replace(/([\\;,:])/g, '\\$1');
}

/**
 * Thử quét mã QR qua nhiều bước tiền xử lý ảnh (ảnh gốc -> thêm viền trắng -> đảo màu cho QR nền tối)
 */
async function decodeQrFromImageElement(img: HTMLImageElement): Promise<string | null> {
  if (!window.BarcodeDetector) {
    throw new Error('UNSUPPORTED_BARCODE_DETECTOR');
  }

  const detector = new window.BarcodeDetector({
    formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'data_matrix'],
  });

  try {
    const direct = await detector.detect(img);
    if (direct.length > 0 && direct[0].rawValue) {
      return direct[0].rawValue;
    }
  } catch {
    // Tiếp tục thử qua canvas
  }

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const pad = Math.round(Math.max(w, h) * 0.12);
  const canvas = document.createElement('canvas');
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, pad, pad, w, h);

  const paddedRes = await detector.detect(canvas);
  if (paddedRes.length > 0 && paddedRes[0].rawValue) {
    return paddedRes[0].rawValue;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(imageData, 0, 0);

  const invertedRes = await detector.detect(canvas);
  if (invertedRes.length > 0 && invertedRes[0].rawValue) {
    return invertedRes[0].rawValue;
  }

  return null;
}

interface QrToolPageProps {
  toolId?: QrBarcodeToolId;
}

const TOP_BANK_BINS = [
  '970436', // Vietcombank
  '970415', // VietinBank
  '970418', // BIDV
  '970405', // Agribank
  '970422', // MBBank
  '970407', // Techcombank
  '970416', // ACB
  '970432', // VPBank
  '970423', // TPBank
  '970403', // Sacombank
];

export const QrToolPage: React.FC<QrToolPageProps> = ({ toolId = 'qr-generator' }) => {
  // ==================== 1. STATE: TẠO MÃ QR ====================
  const [preset, setPreset] = useState<QrPresetKind>('text');
  const [textInput, setTextInput] = useState('https://');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [vcardName, setVcardName] = useState('');
  const [vcardPhone, setVcardPhone] = useState('');
  const [vcardEmail, setVcardEmail] = useState('');
  const [vcardOrg, setVcardOrg] = useState('');

  const [sizePx, setSizePx] = useState<number>(360);
  const [ecl, setEcl] = useState<QrEccLevel>('M');
  const [darkColor, setDarkColor] = useState('#0f172a');
  const [lightColor, setLightColor] = useState('#ffffff');
  const [copiedImage, setCopiedImage] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const qrPayload = useMemo(() => {
    if (preset === 'wifi') {
      if (!wifiSsid.trim()) return '';
      return `WIFI:T:${wifiSecurity};S:${escapeWifiField(wifiSsid.trim())};P:${escapeWifiField(
        wifiPassword
      )};;`;
    }
    if (preset === 'vcard') {
      if (!vcardName.trim() && !vcardPhone.trim()) return '';
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${vcardName.trim()}`,
        vcardOrg.trim() ? `ORG:${vcardOrg.trim()}` : '',
        vcardPhone.trim() ? `TEL;TYPE=CELL:${vcardPhone.trim()}` : '',
        vcardEmail.trim() ? `EMAIL:${vcardEmail.trim()}` : '',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\n');
    }
    return textInput.trim();
  }, [preset, textInput, wifiSsid, wifiPassword, wifiSecurity, vcardName, vcardPhone, vcardEmail, vcardOrg]);

  const qrError = useMemo(() => {
    if (!qrPayload) return null;
    try {
      renderQrToSvgString(qrPayload, { sizePx: 120, ecl });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Không thể tạo mã QR';
    }
  }, [qrPayload, ecl]);

  useEffect(() => {
    if (toolId !== 'qr-generator') return;
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPayload || qrError) return;
    try {
      renderQrToCanvas(canvas, qrPayload, {
        sizePx,
        marginModules: 3,
        darkColor,
        lightColor,
        ecl,
      });
    } catch {
      // Đã kiểm tra qua qrError
    }
  }, [toolId, qrPayload, qrError, sizePx, darkColor, lightColor, ecl]);

  const handlePasteText = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setPreset('text');
        setTextInput(clipText);
      }
    } catch {
      // Người dùng dùng Ctrl+V trực tiếp
    }
  };

  const handleCopyQrImage = async () => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPayload || qrError) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      handleDownloadPng();
    }
  };

  const handleDownloadPng = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !qrPayload || qrError) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `bcc-qrcode-${Date.now()}.png`;
    a.click();
  };

  const handleDownloadSvg = () => {
    if (!qrPayload || qrError) return;
    const svg = renderQrToSvgString(qrPayload, {
      sizePx,
      marginModules: 3,
      darkColor,
      lightColor,
      ecl,
    });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bcc-qrcode-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==================== 2. STATE: VIETQR CHUYỂN KHOẢN ====================
  const [bankBin, setBankBin] = useState('970436');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAmountRaw, setBankAmountRaw] = useState('');
  const [bankNote, setBankNote] = useState('');
  const [copiedVietQr, setCopiedVietQr] = useState(false);
  const vietQrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedBank = useMemo(
    () => VIETQR_BANKS.find((b) => b.bin === bankBin) ?? VIETQR_BANKS[0],
    [bankBin]
  );

  const parsedBankAmount = useMemo(() => {
    const digits = bankAmountRaw.replace(/\D/g, '');
    return digits ? Number(digits) : 0;
  }, [bankAmountRaw]);

  const vietQrBuild = useMemo(() => {
    if (!bankAccountNo.trim()) {
      return { payload: '', error: null as string | null };
    }
    try {
      const payload = buildVietQrPayload({
        bin: bankBin,
        accountNo: bankAccountNo.trim(),
        amount: parsedBankAmount > 0 ? parsedBankAmount : undefined,
        note: bankNote.trim() || undefined,
      });
      return { payload, error: null };
    } catch (err) {
      return {
        payload: '',
        error: err instanceof Error ? err.message : 'Thông tin tài khoản chưa hợp lệ',
      };
    }
  }, [bankBin, bankAccountNo, parsedBankAmount, bankNote]);

  useEffect(() => {
    if (toolId !== 'vietqr-generator') return;
    const canvas = vietQrCanvasRef.current;
    if (!canvas || !vietQrBuild.payload) return;
    try {
      renderQrToCanvas(canvas, vietQrBuild.payload, {
        sizePx: 420,
        marginModules: 3,
        darkColor: '#0f172a',
        lightColor: '#ffffff',
        ecl: 'M',
      });
    } catch {
      // Bỏ qua nếu có lỗi
    }
  }, [toolId, vietQrBuild.payload]);

  const handleCopyVietQr = async () => {
    const canvas = vietQrCanvasRef.current;
    if (!canvas || !vietQrBuild.payload) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedVietQr(true);
      setTimeout(() => setCopiedVietQr(false), 2000);
    } catch {
      handleDownloadVietQrPng();
    }
  };

  const handleDownloadVietQrPng = () => {
    const canvas = vietQrCanvasRef.current;
    if (!canvas || !vietQrBuild.payload) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `vietqr-${selectedBank.code}-${bankAccountNo.trim()}.png`;
    a.click();
  };

  // ==================== 3. STATE: MÃ VẠCH CODE 128 ====================
  const [barcodeText, setBarcodeText] = useState('HS-2026-00158');
  const [barcodeModuleWidth, setBarcodeModuleWidth] = useState(2);
  const [barcodeHeight, setBarcodeHeight] = useState(90);
  const [barcodeShowText, setBarcodeShowText] = useState(true);
  const [copiedBarcode, setCopiedBarcode] = useState(false);

  const barcodeResult = useMemo(() => {
    if (!barcodeText.trim()) return { svg: '', error: null as string | null };
    try {
      const svg = renderCode128Svg(barcodeText.trim(), {
        moduleWidth: barcodeModuleWidth,
        height: barcodeHeight,
        showText: barcodeShowText,
      });
      return { svg, error: null };
    } catch (err) {
      return {
        svg: '',
        error: err instanceof Error ? err.message : 'Không thể tạo mã vạch Code 128',
      };
    }
  }, [barcodeText, barcodeModuleWidth, barcodeHeight, barcodeShowText]);

  const renderBarcodeToPngBlob = async (): Promise<Blob | null> => {
    if (!barcodeResult.svg) return null;
    const svgBlob = new Blob([barcodeResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG load error'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth * 2;
      canvas.height = img.naturalHeight * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleCopyBarcodePng = async () => {
    const blob = await renderBarcodeToPngBlob();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedBarcode(true);
      setTimeout(() => setCopiedBarcode(false), 1800);
    } catch {
      handleDownloadBarcodePng();
    }
  };

  const handleDownloadBarcodePng = async () => {
    const blob = await renderBarcodeToPngBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${barcodeText.trim() || 'code128'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBarcodeSvg = () => {
    if (!barcodeResult.svg) return;
    const blob = new Blob([barcodeResult.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${barcodeText.trim() || 'code128'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==================== 4. STATE: QUÉT MÃ QR ====================
  const [scannedText, setScannedText] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
  const [copiedScan, setCopiedScan] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const recordScanSuccess = useCallback((value: string) => {
    setScannedText(value);
    setScanError(null);
    const now = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setScanHistory((prev) => {
      const filtered = prev.filter((item) => item.value !== value);
      return [{ id: `${Date.now()}`, value, time: now }, ...filtered].slice(0, 8);
    });
  }, []);

  const processImageFile = useCallback(
    async (file: Blob) => {
      setScanError(null);
      const objectUrl = URL.createObjectURL(file);
      setPreviewImgUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });

      const img = new Image();
      img.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh'));
      }).catch(() => {});

      try {
        const decoded = await decodeQrFromImageElement(img);
        if (decoded) {
          recordScanSuccess(decoded);
        } else {
          setScannedText('');
          setScanError(
            'Không tìm thấy mã QR/mã vạch trong ảnh này. Hãy thử chụp rõ hơn hoặc cắt gần vùng chứa mã.'
          );
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'UNSUPPORTED_BARCODE_DETECTOR') {
          setScanError(
            'Trình duyệt hiện tại chưa bật nhân nhận diện BarcodeDetector. Vui lòng mở bằng Google Chrome, Microsoft Edge hoặc Safari.'
          );
        } else {
          setScanError('Không thể phân tích hình ảnh này.');
        }
      }
    },
    [recordScanSuccess]
  );

  useEffect(() => {
    if (toolId !== 'qr-scanner') return;
    const onWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            processImageFile(blob);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [toolId, processImageFile]);

  const handleReadImageClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          await processImageFile(blob);
          return;
        }
      }
      setScanError('Trong Clipboard hiện không có hình ảnh nào. Hãy chụp màn hình mã QR rồi thử lại.');
    } catch {
      setScanError('Hãy nhấn tổ hợp phím Ctrl+V (hoặc ⌘V) trực tiếp trên trang để dán ảnh.');
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const startCamera = async () => {
    setScanError(null);
    if (!window.BarcodeDetector) {
      setScanError('Trình duyệt chưa hỗ trợ BarcodeDetector. Hãy dùng Chrome, Edge hoặc Safari.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setScanError('Không thể truy cập Camera. Vui lòng cấp quyền Camera hoặc dùng Ctrl+V dán ảnh.');
    }
  };

  useEffect(() => {
    if (!isCameraActive || !window.BarcodeDetector) return;
    let cancelled = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const results = await detector.detect(video);
          if (results.length > 0 && results[0].rawValue) {
            recordScanSuccess(results[0].rawValue);
            stopCamera();
            return;
          }
        } catch {
          // Tiếp tục frame tiếp theo
        }
      }
      if (!cancelled) {
        setTimeout(tick, 220);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [isCameraActive, recordScanSuccess, stopCamera]);

  const handleCopyScannedText = async () => {
    if (!scannedText) return;
    await navigator.clipboard.writeText(scannedText);
    setCopiedScan(true);
    setTimeout(() => setCopiedScan(false), 1800);
  };

  return (
    <HubShell>
      <ToolPageHeader toolId={toolId} />

      {/* ==================== 1. GIAO DIỆN TẠO MÃ QR TỨC THÌ ==================== */}
      {toolId === 'qr-generator' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '22px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPreset('text')}
                  className={`hub-pill ${preset === 'text' ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <Link2 size={14} />
                  <span>Đường dẫn / Văn bản</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('wifi')}
                  className={`hub-pill ${preset === 'wifi' ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <Wifi size={14} />
                  <span>Wi-Fi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreset('vcard')}
                  className={`hub-pill ${preset === 'vcard' ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <UserSquare2 size={14} />
                  <span>Danh thiếp</span>
                </button>
              </div>

              {preset === 'text' && (
                <button
                  type="button"
                  onClick={handlePasteText}
                  className="btn btn-secondary btn-sm"
                  title="Dán nhanh đường dẫn từ bộ nhớ tạm"
                >
                  <ClipboardPaste size={14} />
                  <span>Dán nhanh</span>
                </button>
              )}
            </div>

            {preset === 'text' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  Nhập hoặc dán đường dẫn (URL), văn bản tiếng Việt, số điện thoại:
                </label>
                <textarea
                  rows={5}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="https://example.com hoặc nội dung bất kỳ..."
                  className="input-field"
                  style={{
                    fontSize: '0.96rem',
                    lineHeight: 1.5,
                    resize: 'vertical',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '6px',
                    fontSize: '0.75rem',
                    color: 'var(--text-dim)',
                  }}
                >
                  <span>Mã QR tự động cập nhật ngay khi gõ</span>
                  <span>{textInput.length} ký tự</span>
                </div>
              </div>
            )}

            {preset === 'wifi' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                    Tên mạng Wi-Fi (SSID)
                  </label>
                  <input
                    type="text"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="Nhập tên Wi-Fi..."
                    className="input-field"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                      Mật khẩu Wi-Fi
                    </label>
                    <input
                      type="text"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                      Chuẩn bảo mật
                    </label>
                    <select
                      value={wifiSecurity}
                      onChange={(e) => setWifiSecurity(e.target.value as 'WPA' | 'WEP' | 'nopass')}
                      className="input-field"
                    >
                      <option value="WPA">WPA/WPA2/WPA3</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">Không mật khẩu</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {preset === 'vcard' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    value={vcardName}
                    onChange={(e) => setVcardName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="input-field"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={vcardPhone}
                    onChange={(e) => setVcardPhone(e.target.value)}
                    placeholder="0901234567"
                    className="input-field"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={vcardEmail}
                    onChange={(e) => setVcardEmail(e.target.value)}
                    placeholder="email@donvi.gov.vn"
                    className="input-field"
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                    Cơ quan / Đơn vị
                  </label>
                  <input
                    type="text"
                    value={vcardOrg}
                    onChange={(e) => setVcardOrg(e.target.value)}
                    placeholder="Tên cơ quan, đơn vị..."
                    className="input-field"
                  />
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: '18px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Kích thước ảnh
                </label>
                <select
                  value={sizePx}
                  onChange={(e) => setSizePx(Number(e.target.value))}
                  className="input-field"
                >
                  <option value={280}>Nhỏ (280×280 px)</option>
                  <option value={360}>Vừa (360×360 px)</option>
                  <option value={600}>Sắc nét (600×600 px)</option>
                  <option value={1000}>In ấn (1000×1000 px)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Mức chống mờ/lỗi
                </label>
                <select
                  value={ecl}
                  onChange={(e) => setEcl(e.target.value as QrEccLevel)}
                  className="input-field"
                >
                  <option value="L">Thấp (L - 7%)</option>
                  <option value="M">Tiêu chuẩn (M - 15%)</option>
                  <option value="Q">Cao (Q - 25%)</option>
                  <option value="H">Tối đa (H - 30%)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Màu mã / nền
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={darkColor}
                    onChange={(e) => setDarkColor(e.target.value)}
                    title="Màu mã QR"
                    style={{
                      width: '38px',
                      height: '34px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  />
                  <input
                    type="color"
                    value={lightColor}
                    onChange={(e) => setLightColor(e.target.value)}
                    title="Màu nền"
                    style={{
                      width: '38px',
                      height: '34px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
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
              textAlign: 'center',
            }}
          >
            {!qrPayload ? (
              <div style={{ padding: '48px 16px', color: 'var(--text-muted)' }}>
                <QrCode size={48} style={{ opacity: 0.35, marginBottom: '10px' }} />
                <p style={{ fontSize: '0.9rem' }}>Nhập nội dung bên trái để hiển thị mã QR tức thì</p>
              </div>
            ) : qrError ? (
              <div style={{ padding: '32px 16px', color: 'var(--accent-rose)' }}>{qrError}</div>
            ) : (
              <>
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '16px',
                    background: '#ffffff',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                    marginBottom: '18px',
                    display: 'inline-flex',
                  }}
                >
                  <canvas
                    ref={qrCanvasRef}
                    style={{
                      width: '240px',
                      height: '240px',
                      display: 'block',
                      borderRadius: '8px',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: '10px',
                    width: '100%',
                  }}
                >
                  <button
                    type="button"
                    onClick={handleCopyQrImage}
                    className="btn btn-primary"
                    style={{ flex: 1, minWidth: '150px' }}
                  >
                    {copiedImage ? <Check size={17} /> : <Copy size={17} />}
                    <span>{copiedImage ? 'Đã chép ảnh QR!' : 'Copy ảnh QR'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadPng}
                    className="btn btn-secondary"
                  >
                    <Download size={16} />
                    <span>Tải PNG</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSvg}
                    className="btn btn-secondary"
                  >
                    <Download size={16} />
                    <span>Tải SVG</span>
                  </button>
                </div>

                <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '12px' }}>
                  Mẹo: Bấm <strong>Copy ảnh QR</strong> rồi sang Word, Zalo hoặc văn bản bấm{' '}
                  <strong>Ctrl+V</strong> để dán thẳng mà không cần lưu file.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== 2. GIAO DIỆN TẠO MÃ VIETQR CHUYỂN KHOẢN ==================== */}
      {toolId === 'vietqr-generator' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '22px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
                1. Chọn ngân hàng thụ hưởng (Chuẩn NAPAS 24/7):
              </label>
              <select
                value={bankBin}
                onChange={(e) => setBankBin(e.target.value)}
                className="input-field"
                style={{ fontWeight: 600 }}
              >
                {VIETQR_BANKS.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.shortName} ({b.code}) — {b.name}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {TOP_BANK_BINS.map((bin) => {
                  const bank = VIETQR_BANKS.find((b) => b.bin === bin);
                  if (!bank) return null;
                  return (
                    <button
                      key={bin}
                      type="button"
                      onClick={() => setBankBin(bin)}
                      className={`hub-pill ${bankBin === bin ? 'is-active' : ''}`}
                      style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '4px 10px' }}
                    >
                      {bank.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  2. Số tài khoản nhận (*):
                </label>
                <input
                  type="text"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  placeholder="Ví dụ: 1023456789"
                  className="input-field"
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Tên chủ tài khoản (hiển thị):
                </label>
                <input
                  type="text"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
                  placeholder="NGUYEN VAN A"
                  className="input-field"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  3. Số tiền VNĐ (để trống = người chuyển tự nhập):
                </label>
                <input
                  type="text"
                  value={
                    parsedBankAmount > 0
                      ? parsedBankAmount.toLocaleString('vi-VN')
                      : bankAmountRaw
                  }
                  onChange={(e) => setBankAmountRaw(e.target.value)}
                  placeholder="Ví dụ: 500.000"
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  4. Nội dung chuyển khoản (tự bỏ dấu):
                </label>
                <input
                  type="text"
                  value={bankNote}
                  onChange={(e) => setBankNote(e.target.value)}
                  placeholder="Thanh toan le phi..."
                  className="input-field"
                />
              </div>
            </div>

            {bankNote.trim() && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                Chuỗi nội dung chuẩn NAPAS: <strong>{sanitizeTransferNote(bankNote)}</strong>
              </div>
            )}
          </div>

          <div
            className="bento-card"
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            {!bankAccountNo.trim() ? (
              <div style={{ padding: '48px 16px', color: 'var(--text-muted)' }}>
                <Landmark size={48} style={{ opacity: 0.35, marginBottom: '10px' }} />
                <p style={{ fontSize: '0.9rem' }}>
                  Nhập <strong>Số tài khoản</strong> bên trái để sinh mã VietQR chuyển khoản tức thì
                </p>
              </div>
            ) : vietQrBuild.error ? (
              <div style={{ padding: '32px 16px', color: 'var(--accent-rose)' }}>
                {vietQrBuild.error}
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: '18px 22px',
                    borderRadius: '18px',
                    background: '#ffffff',
                    color: '#0f172a',
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.14)',
                    marginBottom: '18px',
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: '270px',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0284c7', letterSpacing: '0.04em' }}>
                    VIETQR • {selectedBank.shortName.toUpperCase()}
                  </div>
                  <canvas
                    ref={vietQrCanvasRef}
                    style={{
                      width: '220px',
                      height: '220px',
                      display: 'block',
                      margin: '8px 0',
                    }}
                  />
                  {bankAccountName.trim() && (
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{bankAccountName.trim()}</div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>
                    STK: {bankAccountNo.trim()}
                  </div>
                  {parsedBankAmount > 0 && (
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#059669', marginTop: '4px' }}>
                      {parsedBankAmount.toLocaleString('vi-VN')} ₫
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                  <button
                    type="button"
                    onClick={handleCopyVietQr}
                    className="btn btn-primary"
                    style={{ flex: 1, minWidth: '160px' }}
                  >
                    {copiedVietQr ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copiedVietQr ? 'Đã chép ảnh VietQR!' : 'Copy ảnh VietQR'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadVietQrPng}
                    className="btn btn-secondary"
                  >
                    <Download size={16} />
                    <span>Tải ảnh PNG</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== 3. GIAO DIỆN TẠO MÃ VẠCH CODE 128 ==================== */}
      {toolId === 'barcode-generator' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '22px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, marginBottom: '6px' }}>
                Nhập mã hồ sơ, mã công văn, mã tài sản hoặc mã vận đơn (Code 128):
              </label>
              <input
                type="text"
                value={barcodeText}
                onChange={(e) => setBarcodeText(e.target.value)}
                placeholder="Ví dụ: HS-2026-00158"
                className="input-field"
                style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'monospace' }}
              />
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Hỗ trợ chữ cái không dấu (A–Z, a–z), chữ số (0–9) và ký hiệu tiêu chuẩn (- _ / .).
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Độ dày vạch ({barcodeModuleWidth}px)
                </label>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={barcodeModuleWidth}
                  onChange={(e) => setBarcodeModuleWidth(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Chiều cao vạch ({barcodeHeight}px)
                </label>
                <input
                  type="range"
                  min={50}
                  max={140}
                  step={10}
                  value={barcodeHeight}
                  onChange={(e) => setBarcodeHeight(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={barcodeShowText}
                onChange={(e) => setBarcodeShowText(e.target.checked)}
              />
              <span>Hiển thị dòng ký tự bên dưới mã vạch</span>
            </label>
          </div>

          <div
            className="bento-card"
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            {!barcodeText.trim() ? (
              <div style={{ padding: '48px 16px', color: 'var(--text-muted)' }}>
                <Barcode size={48} style={{ opacity: 0.35, marginBottom: '10px' }} />
                <p style={{ fontSize: '0.9rem' }}>Nhập chuỗi mã bên trái để tạo mã vạch Code 128</p>
              </div>
            ) : barcodeResult.error ? (
              <div style={{ padding: '32px 16px', color: 'var(--accent-rose)' }}>
                {barcodeResult.error}
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: '18px 22px',
                    borderRadius: '14px',
                    background: '#ffffff',
                    boxShadow: '0 10px 28px rgba(0,0,0,0.12)',
                    marginBottom: '18px',
                    maxWidth: '100%',
                    overflowX: 'auto',
                  }}
                  dangerouslySetInnerHTML={{ __html: barcodeResult.svg }}
                />

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
                  <button
                    type="button"
                    onClick={handleCopyBarcodePng}
                    className="btn btn-primary"
                    style={{ flex: 1, minWidth: '150px' }}
                  >
                    {copiedBarcode ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copiedBarcode ? 'Đã chép mã vạch!' : 'Copy ảnh PNG'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadBarcodePng}
                    className="btn btn-secondary"
                  >
                    <Download size={16} />
                    <span>Tải PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadBarcodeSvg}
                    className="btn btn-secondary"
                  >
                    <Download size={16} />
                    <span>Tải SVG</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== 4. GIAO DIỆN QUÉT MÃ QR 1 CHẠM ==================== */}
      {toolId === 'qr-scanner' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '22px',
            alignItems: 'start',
          }}
        >
          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) processImageFile(f);
              }}
              onClick={() => !isCameraActive && fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border-active)',
                borderRadius: 'var(--radius-md)',
                padding: '28px 20px',
                textAlign: 'center',
                cursor: isCameraActive ? 'default' : 'pointer',
                background: 'rgba(6, 182, 212, 0.05)',
                transition: 'all var(--transition-fast)',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processImageFile(f);
                  e.target.value = '';
                }}
              />

              {isCameraActive ? (
                <div>
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    style={{
                      width: '100%',
                      maxHeight: '280px',
                      borderRadius: '12px',
                      background: '#000',
                      marginBottom: '12px',
                    }}
                  />
                  <div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        stopCamera();
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      <CameraOff size={15} />
                      <span>Tắt Camera</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="hub-icon-box"
                    style={{
                      width: '54px',
                      height: '54px',
                      margin: '0 auto 12px',
                      fontSize: '1.6rem',
                    }}
                  >
                    <ScanLine size={28} />
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px' }}>
                    Nhấn <kbd style={{ padding: '2px 7px', borderRadius: '5px', background: 'var(--bg-surface)', border: '1px solid var(--border-medium)' }}>Ctrl + V</kbd> để dán ảnh QR vừa chụp màn hình
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Hoặc kéo-thả ảnh vào đây, hoặc bấm để chọn ảnh từ máy
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      gap: '10px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={handleReadImageClipboard}
                      className="btn btn-primary btn-sm"
                    >
                      <ClipboardPaste size={15} />
                      <span>Dán ảnh từ Clipboard</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-secondary btn-sm"
                    >
                      <Upload size={15} />
                      <span>Chọn file ảnh</span>
                    </button>

                    <button
                      type="button"
                      onClick={startCamera}
                      className="btn btn-secondary btn-sm"
                    >
                      <Camera size={15} />
                      <span>Quét bằng Camera</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {previewImgUrl && (
              <div
                style={{
                  marginTop: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <img
                  src={previewImgUrl}
                  alt="Ảnh QR vừa tải"
                  style={{
                    width: '56px',
                    height: '56px',
                    objectFit: 'contain',
                    borderRadius: '6px',
                    background: '#fff',
                  }}
                />
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Ảnh vừa nạp</div>
                  <div>Bạn có thể bấm Ctrl+V bất kỳ lúc nào để quét ảnh tiếp theo</div>
                </div>
              </div>
            )}
          </div>

          <div className="bento-card" style={{ padding: '22px 24px' }}>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: '12px' }}>
              Kết quả giải mã
            </h3>

            {scanError && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: 'var(--accent-rose)',
                  fontSize: '0.86rem',
                  marginBottom: '14px',
                }}
              >
                {scanError}
              </div>
            )}

            {scannedText ? (
              <div>
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-active)',
                    fontSize: '0.96rem',
                    wordBreak: 'break-all',
                    marginBottom: '14px',
                    lineHeight: 1.5,
                  }}
                >
                  {isHttpUrl(scannedText) ? (
                    <a
                      href={scannedText.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: 'var(--border-active)',
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                    >
                      {scannedText}
                    </a>
                  ) : (
                    <span>{scannedText}</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleCopyScannedText}
                    className="btn btn-primary"
                  >
                    {copiedScan ? <Check size={16} /> : <Copy size={16} />}
                    <span>{copiedScan ? 'Đã sao chép!' : 'Sao chép kết quả'}</span>
                  </button>

                  {isHttpUrl(scannedText) && (
                    <a
                      href={scannedText.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-success"
                      style={{ textDecoration: 'none' }}
                    >
                      <ExternalLink size={16} />
                      <span>Mở đường dẫn ngay</span>
                    </a>
                  )}

                  <a
                    href={`/t/qr-generator`}
                    onClick={(e) => {
                      e.preventDefault();
                      setPreset('text');
                      setTextInput(scannedText);
                      window.history.pushState({}, '', '/t/qr-generator');
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none' }}
                  >
                    <RefreshCw size={15} />
                    <span>Tạo lại QR sắc nét</span>
                  </a>
                </div>
              </div>
            ) : (
              !scanError && (
                <div
                  style={{
                    padding: '36px 16px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.88rem',
                  }}
                >
                  <ImageIcon size={40} style={{ opacity: 0.35, marginBottom: '8px' }} />
                  <p>
                    Chưa có mã nào được quét. Hãy chụp màn hình mã QR rồi nhấn{' '}
                    <strong>Ctrl+V</strong> để lấy link ngay lập tức!
                  </p>
                </div>
              )
            )}

            {scanHistory.length > 0 && (
              <div
                style={{
                  marginTop: '22px',
                  paddingTop: '14px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-dim)',
                    marginBottom: '8px',
                  }}
                >
                  Đã quét trong phiên ({scanHistory.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {scanHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setScannedText(item.value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-main)',
                        }}
                      >
                        {item.value}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                        {item.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 5. TẠO MÃ QR & MÃ VẠCH HÀNG LOẠT (EXCEL -> ZIP / A4 PDF) ==================== */}
      {toolId === 'batch-qr-generator' && <BatchQrGeneratorView />}
    </HubShell>
  );
};

interface BatchStickerItem {
  index: number;
  payload: string;
  label: string;
  valid: boolean;
  error?: string;
}

function renderStickerCanvas(
  item: BatchStickerItem,
  kind: 'qr' | 'code128',
  showLabel: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = 480;
  const h = showLabel ? 540 : 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  if (kind === 'qr') {
    const qrCanvas = document.createElement('canvas');
    renderQrToCanvas(qrCanvas, item.payload, {
      sizePx: 400,
      marginModules: 2,
      ecl: 'M',
      darkColor: '#0f172a',
      lightColor: '#ffffff',
    });
    ctx.drawImage(qrCanvas, 40, 24, 400, 400);
  } else {
    const widths = encodeCode128(item.payload);
    const quietZone = 10;
    const totalModules = widths.reduce((a, b) => a + b, 0) + quietZone * 2;
    const moduleW = Math.max(1.5, Math.floor((w - 64) / totalModules));
    const totalBarW = totalModules * moduleW;
    const startX = Math.round((w - totalBarW) / 2) + quietZone * moduleW;
    const barTop = showLabel ? 90 : 120;
    const barHeight = 240;

    ctx.fillStyle = '#0f172a';
    let curX = startX;
    widths.forEach((wd, idx) => {
      if (idx % 2 === 0) {
        ctx.fillRect(curX, barTop, wd * moduleW, barHeight);
      }
      curX += wd * moduleW;
    });

    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(item.payload, w / 2, barTop + barHeight + 30);
  }

  if (showLabel) {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const maxTextWidth = w - 48;
    let displayLabel = item.label;
    while (displayLabel.length > 4 && ctx.measureText(displayLabel).width > maxTextWidth) {
      displayLabel = `${displayLabel.slice(0, -2)}…`;
    }
    ctx.fillText(displayLabel, w / 2, h - 42);
  }

  return canvas;
}

const BatchQrGeneratorView: React.FC = () => {
  const [rawInput, setRawInput] = useState(
    [
      'TS-2026-001\tMáy tính xách tay Phòng Kế toán',
      'TS-2026-002\tMáy in Laser Văn phòng ĐU',
      'TS-2026-003\tMáy quét tài liệu tốc độ cao',
      'https://bcchub.vn/ho-so-01\tHồ sơ lưu trữ số 01/2026',
      'https://bcchub.vn/ho-so-02\tHồ sơ lưu trữ số 02/2026',
      'HS-HANCHINH-006\tCặp hồ sơ Hội nghị lần thứ 4',
    ].join('\n')
  );
  const [codeKind, setCodeKind] = useState<'qr' | 'code128'>('qr');
  const [gridPreset, setGridPreset] = useState<'3x4' | '3x5' | '4x6'>('3x5');
  const [showLabel, setShowLabel] = useState<boolean>(true);
  const [showCutLines, setShowCutLines] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const items = useMemo<BatchStickerItem[]>(() => {
    return rawInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 500)
      .map((line, idx) => {
        const parts = line.split(/\t|\|/);
        const payload = parts[0].trim();
        const label = (parts[1] ?? parts[0]).trim();

        if (codeKind === 'code128' && !isCode128Encodable(payload)) {
          return {
            index: idx + 1,
            payload,
            label,
            valid: false,
            error: 'Code 128 chỉ nhận chữ không dấu & số ASCII (Hãy chọn Mã QR cho Tiếng Việt)',
          };
        }

        return {
          index: idx + 1,
          payload,
          label,
          valid: true,
        };
      });
  }, [rawInput, codeKind]);

  const validItems = useMemo(() => items.filter((i) => i.valid), [items]);

  const handleDownloadSinglePng = (item: BatchStickerItem) => {
    if (!item.valid) return;
    const canvas = renderStickerCanvas(item, codeKind, showLabel);
    const safeName = item.label
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);
    const link = document.createElement('a');
    link.download = `${String(item.index).padStart(3, '0')}-${safeName || 'ma-qr'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportZip = async () => {
    if (validItems.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const zip = new JSZip();
      for (const item of validItems) {
        const canvas = renderStickerCanvas(item, codeKind, showLabel);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (blob) {
          const safeName = item.label
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);
          const fileName = `${String(item.index).padStart(3, '0')}-${safeName || 'tem'}.png`;
          zip.file(fileName, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bccHub-${codeKind}-${validItems.length}-tem.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdfA4 = async () => {
    if (validItems.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const [cols, rows] = gridPreset.split('x').map(Number);
      const perPage = cols * rows;
      const pdfDoc = await PDFDocument.create();

      const pageW = 595.28; // A4 width pt
      const pageH = 841.89; // A4 height pt
      const margin = 24;
      const cellW = (pageW - margin * 2) / cols;
      const cellH = (pageH - margin * 2) / rows;

      for (let i = 0; i < validItems.length; i += perPage) {
        const page = pdfDoc.addPage([pageW, pageH]);
        const chunk = validItems.slice(i, i + perPage);

        for (let j = 0; j < chunk.length; j++) {
          const item = chunk[j];
          const col = j % cols;
          const row = Math.floor(j / cols);

          const cellX = margin + col * cellW;
          const cellY = pageH - margin - (row + 1) * cellH;

          if (showCutLines) {
            page.drawRectangle({
              x: cellX + 2,
              y: cellY + 2,
              width: cellW - 4,
              height: cellH - 4,
              borderColor: rgb(0.82, 0.85, 0.89),
              borderWidth: 0.6,
            });
          }

          const canvas = renderStickerCanvas(item, codeKind, showLabel);
          const dataUrl = canvas.toDataURL('image/png');
          const pngImage = await pdfDoc.embedPng(dataUrl);

          const pad = 8;
          const availW = cellW - pad * 2;
          const availH = cellH - pad * 2;
          const scale = Math.min(availW / canvas.width, availH / canvas.height);
          const drawW = canvas.width * scale;
          const drawH = canvas.height * scale;

          page.drawImage(pngImage, {
            x: cellX + (cellW - drawW) / 2,
            y: cellY + (cellH - drawH) / 2,
            width: drawW,
            height: drawH,
          });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bccHub-vi-in-tem-${gridPreset}-${validItems.length}-ma.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '18px',
          alignItems: 'start',
        }}
      >
        <div
          className="bento-card"
          style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              Dán danh sách từ Excel (Cột 1: Mã/Link • Cột 2 tùy chọn: Nhãn tên):
            </label>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {validItems.length} tem hợp lệ
            </span>
          </div>

          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={8}
            placeholder="Mỗi dòng 1 mã. Có thể copy 2 cột từ Excel (Mã [Tab] Tên nhãn hiển thị)..."
            className="input-field"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.86rem', resize: 'vertical' }}
          />

          <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
            Mẹo: Khi bôi đen 2 cột trong Excel (Cột A = Mã/Link, Cột B = Tên tài sản/Hồ sơ) rồi dán vào đây, công cụ sẽ tự lấy Cột A làm mã QR và Cột B làm dòng chữ in dưới tem.
          </div>
        </div>

        <div
          className="bento-card"
          style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>
              Loại mã cần sinh hàng loạt:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setCodeKind('qr')}
                className={`btn btn-sm ${codeKind === 'qr' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <QrCode size={15} />
                <span>Mã QR (Hỗ trợ Link & Tiếng Việt)</span>
              </button>
              <button
                type="button"
                onClick={() => setCodeKind('code128')}
                className={`btn btn-sm ${codeKind === 'code128' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <Barcode size={15} />
                <span>Mã vạch Code 128 (Mã hồ sơ/Tài sản)</span>
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px' }}>
              Bố cục dàn trang PDF khổ A4 (In tem dán):
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(
                [
                  { id: '3x4', label: '3 × 4 (12 tem/trang A4)' },
                  { id: '3x5', label: '3 × 5 (15 tem/trang A4)' },
                  { id: '4x6', label: '4 × 6 (24 tem/trang A4)' },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGridPreset(g.id)}
                  className={`btn btn-sm ${gridPreset === g.id ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <span>{g.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.84rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showLabel}
                onChange={(e) => setShowLabel(e.target.checked)}
              />
              <span>In kèm dòng nhãn chữ tiếng Việt bên dưới mỗi mã</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showCutLines}
                onChange={(e) => setShowCutLines(e.target.checked)}
              />
              <span>Kẻ khung viền mảnh dẫn hướng cắt tem trên trang PDF A4</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
              type="button"
              disabled={validItems.length === 0 || isExporting}
              onClick={() => void handleExportPdfA4()}
              className="btn btn-primary"
            >
              <Download size={16} />
              <span>
                {isExporting
                  ? 'Đang tạo file...'
                  : `Xuất PDF Vỉ In A4 (${Math.ceil(validItems.length / (Number(gridPreset[0]) * Number(gridPreset[2])))} trang)`}
              </span>
            </button>

            <button
              type="button"
              disabled={validItems.length === 0 || isExporting}
              onClick={() => void handleExportZip()}
              className="btn btn-secondary"
            >
              <Download size={16} />
              <span>Tải trọn bộ ảnh PNG (.ZIP)</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bento-card" style={{ padding: '20px 22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
            Xem trước danh sách tem ({items.length} mục — bấm vào từng tem để tải lẻ PNG)
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
            gap: '12px',
          }}
        >
          {items.slice(0, 60).map((item) => (
            <div
              key={`${item.index}-${item.payload}`}
              onClick={() => handleDownloadSinglePng(item)}
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'var(--bg-surface)',
                border: `1px solid ${item.valid ? 'var(--border-subtle)' : '#f43f5e'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                cursor: item.valid ? 'pointer' : 'default',
                textAlign: 'center',
              }}
              title={item.valid ? 'Bấm để tải ảnh PNG của tem này' : item.error}
            >
              {item.valid ? (
                <div
                  style={{
                    background: '#ffffff',
                    padding: '8px',
                    borderRadius: '8px',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                  dangerouslySetInnerHTML={{
                    __html:
                      codeKind === 'qr'
                        ? renderQrToSvgString(item.payload, {
                            sizePx: 118,
                            marginModules: 1,
                            ecl: 'M',
                            darkColor: '#0f172a',
                            lightColor: '#ffffff',
                          })
                        : renderCode128Svg(item.payload, {
                            moduleWidth: 1.5,
                            height: 60,
                            showText: true,
                          }),
                  }}
                />
              ) : (
                <div style={{ fontSize: '0.75rem', color: '#f43f5e', padding: '16px 6px' }}>
                  {item.error}
                </div>
              )}

              {showLabel && (
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: 'var(--text-main)',
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </div>
              )}
              <div
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                #{item.index} • {item.payload}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QrToolPage;
