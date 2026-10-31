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

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.gz': 'application/gzip',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

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

function createPdfEngineMiddleware(bentoDistDir: string) {
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

    // Đồng bộ với vercel.json: link Hub bị rewriteLinks() chèn tiền tố /pdf/vi/
    const hubRoute = rawPath.match(/^\/pdf(?:\/vi)?\/(c|t)\/(.*)$/);
    if (hubRoute) {
      res.statusCode = 302;
      res.setHeader('Location', `/${hubRoute[1]}/${hubRoute[2]}`);
      res.end();
      return;
    }

    // Công cụ đã có bản tự xây -> chuyển sang /t/<id> (đồng bộ với vercel.json)
    const legacyTool = rawPath.match(/^\/pdf\/(?:(?:vi|en)\/)?([a-z0-9-]+)\.html$/);
    if (legacyTool && PDF_TOOL_IDS.has(legacyTool[1])) {
      res.statusCode = 302;
      res.setHeader('Location', `/t/${legacyTool[1]}`);
      res.end();
      return;
    }

    const relPath = decodeURIComponent(rawPath.replace(/^\/pdf\/?/, ''));
    const safePath = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    let filePath = path.join(bentoDistDir, safePath);

    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      const withHtml = `${filePath}.html`;
      if (fs.existsSync(withHtml)) {
        filePath = withHtml;
      }
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      const indexHtml = path.join(filePath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        filePath = indexHtml;
      }
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next();
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  };
}

function bccPdfEnginePlugin(): Plugin {
  const rootDir = import.meta.dirname;
  const bentoDistDir = path.resolve(rootDir, 'vendor/bentopdf/dist');
  const outPdfDir = path.resolve(rootDir, 'dist/pdf');
  const pdfWorkerFile = path.resolve(rootDir, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');

  const serveRawPdfWorkerMiddleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    if (!req.url) return next();
    const [rawPath, query = ''] = req.url.split('?');
    // Let Vite handle `?url` import module wrapper, but serve the actual worker script raw
    // so Vite 8 does not inject `/@vite/client` (which uses `window` and crashes Web Workers).
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
      server.middlewares.use(createPdfEngineMiddleware(bentoDistDir));
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveRawPdfWorkerMiddleware);
      const dir = fs.existsSync(outPdfDir) ? outPdfDir : bentoDistDir;
      server.middlewares.use(createPdfEngineMiddleware(dir));
    },
    closeBundle() {
      if (!fs.existsSync(bentoDistDir)) return;
      fs.rmSync(outPdfDir, { recursive: true, force: true });
      fs.cpSync(bentoDistDir, outPdfDir, { recursive: true });
      console.log('✔ Đã tích hợp nhân công cụ PDF vào dist/pdf/');
    },
  };
}

export default defineConfig({
  plugins: [react(), bccPdfEnginePlugin()],
  optimizeDeps: {
    entries: ['index.html'],
  },
});
