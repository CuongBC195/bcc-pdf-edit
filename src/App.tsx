import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Clock, CheckCircle2, Zap } from 'lucide-react';
import type { PDFMetadata, SplitRule, PDFBookmarkItem, ExportProgress } from './types/pdf';
import { PRESET_COLORS } from './types/pdf';
import { Header } from './components/Header';
import { FileUploader } from './components/FileUploader';
import { QuickPresetsBar } from './components/QuickPresetsBar';
import { VisualThumbnailGrid } from './components/VisualThumbnailGrid';
import { SplitRuleList } from './components/SplitRuleList';
import { BatchRenameModal } from './components/BatchRenameModal';
import { ExportActionBar } from './components/ExportActionBar';
import { parsePageRange, formatPagesToRange } from './utils/pageUtils';
import { extractBookmarks, resetPdfDocumentCache } from './services/thumbnailService';
import { executeMultiSplit } from './services/pdfService';
import { downloadAsZip, saveDirectlyToDirectory } from './services/exportService';
import {
  saveSessionToDb,
  loadSessionFromDb,
  closeActiveSessionInDb,
  getRecentFilesList,
  loadRecentFileSession,
  deleteRecentFileFromDb,
  clearAllRecentFilesFromDb,
  type RecentFileSummary,
} from './services/storageService';
import { RecentFilesList } from './components/RecentFilesList';

export const App: React.FC = () => {
  // Default to Light mode, but respect user's saved preference in localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('bccpdf_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [pdfMeta, setPdfMeta] = useState<PDFMetadata | null>(null);
  const [bookmarks, setBookmarks] = useState<PDFBookmarkItem[]>([]);
  const [rules, setRules] = useState<SplitRule[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [hoveredRuleId, setHoveredRuleId] = useState<string | null>(null);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [lastClickedPage, setLastClickedPage] = useState<number | null>(null);
  const [gridScrollTop, setGridScrollTop] = useState<number>(0);
  const [initialGridScrollTop, setInitialGridScrollTop] = useState<number | undefined>(undefined);
  const [recentFiles, setRecentFiles] = useState<RecentFileSummary[]>([]);
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [restoredNotification, setRestoredNotification] = useState<string | null>(null);
  const [isRecentModalOpen, setIsRecentModalOpen] = useState(false);

  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    status: 'idle',
    current: 0,
    total: 0,
    message: '',
  });

  // Sync theme with document root & persist to localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bccpdf_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Refresh recent files list from IndexedDB
  const refreshRecentFiles = useCallback(async () => {
    try {
      const list = await getRecentFilesList();
      setRecentFiles(list);
    } catch (err) {
      console.warn('Could not refresh recent files', err);
    }
  }, []);

  // 1. Auto-restore active session from IndexedDB on startup / F5 refresh
  useEffect(() => {
    let isCancelled = false;

    const restoreSession = async () => {
      try {
        await refreshRecentFiles();

        const session = await loadSessionFromDb();
        if (!isCancelled && session && session.pdfMeta && session.pdfMeta.arrayBuffer) {
          resetPdfDocumentCache();
          setPdfMeta(session.pdfMeta);
          setRules(session.rules || []);
          setActiveRuleId(session.activeRuleId || null);
          setPageRotations(session.pageRotations || {});
          setSelectedPages(session.selectedPages || []);

          if (session.gridScrollTop && session.gridScrollTop > 0) {
            setInitialGridScrollTop(session.gridScrollTop);
            setGridScrollTop(session.gridScrollTop);
          }

          // Extract bookmarks in background
          extractBookmarks(session.pdfMeta.arrayBuffer).then((bms) => {
            if (!isCancelled) setBookmarks(bms);
          });

          setRestoredNotification(
            `Đã tự động khôi phục phiên làm việc: "${session.pdfMeta.name}" (${(session.rules || []).length} file con). Tải lại trang (F5) không bị mất file hay vị trí!`
          );

          // Restore window scroll position smoothly
          if (session.windowScrollY && session.windowScrollY > 0) {
            setTimeout(() => {
              window.scrollTo({ top: session.windowScrollY, behavior: 'smooth' });
            }, 250);
          }
        }
      } catch (err) {
        console.warn('Could not restore session from IndexedDB:', err);
      }
    };

    restoreSession();
    return () => {
      isCancelled = true;
    };
  }, [refreshRecentFiles]);

  // 2. Auto-save workspace session (including large PDF binary data) to IndexedDB
  const saveTimeoutRef = useRef<any>(null);
  useEffect(() => {
    if (pdfMeta) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        const windowScroll = window.scrollY || document.documentElement.scrollTop || 0;
        await saveSessionToDb(
          pdfMeta,
          rules,
          activeRuleId,
          pageRotations,
          selectedPages,
          windowScroll,
          gridScrollTop
        );
        refreshRecentFiles();
      }, 400);
    }
  }, [pdfMeta, rules, activeRuleId, pageRotations, selectedPages, gridScrollTop, refreshRecentFiles]);

  // Setup rules when new PDF is loaded
  const handlePdfLoaded = async (meta: PDFMetadata) => {
    resetPdfDocumentCache();
    setPdfMeta(meta);
    setSelectedPages([]);
    setActiveRuleId(null);
    setHoveredRuleId(null);
    setPageRotations({});
    setLastClickedPage(null);
    setGridScrollTop(0);
    setInitialGridScrollTop(0);
    setIsLoadingPdf(true);

    try {
      const bms = await extractBookmarks(meta.arrayBuffer);
      setBookmarks(bms);

      // Check if this file was previously opened so we restore its child rules
      const existingSession = await loadRecentFileSession(meta.name);
      if (existingSession && existingSession.rules && existingSession.rules.length > 0) {
        setRules(existingSession.rules);
        setActiveRuleId(existingSession.activeRuleId || null);
        setPageRotations(existingSession.pageRotations || {});
        setSelectedPages(existingSession.selectedPages || []);
      } else {
        setRules([]);
        // Save session immediately to IndexedDB
        await saveSessionToDb(meta, [], null, {}, [], 0, 0);
      }
      await refreshRecentFiles();
    } catch (err) {
      console.error('Error reading PDF structure:', err);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  // When user closes a file, we ensure the latest state is saved, close the active pointer, and show Recent Files!
  const handleReset = async () => {
    if (pdfMeta) {
      // Ensure latest rules, rotations, and scroll position are preserved in IndexedDB
      await saveSessionToDb(
        pdfMeta,
        rules,
        activeRuleId,
        pageRotations,
        selectedPages,
        window.scrollY || 0,
        gridScrollTop
      );
    }
    resetPdfDocumentCache();
    await closeActiveSessionInDb();
    setPdfMeta(null);
    setRules([]);
    setBookmarks([]);
    setSelectedPages([]);
    setActiveRuleId(null);
    setHoveredRuleId(null);
    setPageRotations({});
    setLastClickedPage(null);
    setGridScrollTop(0);
    setInitialGridScrollTop(0);
    setRestoredNotification(null);
    await refreshRecentFiles();
  };

  // Open a file from recent files history with 1 click
  const handleOpenRecentFile = async (fileId: string) => {
    try {
      setIsLoadingPdf(true);
      const session = await loadRecentFileSession(fileId);
      if (session && session.pdfMeta && session.pdfMeta.arrayBuffer) {
        resetPdfDocumentCache();
        setPdfMeta(session.pdfMeta);
        setRules(session.rules || []);
        setActiveRuleId(session.activeRuleId || null);
        setPageRotations(session.pageRotations || {});
        setSelectedPages(session.selectedPages || []);

        if (session.gridScrollTop && session.gridScrollTop > 0) {
          setInitialGridScrollTop(session.gridScrollTop);
          setGridScrollTop(session.gridScrollTop);
        }

        extractBookmarks(session.pdfMeta.arrayBuffer).then((bms) => {
          setBookmarks(bms);
        });

        setRestoredNotification(
          `Đã mở lại tệp "${session.pdfMeta.name}" (${(session.rules || []).length} file con đã lưu).`
        );
        setTimeout(() => setRestoredNotification(null), 4000);

        if (session.windowScrollY && session.windowScrollY > 0) {
          setTimeout(() => {
            window.scrollTo({ top: session.windowScrollY, behavior: 'smooth' });
          }, 250);
        }
      }
    } catch (err) {
      console.error('Error opening recent file:', err);
      alert('Không thể mở tệp từ lịch sử.');
    } finally {
      setIsLoadingPdf(false);
      refreshRecentFiles();
    }
  };

  // Delete single file from history
  const handleDeleteRecentFile = async (fileId: string) => {
    await deleteRecentFileFromDb(fileId);
    await refreshRecentFiles();
  };

  // Clear all recent files history
  const handleClearAllRecent = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử các tệp PDF đã lưu trong trình duyệt không?')) {
      await clearAllRecentFilesFromDb();
      setRecentFiles([]);
      if (pdfMeta) {
        resetPdfDocumentCache();
        setPdfMeta(null);
        setRules([]);
        setBookmarks([]);
        setSelectedPages([]);
        setActiveRuleId(null);
        setHoveredRuleId(null);
        setPageRotations({});
        setLastClickedPage(null);
        setGridScrollTop(0);
        setInitialGridScrollTop(0);
        setRestoredNotification(null);
      }
    }
  };

  // Page selection logic:
  // - If activeRuleId is selected: Clicking a page directly adds/removes it from that active rule!
  // - If no activeRuleId: Multi-selects pages for creating a new child rule
  const handleTogglePageSelect = useCallback((pageNum: number, isShift: boolean) => {
    if (activeRuleId) {
      setRules((prev) =>
        prev.map((r) => {
          if (r.id !== activeRuleId) return r;
          const exists = r.pages.includes(pageNum);
          const newPages = exists
            ? r.pages.filter((p) => p !== pageNum)
            : [...r.pages, pageNum].sort((a, b) => a - b);
          const newRangeStr = formatPagesToRange(newPages);
          return {
            ...r,
            pages: newPages,
            pageRangeStr: newRangeStr,
            isValid: newPages.length > 0,
            errorMsg: newPages.length === 0 ? 'File chưa chọn trang nào' : undefined,
          };
        })
      );
      return;
    }

    if (isShift && lastClickedPage !== null) {
      const start = Math.min(lastClickedPage, pageNum);
      const end = Math.max(lastClickedPage, pageNum);
      const range: number[] = [];
      for (let p = start; p <= end; p++) {
        range.push(p);
      }
      setSelectedPages((prev) => Array.from(new Set([...prev, ...range])).sort((a, b) => a - b));
    } else {
      setSelectedPages((prev) => {
        if (prev.includes(pageNum)) {
          return prev.filter((p) => p !== pageNum);
        } else {
          return [...prev, pageNum].sort((a, b) => a - b);
        }
      });
      setLastClickedPage(pageNum);
    }
  }, [activeRuleId, lastClickedPage]);

  const handleSelectAll = useCallback(() => {
    if (!pdfMeta) return;
    setSelectedPages(Array.from({ length: pdfMeta.pageCount }, (_, i) => i + 1));
  }, [pdfMeta]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPages([]);
    setLastClickedPage(null);
  }, []);

  // Rotation handlers
  const handleRotatePage = useCallback((pageNum: number) => {
    setPageRotations((prev) => {
      const curr = prev[pageNum] || 0;
      const next = (curr + 90) % 360;
      return { ...prev, [pageNum]: next };
    });
  }, []);

  const handleRotateAllPages = useCallback(() => {
    if (!pdfMeta) return;
    setPageRotations((prev) => {
      const next: Record<number, number> = {};
      for (let p = 1; p <= pdfMeta.pageCount; p++) {
        next[p] = ((prev[p] || 0) + 90) % 360;
      }
      return next;
    });
  }, [pdfMeta]);

  const handleResetRotations = useCallback(() => {
    setPageRotations({});
  }, []);

  // Create child rule from selected pages
  const handleCreateRuleFromSelected = () => {
    if (!pdfMeta || selectedPages.length === 0) return;
    const rangeStr = formatPagesToRange(selectedPages);
    const newRuleId = `rule_${Date.now()}`;
    const nextIdx = rules.length + 1;
    const color = PRESET_COLORS[(nextIdx - 1) % PRESET_COLORS.length];

    const newRule: SplitRule = {
      id: newRuleId,
      name: `Part_${nextIdx < 10 ? '0' + nextIdx : nextIdx}.pdf`,
      pageRangeStr: rangeStr,
      pages: [...selectedPages],
      color,
      isValid: true,
    };

    setRules((prev) => [...prev, newRule]);
    setActiveRuleId(newRuleId);
    setSelectedPages([]);
    setLastClickedPage(null);
  };

  // Split at specific page boundary (Scissors line click)
  const handleSplitAtPage = (pageNum: number) => {
    if (!pdfMeta || pageNum >= pdfMeta.pageCount) return;

    // Case 1: When no rules exist yet -> Split entire document into 2 files at this cut point!
    if (rules.length === 0) {
      const pagesA = Array.from({ length: pageNum }, (_, i) => i + 1);
      const pagesB = Array.from({ length: pdfMeta.pageCount - pageNum }, (_, i) => pageNum + 1 + i);

      const baseName = pdfMeta.name.replace(/\.[^/.]+$/, '');
      const newRules: SplitRule[] = [
        {
          id: `rule_${Date.now()}_1`,
          name: `${baseName}_Part01.pdf`,
          pageRangeStr: formatPagesToRange(pagesA),
          pages: pagesA,
          color: PRESET_COLORS[0],
          isValid: true,
        },
        {
          id: `rule_${Date.now()}_2`,
          name: `${baseName}_Part02.pdf`,
          pageRangeStr: formatPagesToRange(pagesB),
          pages: pagesB,
          color: PRESET_COLORS[1],
          isValid: true,
        },
      ];
      setRules(newRules);
      return;
    }

    // Case 2: An existing rule contains pageNum and continues past it -> split that specific rule into two!
    const targetRuleIndex = rules.findIndex(
      (r) => r.isValid && r.pages.includes(pageNum) && r.pages.some((p) => p > pageNum)
    );

    if (targetRuleIndex !== -1) {
      const oldRule = rules[targetRuleIndex];
      const pagesA = oldRule.pages.filter((p) => p <= pageNum);
      const pagesB = oldRule.pages.filter((p) => p > pageNum);

      const ruleA: SplitRule = {
        ...oldRule,
        pageRangeStr: formatPagesToRange(pagesA),
        pages: pagesA,
      };

      const ruleB: SplitRule = {
        id: `rule_${Date.now()}`,
        name: oldRule.name.replace(/\.pdf$/i, '_Phan2.pdf'),
        pageRangeStr: formatPagesToRange(pagesB),
        pages: pagesB,
        color: PRESET_COLORS[rules.length % PRESET_COLORS.length],
        isValid: true,
      };

      const updated = [...rules];
      updated.splice(targetRuleIndex, 1, ruleA, ruleB);
      setRules(updated);
      return;
    }

    // Case 3: Cut at an unassigned page boundary -> create a new rule ending at pageNum
    const assignedPages = new Set(rules.filter((r) => r.isValid).flatMap((r) => r.pages));
    let startPage = 1;
    for (let p = pageNum; p >= 1; p--) {
      if (assignedPages.has(p)) {
        startPage = p + 1;
        break;
      }
    }
    const pagesA: number[] = [];
    for (let p = startPage; p <= pageNum; p++) {
      if (!assignedPages.has(p)) pagesA.push(p);
    }

    if (pagesA.length > 0) {
      const nextIdx = rules.length + 1;
      const newRule: SplitRule = {
        id: `rule_${Date.now()}`,
        name: `Part_${nextIdx < 10 ? '0' + nextIdx : nextIdx}.pdf`,
        pageRangeStr: formatPagesToRange(pagesA),
        pages: pagesA,
        color: PRESET_COLORS[(nextIdx - 1) % PRESET_COLORS.length],
        isValid: true,
      };
      setRules((prev) => [...prev, newRule]);
    }
  };

  // Rule management
  const handleAddRule = () => {
    if (!pdfMeta) return;
    const nextIdx = rules.length + 1;
    const color = PRESET_COLORS[(nextIdx - 1) % PRESET_COLORS.length];

    const allAssigned = new Set(rules.flatMap((r) => r.pages));
    let suggestedPage = 1;
    for (let p = 1; p <= pdfMeta.pageCount; p++) {
      if (!allAssigned.has(p)) {
        suggestedPage = p;
        break;
      }
    }

    const newRule: SplitRule = {
      id: `rule_${Date.now()}`,
      name: `TepCon_${nextIdx < 10 ? '0' + nextIdx : nextIdx}.pdf`,
      pageRangeStr: `${suggestedPage}`,
      pages: [suggestedPage],
      color,
      isValid: true,
    };

    setRules((prev) => [...prev, newRule]);
    setActiveRuleId(newRule.id);
  };

  const handleChangeRuleName = (id: string, name: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, name } : r))
    );
  };

  const handleChangeRuleRange = (id: string, rangeStr: string) => {
    if (!pdfMeta) return;
    const { pages, isValid, error } = parsePageRange(rangeStr, pdfMeta.pageCount);
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              pageRangeStr: rangeStr,
              pages,
              isValid,
              errorMsg: error,
            }
          : r
      )
    );
  };

  const handleChangeRuleColor = (id: string, color: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, color } : r))
    );
  };

  const handleDeleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    if (activeRuleId === id) setActiveRuleId(null);
  };

  const handleDuplicateRule = (id: string) => {
    const target = rules.find((r) => r.id === id);
    if (!target) return;
    const copy: SplitRule = {
      ...target,
      id: `rule_${Date.now()}`,
      name: target.name.replace(/\.pdf$/i, '_Copy.pdf'),
      color: PRESET_COLORS[(rules.length) % PRESET_COLORS.length],
    };
    setRules((prev) => [...prev, copy]);
  };

  // Quick Presets
  const generateRulesFromBookmarks = (bms: PDFBookmarkItem[], totalPages: number) => {
    if (bms.length === 0) return;
    const newRules: SplitRule[] = [];

    for (let i = 0; i < bms.length; i++) {
      const curr = bms[i];
      const startPage = curr.pageNumber;
      const nextBookmark = bms[i + 1];
      const endPage = nextBookmark ? Math.max(startPage, nextBookmark.pageNumber - 1) : totalPages;

      const pageList: number[] = [];
      for (let p = startPage; p <= endPage; p++) {
        pageList.push(p);
      }

      let titleClean = (curr.title || `Muc_${i + 1}`).replace(/[<>:"/\\|?*]/g, '_').trim();
      if (!titleClean.toLowerCase().endsWith('.pdf')) {
        titleClean += '.pdf';
      }

      newRules.push({
        id: `bm_rule_${i + 1}`,
        name: `${i + 1 < 10 ? '0' + (i + 1) : i + 1}_${titleClean}`,
        pageRangeStr: formatPagesToRange(pageList),
        pages: pageList,
        color: PRESET_COLORS[i % PRESET_COLORS.length],
        isValid: true,
      });
    }

    setRules(newRules);
  };

  const handleSplitEveryNPages = (n: number) => {
    if (!pdfMeta || n < 1) return;
    const newRules: SplitRule[] = [];
    const total = pdfMeta.pageCount;
    let idx = 1;

    for (let p = 1; p <= total; p += n) {
      const end = Math.min(p + n - 1, total);
      const pageList: number[] = [];
      for (let k = p; k <= end; k++) {
        pageList.push(k);
      }

      newRules.push({
        id: `rule_n_${idx}`,
        name: `Part_${idx < 10 ? '0' + idx : idx}_Trang_${p}-${end}.pdf`,
        pageRangeStr: `${p}-${end}`,
        pages: pageList,
        color: PRESET_COLORS[(idx - 1) % PRESET_COLORS.length],
        isValid: true,
      });
      idx++;
    }

    setRules(newRules);
  };

  const handleSplitEveryPage = () => {
    if (!pdfMeta) return;
    const newRules: SplitRule[] = [];
    for (let p = 1; p <= pdfMeta.pageCount; p++) {
      newRules.push({
        id: `rule_single_${p}`,
        name: `Trang_${p < 10 ? '0' + p : p}.pdf`,
        pageRangeStr: `${p}`,
        pages: [p],
        color: PRESET_COLORS[(p - 1) % PRESET_COLORS.length],
        isValid: true,
      });
    }
    setRules(newRules);
  };

  const handleBatchRename = (pattern: string) => {
    if (!pdfMeta) return;
    const baseOriginal = pdfMeta.name.replace(/\.[^/.]+$/, '');

    setRules((prev) =>
      prev.map((r, i) => {
        const idx1 = i + 1;
        const idx02 = idx1 < 10 ? `0${idx1}` : `${idx1}`;
        const range = r.pageRangeStr || `${r.pages[0] || 1}-${r.pages[r.pages.length - 1] || 1}`;

        let newName = pattern
          .replace(/\{index:02d\}/g, idx02)
          .replace(/\{index\}/g, `${idx1}`)
          .replace(/\{original\}/g, baseOriginal)
          .replace(/\{range\}/g, range)
          .replace(/\{pages\}/g, `${r.pages.length}`);

        if (!newName.toLowerCase().endsWith('.pdf')) {
          newName += '.pdf';
        }

        return { ...r, name: newName };
      })
    );
  };

  // Export handlers
  const handleExportZip = async (zipName: string) => {
    if (!pdfMeta || rules.length === 0) return;

    try {
      setExportProgress({
        status: 'processing',
        current: 0,
        total: rules.length,
        message: 'Bắt đầu trích xuất các trang...',
      });

      const results = await executeMultiSplit(
        pdfMeta.arrayBuffer,
        rules,
        pageRotations,
        (curr, total, msg) => {
          setExportProgress({
            status: 'processing',
            current: curr,
            total,
            message: msg,
          });
        }
      );

      setExportProgress({
        status: 'zipping',
        current: rules.length,
        total: rules.length,
        message: 'Đang đóng gói file .ZIP...',
      });

      await downloadAsZip(results, zipName, (percent, msg) => {
        setExportProgress({
          status: 'zipping',
          current: percent,
          total: 100,
          message: msg,
        });
      });

      setExportProgress({
        status: 'done',
        current: 100,
        total: 100,
        message: 'Hoàn tất! File ZIP đã được tải về.',
      });

      setTimeout(() => {
        setExportProgress((prev) => (prev.status === 'done' ? { ...prev, status: 'idle' } : prev));
      }, 4000);
    } catch (err: any) {
      alert('Lỗi khi xuất file: ' + err.message);
      setExportProgress({
        status: 'error',
        current: 0,
        total: 0,
        message: 'Thất bại: ' + err.message,
      });
    }
  };

  const handleSaveToDisk = async () => {
    if (!pdfMeta || rules.length === 0) return;

    try {
      setExportProgress({
        status: 'preparing',
        current: 0,
        total: rules.length,
        message: 'Vui lòng chọn thư mục lưu trên máy...',
      });

      const results = await executeMultiSplit(
        pdfMeta.arrayBuffer,
        rules,
        pageRotations,
        (curr, total, msg) => {
          setExportProgress({
            status: 'processing',
            current: curr,
            total,
            message: msg,
          });
        }
      );

      setExportProgress({
        status: 'saving',
        current: 0,
        total: results.length,
        message: 'Đang ghi các tệp vào ổ đĩa...',
      });

      const res = await saveDirectlyToDirectory(results, (curr, total, msg) => {
        setExportProgress({
          status: 'saving',
          current: curr,
          total,
          message: msg,
        });
      });

      if (res.success) {
        setExportProgress({
          status: 'done',
          current: 100,
          total: 100,
          message: 'Tuyệt vời! Toàn bộ file và thư mục đã được lưu vào máy tính.',
        });
        setTimeout(() => {
          setExportProgress((prev) => (prev.status === 'done' ? { ...prev, status: 'idle' } : prev));
        }, 4000);
      } else if (res.error) {
        alert(res.error);
        setExportProgress({ status: 'idle', current: 0, total: 0, message: '' });
      }
    } catch (err: any) {
      alert('Lỗi khi ghi tệp: ' + err.message);
      setExportProgress({ status: 'idle', current: 0, total: 0, message: '' });
    }
  };

  const validRules = rules.filter((r) => r.isValid && r.pages.length > 0);
  const totalAssignedPages = rules.reduce((acc, r) => (r.isValid ? acc + r.pages.length : acc), 0);
  const uniqueAssignedPages = new Set(rules.filter((r) => r.isValid).flatMap((r) => r.pages)).size;
  const unassignedPagesCount = pdfMeta ? pdfMeta.pageCount - uniqueAssignedPages : 0;
  const hasErrors = rules.some((r) => !r.isValid);

  return (
    <>
      <div className="app-container" style={{ paddingBottom: '90px' }}>
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          recentCount={recentFiles.length}
          onOpenRecentModal={() => setIsRecentModalOpen(true)}
        />

        {restoredNotification && (
          <div
            className="bento-card animate-fade-in"
            style={{
              padding: '10px 16px',
              marginBottom: '16px',
              background: 'rgba(2, 132, 199, 0.08)',
              border: '1px solid var(--border-active)',
              color: 'var(--text-main)',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
              <span>{restoredNotification}</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
              onClick={() => setRestoredNotification(null)}
            >
              Đã hiểu
            </button>
          </div>
        )}

        {/* When in Home screen (no active file opened) */}
        {!pdfMeta && (
          <>
            {/* Quick Access Bar for Saved Files (if any exist in browser storage) */}
            {recentFiles.length > 0 && (
              <div
                className="bento-card animate-fade-in"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  marginBottom: '18px',
                  background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(99, 102, 241, 0.05))',
                  border: '1px solid rgba(2, 132, 199, 0.22)',
                  borderRadius: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(2, 132, 199, 0.12)',
                      border: '1px solid rgba(2, 132, 199, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--border-active)',
                      flexShrink: 0,
                    }}
                  >
                    <Clock size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>Bộ nhớ trình duyệt: {recentFiles.length} tệp đã lưu</span>
                      <span className="badge badge-cyan" style={{ fontSize: '0.72rem', padding: '1px 6px' }}>
                        100% Client-Side
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Tệp gần nhất: <strong style={{ color: 'var(--text-main)' }}>{recentFiles[0]?.name}</strong> ({recentFiles[0]?.pageCount} trang, {recentFiles[0]?.ruleCount} file con)
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenRecentFile(recentFiles[0].id)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    title="Mở ngay tệp làm việc gần nhất"
                  >
                    <Zap size={14} style={{ color: 'var(--accent-amber)' }} />
                    <span>Mở tệp gần nhất</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRecentModalOpen(true)}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    title="Mở danh sách các tệp trong cửa sổ Popup nổi"
                  >
                    <FolderOpen size={14} />
                    <span>Xem danh sách tệp ({recentFiles.length})</span>
                  </button>
                </div>
              </div>
            )}

            {/* Main Clean Hero Uploader */}
            <FileUploader
              pdfMeta={pdfMeta}
              onFileLoaded={handlePdfLoaded}
              onReset={handleReset}
              isLoading={isLoadingPdf}
              isCompactMode={false}
              recentCount={recentFiles.length}
              onOpenRecentModal={() => setIsRecentModalOpen(true)}
            />
          </>
        )}

        {/* When inside Workspace: Compact file header */}
        {pdfMeta && (
          <FileUploader
            pdfMeta={pdfMeta}
            onFileLoaded={handlePdfLoaded}
            onReset={handleReset}
            isLoading={isLoadingPdf}
            recentCount={recentFiles.length}
            onOpenRecentModal={() => setIsRecentModalOpen(true)}
          />
        )}

        {pdfMeta && (
          <div className="animate-fade-in">
            <QuickPresetsBar
              bookmarks={bookmarks}
              totalSourcePages={pdfMeta.pageCount}
              onApplyBookmarks={() => generateRulesFromBookmarks(bookmarks, pdfMeta.pageCount)}
              onSplitEveryNPages={handleSplitEveryNPages}
              onSplitEveryPage={handleSplitEveryPage}
              onOpenBatchRename={() => setIsBatchRenameOpen(true)}
              onClearRules={() => {
                setRules([]);
                setActiveRuleId(null);
              }}
              ruleCount={rules.length}
            />

            {/* 2-Column Split Pane Workspace */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(360px, 1fr)',
                gap: '24px',
                alignItems: 'start',
              }}
            >
              {/* Left: Visual Thumbnail Grid */}
              <VisualThumbnailGrid
                sourceBuffer={pdfMeta.arrayBuffer}
                totalPageCount={pdfMeta.pageCount}
                rules={rules}
                selectedPages={selectedPages}
                activeRuleId={activeRuleId}
                hoveredRuleId={hoveredRuleId}
                pageRotations={pageRotations}
                onTogglePageSelect={handleTogglePageSelect}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onCreateRuleFromSelected={handleCreateRuleFromSelected}
                onSplitAtPage={handleSplitAtPage}
                onRotatePage={handleRotatePage}
                onRotateAllPages={handleRotateAllPages}
                onResetRotations={handleResetRotations}
                onClearActiveRule={() => setActiveRuleId(null)}
                initialScrollTop={initialGridScrollTop}
                onScrollChange={(top) => setGridScrollTop(top)}
              />

              {/* Right: Rules & Folder Structure Panel */}
              <SplitRuleList
                rules={rules}
                totalSourcePages={pdfMeta.pageCount}
                activeRuleId={activeRuleId}
                onSelectRule={(id) => setActiveRuleId((prev) => (prev === id ? null : id))}
                onHoverRule={(id) => setHoveredRuleId(id)}
                onAddRule={handleAddRule}
                onChangeName={handleChangeRuleName}
                onChangeRange={handleChangeRuleRange}
                onChangeColor={handleChangeRuleColor}
                onDelete={handleDeleteRule}
                onDuplicate={handleDuplicateRule}
              />
            </div>

            {/* Batch Rename Modal */}
            <BatchRenameModal
              isOpen={isBatchRenameOpen}
              onClose={() => setIsBatchRenameOpen(false)}
              rules={rules}
              originalPdfName={pdfMeta.name}
              onApplyPattern={handleBatchRename}
            />
          </div>
        )}
      </div>

      {/* Bottom Dock Action Bar - Placed outside container directly at viewport bottom */}
      {pdfMeta && (
        <ExportActionBar
          validRuleCount={validRules.length}
          totalAssignedPages={totalAssignedPages}
          unassignedPagesCount={unassignedPagesCount}
          hasErrors={hasErrors}
          onExportZip={handleExportZip}
          onSaveToDisk={handleSaveToDisk}
          exportProgress={exportProgress}
          defaultZipName={`${pdfMeta.name.replace(/\.[^/.]+$/, '')}_Splitted.zip`}
        />
      )}

      {/* Workspace Recent Files Popup Modal */}
      {isRecentModalOpen &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999999,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              animation: 'fadeIn 0.2s ease',
            }}
            onClick={() => setIsRecentModalOpen(false)}
          >
            <div
              className="animate-popup-scale"
              style={{
                width: '92vw',
                maxWidth: '1100px',
                maxHeight: '88vh',
                overflowY: 'auto',
                borderRadius: '20px',
                background: 'var(--bg-surface)',
                boxShadow: '0 25px 70px -10px rgba(0, 0, 0, 0.45)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <RecentFilesList
                recentFiles={recentFiles}
                onOpenRecentFile={(id) => {
                  setIsRecentModalOpen(false);
                  handleOpenRecentFile(id);
                }}
                onDeleteRecentFile={handleDeleteRecentFile}
                onClearAllRecent={handleClearAllRecent}
                onUploadNewClick={() => {
                  setIsRecentModalOpen(false);
                  const input = document.getElementById('bccpdf-main-file-input') as HTMLInputElement;
                  input?.click();
                }}
                isModalMode={true}
                onCloseModal={() => setIsRecentModalOpen(false)}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default App;
