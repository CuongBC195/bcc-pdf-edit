import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileCheck2,
  Moon,
  Search,
  Sparkles,
  Star,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import {
  findToolLocation,
  getToolHref,
  POPULAR_TOOLS,
  searchCatalog,
  type ToolLocation,
} from '../catalog';
import { useHubPreferences } from '../utils/hubStorage';
import { renderQrToCanvas, renderQrToSvgString } from '../utils/qrCode';
import { resolveRaycastActions, type RaycastQuickAction } from '../utils/raycastActions';
import { setPendingContextFile } from '../utils/contextFileStore';
import { LauncherEmbedContext } from './LauncherEmbedContext';
import type { QrBarcodeToolId } from '../tools/QrToolPage';
import type { VnTextToolId } from '../tools/VietnameseTextTools';
import type { OfficeImageToolId } from '../tools/OfficeImageTools';
import type { DataSpreadsheetToolId } from '../tools/DataSpreadsheetTools';
import type { TimeAdminToolId } from '../tools/TimeAdminTools';

const MultiSplitToolApp = React.lazy(() => import('../App'));
const QrToolPage = React.lazy(() => import('../tools/QrToolPage'));
const VietnameseTextTools = React.lazy(() => import('../tools/VietnameseTextTools'));
const OfficeImageTools = React.lazy(() => import('../tools/OfficeImageTools'));
const DataSpreadsheetTools = React.lazy(() => import('../tools/DataSpreadsheetTools'));
const TimeAdminTools = React.lazy(() => import('../tools/TimeAdminTools'));

const QR_BARCODE_IDS = new Set<QrBarcodeToolId>([
  'qr-generator',
  'qr-scanner',
  'batch-qr-generator',
  'vietqr-generator',
  'barcode-generator',
]);

const VN_TEXT_IDS = new Set<VnTextToolId>([
  'number-to-words',
  'vn-font-converter',
  'text-case-accent',
  'text-extractor',
  'text-diff',
  'word-counter',
  'find-replace-batch',
]);

const OFFICE_IMAGE_IDS = new Set<OfficeImageToolId>([
  'capture-to-text',
  'signature-extractor',
  'image-converter',
  'image-resizer',
  'image-compressor',
  'id-photo-cropper',
  'id-card-merger',
]);

const DATA_SPREADSHEET_IDS = new Set<DataSpreadsheetToolId>([
  'cccd-inspector',
  'vn-name-splitter',
  'list-deduplicator',
  'vat-percent-calculator',
  'table-converter',
]);

const TIME_ADMIN_IDS = new Set<TimeAdminToolId>([
  'workday-calculator',
  'seniority-age-calculator',
  'lunar-solar-calendar',
  'password-generator',
]);

const PDF_CONTEXT_TOOL_IDS = [
  'bcc-multi-split',
  'compress-pdf',
  'merge-pdf',
  'split-pdf',
  'pdf-to-word',
  'ocr-pdf',
  'sign-pdf',
  'rotate-pdf',
  'delete-pages',
  'extract-pages',
];

const IMAGE_CONTEXT_TOOL_IDS = [
  'capture-to-text',
  'signature-extractor',
  'qr-scanner',
  'image-converter',
  'image-resizer',
  'image-compressor',
  'id-photo-cropper',
  'id-card-merger',
  'jpg-to-pdf',
];

type SelectableEntry =
  | { kind: 'quick'; action: RaycastQuickAction }
  | { kind: 'tool'; location: ToolLocation };

const isTauriDesktop = (): boolean =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window ||
    new URLSearchParams(window.location.search).get('window') === 'floating');

export const RaycastLauncherPage: React.FC = () => {
  const { theme, toggleTheme, favorites, recent, toggleFavorite, recordVisit } =
    useHubPreferences();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [contextFile, setContextFile] = useState<File | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inDesktopWindow = useMemo(() => isTauriDesktop(), []);

  const applySelectedContextFile = useCallback((file: File | null) => {
    setContextFile(file);
    setPendingContextFile(file);
    setSelectedIndex(0);
    setActiveToolId(null);
  }, []);

  const focusSearch = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 15);
  }, []);

  useEffect(() => {
    if (!activeToolId) {
      focusSearch();
    }
  }, [activeToolId, focusSearch]);

  useEffect(() => {
    const onSummon = () => {
      setActiveToolId(null);
      focusSearch();
    };
    const onExplorerFile = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; mime: string; base64: string }>).detail;
      if (!detail || !detail.base64) return;
      try {
        const bin = atob(detail.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], detail.name, { type: detail.mime });
        applySelectedContextFile(file);
        focusSearch();
      } catch {
        // Bỏ qua nếu base64 lỗi
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'bcc:embed-back') {
        setActiveToolId(null);
      } else if (
        e.data.type === 'bcc:embed-ready' &&
        contextFile &&
        iframeRef.current?.contentWindow
      ) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'bcc:load-context-file', file: contextFile },
          '*'
        );
      }
    };
    window.addEventListener('bcc:launcher-summon', onSummon);
    window.addEventListener('bcc:explorer-file', onExplorerFile);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('bcc:launcher-summon', onSummon);
      window.removeEventListener('bcc:explorer-file', onExplorerFile);
      window.removeEventListener('message', onMessage);
    };
  }, [focusSearch, applySelectedContextFile, contextFile]);

  const quickActions = useMemo(() => resolveRaycastActions(query), [query]);

  // Danh sách công cụ gọn gàng: khi chưa gõ chỉ hiện Gần đây / Yêu thích + Phổ biến nhất (tối đa 10 mục)
  const filteredTools = useMemo<readonly ToolLocation[]>(() => {
    if (query.trim()) {
      return searchCatalog(query).tools.slice(0, 18);
    }

    if (contextFile) {
      const lower = contextFile.name.toLowerCase();
      if (lower.endsWith('.pdf')) {
        return PDF_CONTEXT_TOOL_IDS.map((id) => findToolLocation(id)).filter(
          (loc): loc is ToolLocation => Boolean(loc)
        );
      }
      if (/\.(png|jpe?g|webp|bmp|gif|ico)$/i.test(lower)) {
        return IMAGE_CONTEXT_TOOL_IDS.map((id) => findToolLocation(id)).filter(
          (loc): loc is ToolLocation => Boolean(loc)
        );
      }
    }

    const prioritizedIds = [...favorites, ...recent];
    const seen = new Set<string>();
    const list: ToolLocation[] = [];

    for (const id of prioritizedIds) {
      if (seen.has(id)) continue;
      const loc = findToolLocation(id);
      if (loc) {
        seen.add(id);
        list.push(loc);
      }
    }

    for (const loc of POPULAR_TOOLS) {
      if (seen.has(loc.tool.id)) continue;
      seen.add(loc.tool.id);
      list.push(loc);
      if (list.length >= 8) break;
    }

    return list.slice(0, 8);
  }, [query, favorites, recent, contextFile]);

  const entries = useMemo<SelectableEntry[]>(() => {
    return [
      ...quickActions.map((action): SelectableEntry => ({ kind: 'quick', action })),
      ...filteredTools.map((location): SelectableEntry => ({ kind: 'tool', location })),
    ];
  }, [quickActions, filteredTools]);

  const safeSelectedIndex = entries.length > 0 ? Math.min(selectedIndex, entries.length - 1) : 0;
  const currentEntry = entries[safeSelectedIndex] ?? null;

  useEffect(() => {
    const el = itemRefs.current[safeSelectedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [safeSelectedIndex]);

  const triggerCopyToast = (id: string) => {
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 1600);
  };

  const executeQuickAction = async (action: RaycastQuickAction) => {
    if (action.specialEffect === 'toggle-theme') {
      toggleTheme();
      triggerCopyToast(action.id);
      return;
    }

    if (action.qrPayload) {
      try {
        const canvas = document.createElement('canvas');
        renderQrToCanvas(canvas, action.qrPayload, {
          sizePx: 600,
          marginModules: 3,
          darkColor: '#0f172a',
          lightColor: '#ffffff',
        });
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (blob && navigator.clipboard && 'ClipboardItem' in window) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          triggerCopyToast(action.id);
          return;
        }
      } catch {
        // Fallback copy text
      }
    }

    if (action.copyText) {
      try {
        await navigator.clipboard.writeText(action.copyText);
        triggerCopyToast(action.id);
      } catch {
        // Bỏ qua nếu bị chặn
      }
    }
  };

  const openToolInLauncher = (toolId: string) => {
    if (contextFile) {
      setPendingContextFile(contextFile);
    }
    recordVisit(toolId);
    setActiveToolId(toolId);
  };

  const activateEntry = (entry: SelectableEntry) => {
    if (entry.kind === 'quick') {
      void executeQuickAction(entry.action);
      return;
    }
    openToolInLauncher(entry.location.tool.id);
  };

  const handleLauncherKeyDown = (e: React.KeyboardEvent) => {
    if (activeToolId) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.key === 'Escape' && !isTyping) || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        setActiveToolId(null);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (entries.length ? (prev + 1) % entries.length : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        entries.length ? (prev - 1 + entries.length) % entries.length : 0
      );
      return;
    }

    if (e.key === 'Enter' && currentEntry) {
      e.preventDefault();
      activateEntry(currentEntry);
      return;
    }

    if (e.key === 'Escape') {
      if (query) {
        e.preventDefault();
        setQuery('');
        setSelectedIndex(0);
      } else if (contextFile) {
        e.preventDefault();
        applySelectedContextFile(null);
      } else if (inDesktopWindow) {
        window.dispatchEvent(new CustomEvent('bcc:launcher-hide'));
      }
    }
  };

  const activeToolLoc = useMemo(
    () => (activeToolId ? findToolLocation(activeToolId) : null),
    [activeToolId]
  );

  const renderEmbeddedToolBody = (toolId: string) => {
    const loadingFallback = (
      <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Đang mở công cụ...
      </div>
    );

    if (toolId === 'bcc-multi-split') {
      return (
        <Suspense fallback={loadingFallback}>
          <MultiSplitToolApp />
        </Suspense>
      );
    }
    if (QR_BARCODE_IDS.has(toolId as QrBarcodeToolId)) {
      return (
        <Suspense fallback={loadingFallback}>
          <QrToolPage toolId={toolId as QrBarcodeToolId} />
        </Suspense>
      );
    }
    if (VN_TEXT_IDS.has(toolId as VnTextToolId)) {
      return (
        <Suspense fallback={loadingFallback}>
          <VietnameseTextTools toolId={toolId as VnTextToolId} />
        </Suspense>
      );
    }
    if (OFFICE_IMAGE_IDS.has(toolId as OfficeImageToolId)) {
      return (
        <Suspense fallback={loadingFallback}>
          <OfficeImageTools toolId={toolId as OfficeImageToolId} />
        </Suspense>
      );
    }
    if (DATA_SPREADSHEET_IDS.has(toolId as DataSpreadsheetToolId)) {
      return (
        <Suspense fallback={loadingFallback}>
          <DataSpreadsheetTools toolId={toolId as DataSpreadsheetToolId} />
        </Suspense>
      );
    }
    if (TIME_ADMIN_IDS.has(toolId as TimeAdminToolId)) {
      return (
        <Suspense fallback={loadingFallback}>
          <TimeAdminTools toolId={toolId as TimeAdminToolId} />
        </Suspense>
      );
    }

    if (activeToolLoc) {
      const pdfUrl = `${getToolHref(activeToolLoc.tool)}?embed=1&theme=${theme}`;
      return (
        <iframe
          ref={iframeRef}
          src={pdfUrl}
          title={activeToolLoc.tool.name}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
          }}
        />
      );
    }

    return null;
  };

  return (
    <div
      className={`raycast-stage ${inDesktopWindow ? 'is-desktop-window' : ''}`}
      onKeyDown={handleLauncherKeyDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (activeToolId) return;
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (f) applySelectedContextFile(f);
      }}
      onPaste={(e) => {
        if (activeToolId) return;
        const f = e.clipboardData?.files?.[0];
        if (f) {
          e.preventDefault();
          applySelectedContextFile(f);
        }
      }}
    >
      <input
        ref={filePickerRef}
        type="file"
        accept=".pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) applySelectedContextFile(f);
          e.target.value = '';
        }}
      />

      {/* Thanh nút phụ tối giản khi mở trên trình duyệt */}
      {!inDesktopWindow && (
        <div className="raycast-top-actions">
          <Link to="/" className="raycast-pill-link">
            <ArrowLeft size={13} />
            <span>Trang chủ bccHub</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => filePickerRef.current?.click()}
              className="raycast-pill-link"
              style={{
                borderColor: contextFile ? '#10b981' : undefined,
                color: contextFile ? '#10b981' : undefined,
              }}
            >
              <Upload size={13} />
              <span>{contextFile ? contextFile.name : 'Trỏ thử file PDF/Ảnh'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="raycast-pill-link"
              aria-label="Đổi giao diện"
            >
              {theme === 'dark' ? (
                <Sun size={13} color="#f59e0b" />
              ) : (
                <Moon size={13} color="#6366f1" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* CỬA SỔ NỔI TỐI GIẢN 1 CỘT */}
      <div
        className={`raycast-window ${
          inDesktopWindow
            ? 'raycast-window--desktop'
            : activeToolLoc
              ? 'raycast-window--expanded'
              : ''
        }`}
      >
        {/* 1. THANH TÌM KIẾM / ĐIỀU HƯỚNG */}
        {activeToolLoc ? (
          <div className="raycast-topbar" data-tauri-drag-region>
            <button
              type="button"
              onClick={() => setActiveToolId(null)}
              className="raycast-back-btn"
              title="Quay lại (Esc)"
            >
              <ArrowLeft size={14} />
              <span>Quay lại</span>
              <kbd>ESC</kbd>
            </button>

            <div className="raycast-active-title" data-tauri-drag-region>
              <span
                className="raycast-mini-icon"
                style={{
                  color: activeToolLoc.trail[0]?.accent ?? '#06b6d4',
                  background: `${activeToolLoc.trail[0]?.accent ?? '#06b6d4'}1a`,
                }}
              >
                <i className={`ph ${activeToolLoc.tool.icon}`} />
              </span>
              <strong>{activeToolLoc.tool.name}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => toggleFavorite(activeToolLoc.tool.id)}
                className={`hub-fav-btn ${
                  favorites.includes(activeToolLoc.tool.id) ? 'is-active' : ''
                }`}
                title="Lưu vào Yêu thích"
              >
                <Star
                  size={15}
                  fill={favorites.includes(activeToolLoc.tool.id) ? '#f59e0b' : 'none'}
                />
              </button>
              <a
                href={getToolHref(activeToolLoc.tool)}
                target="_blank"
                rel="noreferrer"
                className="raycast-icon-btn"
                title="Mở trang đầy đủ"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        ) : (
          <div className="raycast-topbar" data-tauri-drag-region>
            <Search size={19} color="var(--border-active)" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Tìm công cụ, gõ số tiền (15tr), phép tính (1250*48) hoặc dán link QR..."
              className="raycast-input"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(0);
                  focusSearch();
                }}
                className="raycast-icon-btn"
                title="Xóa (Esc)"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Thanh báo tệp đang trỏ (chỉ hiện khi có tệp PDF/Ảnh) */}
        {!activeToolLoc && contextFile && (
          <div className="raycast-context-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <FileCheck2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Đang chọn: <strong>{contextFile.name}</strong> ({(contextFile.size / 1024).toFixed(0)}{' '}
                KB) — nhấn <kbd>Enter</kbd> để mở thẳng trong công cụ
              </span>
            </div>
            <button
              type="button"
              onClick={() => applySelectedContextFile(null)}
              className="raycast-icon-btn"
              title="Bỏ chọn tệp (Esc)"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* 2. DANH SÁCH 1 CỘT GỌN GÀNG (HOẶC CÔNG CỤ ĐANG MỞ) */}
        {activeToolLoc ? (
          <div
            className={`raycast-tool-viewport ${
              activeToolLoc.tool.kind === 'bento' ? 'raycast-tool-viewport--iframe' : ''
            }`}
          >
            <LauncherEmbedContext.Provider value={true}>
              {renderEmbeddedToolBody(activeToolLoc.tool.id)}
            </LauncherEmbedContext.Provider>
          </div>
        ) : (
          <div className="raycast-list-single">
            {entries.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Không tìm thấy công cụ phù hợp với “{query}”.
              </div>
            ) : (
              <>
                {quickActions.length > 0 && (
                  <div className="raycast-group-label">
                    <Sparkles size={11} color="var(--accent-cyan)" />
                    <span>Kết quả tức thì</span>
                  </div>
                )}

                {quickActions.map((action, idx) => {
                  const isSelected = safeSelectedIndex === idx;
                  const isCopied = copiedId === action.id;
                  return (
                    <div
                      key={action.id}
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => activateEntry({ kind: 'quick', action })}
                      className={`raycast-row raycast-row--quick ${isSelected ? 'is-selected' : ''}`}
                    >
                      {action.qrPayload ? (
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            padding: '3px',
                            background: '#ffffff',
                            borderRadius: '7px',
                            border: '1px solid var(--border-subtle)',
                            flexShrink: 0,
                          }}
                          dangerouslySetInnerHTML={{
                            __html: renderQrToSvgString(action.qrPayload, {
                              sizePx: 38,
                              marginModules: 1,
                              darkColor: '#0f172a',
                              lightColor: '#ffffff',
                            }),
                          }}
                        />
                      ) : (
                        <div
                          className="raycast-row__icon"
                          style={{
                            color: action.accent,
                            background: `${action.accent}18`,
                          }}
                        >
                          <i className={`ph ${action.icon}`} />
                        </div>
                      )}

                      <div className="raycast-row__content">
                        <div className="raycast-row__title">{action.title}</div>
                        <div className="raycast-row__sub">{action.subtitle}</div>
                      </div>

                      <span
                        className="raycast-row__badge"
                        style={{
                          color: isCopied ? '#10b981' : action.accent,
                          background: isCopied ? 'rgba(16,185,129,0.14)' : `${action.accent}15`,
                        }}
                      >
                        {isCopied ? (
                          <>
                            <Check size={11} />
                            <span>Đã Copy</span>
                          </>
                        ) : (
                          action.badge
                        )}
                      </span>
                    </div>
                  );
                })}

                {filteredTools.length > 0 && (
                  <div
                    className="raycast-group-label"
                    style={{ marginTop: quickActions.length ? '8px' : 0 }}
                  >
                    <span>
                      {query.trim()
                        ? 'Công cụ'
                        : contextFile
                          ? `Gợi ý cho ${contextFile.name}`
                          : 'Truy cập nhanh'}
                    </span>
                  </div>
                )}

                {filteredTools.map((loc, idx) => {
                  const globalIdx = quickActions.length + idx;
                  const isSelected = safeSelectedIndex === globalIdx;
                  const accent = loc.trail[0]?.accent ?? '#06b6d4';
                  const categoryName = loc.trail[loc.trail.length - 1]?.name ?? 'Tiện ích';
                  return (
                    <div
                      key={loc.tool.id}
                      ref={(el) => {
                        itemRefs.current[globalIdx] = el;
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      onClick={() => activateEntry({ kind: 'tool', location: loc })}
                      className={`raycast-row ${isSelected ? 'is-selected' : ''}`}
                    >
                      <div
                        className="raycast-row__icon"
                        style={{
                          color: accent,
                          background: `${accent}18`,
                        }}
                      >
                        <i className={`ph ${loc.tool.icon}`} />
                      </div>

                      <div className="raycast-row__name">{loc.tool.name}</div>

                      <div className="raycast-row__right">
                        <span className="raycast-row__cat">{categoryName}</span>
                        {isSelected && <kbd className="raycast-enter-hint">↵</kbd>}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* 3. FOOTER TỐI GIẢN */}
        <div className="raycast-footer">
          <span>
            {contextFile
              ? 'Nhấn Enter để mở tệp ngay trong công cụ'
              : 'Mẹo: Kéo-thả tệp PDF/Ảnh vào khung để lọc công cụ tự động'}
          </span>

          <div className="raycast-footer__keys">
            {activeToolLoc ? (
              <span>
                <kbd>ESC</kbd> Quay lại
              </span>
            ) : (
              <>
                <span>
                  <kbd>↑↓</kbd> Chọn
                </span>
                <span>
                  <kbd>↵</kbd> {currentEntry?.kind === 'quick' ? 'Copy' : 'Mở'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
