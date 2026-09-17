import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFBookmarkItem } from '../types/pdf';

// Configure pdfjs worker using Vite asset URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Cache loaded PDFDocumentProxy promise to avoid race conditions and duplicate worker loading
let cachedPromise: Promise<any> | null = null;
let cachedBuffer: ArrayBuffer | null = null;

export function resetPdfDocumentCache() {
  cachedPromise = null;
  cachedBuffer = null;
}

export async function getPdfDocumentProxy(arrayBuffer: ArrayBuffer) {
  if (cachedBuffer === arrayBuffer && cachedPromise) {
    return cachedPromise;
  }
  cachedBuffer = arrayBuffer;

  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const wasmUrl = `${base}/pdfjs/wasm/`;
  const cMapUrl = `${base}/pdfjs/cmaps/`;
  const standardFontDataUrl = `${base}/pdfjs/standard_fonts/`;

  // Crucial: ALWAYS pass a fresh slice/copy so pdf.js web worker will NEVER detach the user's master ArrayBuffer!
  const bufferCopy = arrayBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bufferCopy),
    useSystemFonts: true,
    wasmUrl,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
  });

  cachedPromise = loadingTask.promise.catch((err) => {
    // Reset cache on failure so next attempt doesn't reuse rejected promise
    cachedPromise = null;
    cachedBuffer = null;
    throw err;
  });

  return cachedPromise;
}

/**
 * Extracts PDF Bookmarks / Table of Contents if available
 */
export async function extractBookmarks(arrayBuffer: ArrayBuffer): Promise<PDFBookmarkItem[]> {
  try {
    const pdf = await getPdfDocumentProxy(arrayBuffer);
    const outline = await pdf.getOutline();
    if (!outline || outline.length === 0) return [];

    const items: PDFBookmarkItem[] = [];

    async function traverse(nodes: any[], level: number) {
      for (const node of nodes) {
        let pageNum = 1;
        try {
          if (typeof node.dest === 'string') {
            const dest = await pdf.getDestination(node.dest);
            if (dest && dest[0]) {
              const pageIndex = await pdf.getPageIndex(dest[0]);
              pageNum = pageIndex + 1;
            }
          } else if (Array.isArray(node.dest) && node.dest[0]) {
            const pageIndex = await pdf.getPageIndex(node.dest[0]);
            pageNum = pageIndex + 1;
          }
        } catch {
          // If destination resolving fails, default pageNum remains 1
        }

        items.push({
          title: (node.title || '').trim(),
          pageNumber: pageNum,
          level,
        });

        if (node.items && node.items.length > 0) {
          await traverse(node.items, level + 1);
        }
      }
    }

    await traverse(outline, 0);
    return items.sort((a, b) => a.pageNumber - b.pageNumber);
  } catch (err) {
    console.warn('Could not extract PDF bookmarks:', err);
    return [];
  }
}

/**
 * Renders thumbnail of a specific page to WebP / PNG data URL
 */
export async function renderPageThumbnail(
  arrayBuffer: ArrayBuffer,
  pageNumber: number,
  targetWidth: number = 220
): Promise<{ dataUrl: string; width: number; height: number }> {
  const pdf = await getPdfDocumentProxy(arrayBuffer);
  const page = await pdf.getPage(pageNumber);
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / unscaledViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  if (!context) {
    throw new Error('Canvas context not available');
  }

  // White background for transparent pages
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  let dataUrl = canvas.toDataURL('image/webp', 0.85);
  if (!dataUrl || dataUrl.length < 50) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  }

  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
  };
}
