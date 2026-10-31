import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** id các công cụ PDF đã tự xây (đọc từ src/pdf/registry.ts, giống scripts/sync-pdf-redirects.mjs) */
function readPdfToolIds(): Set<string> {
  try {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, 'src/pdf/registry.ts'), 'utf8');
    const block = src.slice(src.indexOf('PDF_TOOLS'), src.indexOf('PDF_TOOL_IDS'));
    return new Set([...block.matchAll(/pdf\('([a-z0-9-]+)'/g)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}
const PDF_TOOL_IDS = readPdfToolIds();

const REDIRECT_TO_HUB = new Set([
  '/pdf',
  '/pdf/',
  '/pdf/index.html',
  '/pdf/tools.html',
  '/pdf/vi',
  '/pdf/vi/',
  '/pdf/vi/index.html',
  '/pdf/vi/tools.html',
]);

function createLegacyPdfRedirectMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url) return next();
    const [rawPath] = req.url.split('?');
    if (!rawPath.startsWith('/pdf')) return next();

    if (REDIRECT_TO_HUB.has(rawPath)) {
      res.statusCode = 302;
      res.setHeader('Location', '/');
      res.end();
      return;
    }

    const hubRoute = rawPath.match(/^\/pdf(?:\/vi)?\/(c|t)\/(.*)$/);
    if (hubRoute) {
      res.statusCode = 302;
      res.setHeader('Location', `/${hubRoute[1]}/${hubRoute[2]}`);
      res.end();
      return;
    }

    const legacyTool = rawPath.match(/^\/pdf\/(?:(?:vi|en)\/)?([a-z0-9-]+)\.html$/);
    if (legacyTool && PDF_TOOL_IDS.has(legacyTool[1])) {
      res.statusCode = 302;
      res.setHeader('Location', `/t/${legacyTool[1]}`);
      res.end();
      return;
    }

    next();
  };
}

function bccPdfEnginePlugin(): Plugin {
  const rootDir = import.meta.dirname;
  const pdfWorkerFile = path.resolve(rootDir, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');

  const serveRawPdfWorkerMiddleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    if (!req.url) return next();
    const [rawPath, query = ''] = req.url.split('?');
    // Serve raw PDF.js worker script so Vite 8 does not inject `/@vite/client` into Web Workers.
    if (
      (rawPath === '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs' ||
        rawPath === '/pdfjs/pdf.worker.min.mjs') &&
      !query.includes('url')
    ) {
      if (fs.existsSync(pdfWorkerFile)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(pdfWorkerFile).pipe(res);
        return;
      }
    }
    next();
  };

  return {
    name: 'bcchub-pdf-engine',
    configureServer(server) {
      server.middlewares.use(serveRawPdfWorkerMiddleware);
      server.middlewares.use(createLegacyPdfRedirectMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveRawPdfWorkerMiddleware);
      server.middlewares.use(createLegacyPdfRedirectMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), bccPdfEnginePlugin()],
  optimizeDeps: {
    entries: ['index.html'],
  },
});
