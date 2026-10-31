#!/usr/bin/env node
/**
 * Áp giao diện bccHub lên bộ công cụ PDF đã build (vendor/bentopdf/dist).
 *
 * - Chèn theme.css + shell.js (pdf-skin/) vào mọi trang.
 * - Thay thanh điều hướng/footer gốc bằng header/footer của bccHub.
 * - Chèn khối tiêu đề công cụ (thanh công cụ cùng nhóm + thẻ tiêu đề + Yêu thích) giống ToolPageHeader.
 * - Bỏ các khối giới thiệu tiếng Anh (How it works / Related tools / FAQ).
 *
 * Idempotent: chạy lại nhiều lần cho cùng kết quả (mọi phần tử chèn vào đều có thuộc tính data-bcchub).
 * Chạy: node scripts/skin-pdf-tools.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENTO = path.join(ROOT, 'vendor/bentopdf');
const DIST = path.join(BENTO, 'dist');
const SKIN_SRC = path.join(ROOT, 'pdf-skin');
const SKIN_OUT = path.join(DIST, 'bcchub');
const CACHE = path.join(ROOT, 'node_modules/.cache/bcchub-skin');

if (!fs.existsSync(DIST)) {
  console.warn('⚠ Chưa có vendor/bentopdf/dist — bỏ qua bước áp giao diện bccHub.');
  process.exit(0);
}

const { JSDOM } = createRequire(path.join(BENTO, 'package.json'))('jsdom');
const ts = createRequire(path.join(ROOT, 'package.json'))('typescript');

// ---------------------------------------------------------------------------
// 1. Nạp catalog của Hub (tree.ts + internalTools.ts) để dựng tiêu đề công cụ
// ---------------------------------------------------------------------------
async function importTs(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${path.basename(relPath, '.ts')}.mjs`);
  fs.writeFileSync(file, out);
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`);
}

const { CATEGORY_TREE } = await importTs('src/catalog/tree.ts');
const { INTERNAL_TOOLS } = await importTs('src/catalog/internalTools.ts');
const { PDF_TOOLS } = await importTs('src/pdf/registry.ts');
const bentoTools = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/catalog/bentoTools.generated.json'), 'utf8')
);

const toolsById = new Map();
for (const t of [...INTERNAL_TOOLS, ...PDF_TOOLS]) toolsById.set(t.id, { ...t, kind: 'internal' });
for (const t of bentoTools) {
  // Công cụ đã có bản tự xây (/t/<id>) thì không dùng thông tin bản cũ
  if (toolsById.has(t.id)) continue;
  toolsById.set(t.id, {
    id: t.id,
    kind: 'bento',
    name: t.name,
    description: t.description,
    icon: t.icon || 'ph-file-pdf',
  });
}
const TOTAL_TOOLS = toolsById.size;

/** toolId -> { tool, category (trực tiếp), accent } */
const locations = new Map();
function walkTree(defs, parentPath, inheritedAccent) {
  for (const def of defs) {
    const pathSlugs = [...parentPath, def.slug];
    const accent = def.accent ?? inheritedAccent;
    const category = { name: def.name, href: `/c/${pathSlugs.join('/')}`, accent, tools: def.tools ?? [] };
    for (const id of def.tools ?? []) {
      if (!locations.has(id) && toolsById.has(id)) locations.set(id, { tool: toolsById.get(id), category });
    }
    walkTree(def.children ?? [], pathSlugs, accent);
  }
}
walkTree(CATEGORY_TREE, [], '#06b6d4');

const toolHref = (t) => (t.kind === 'internal' ? `/t/${t.id}` : `/pdf/vi/${t.id}.html`);

// ---------------------------------------------------------------------------
// 2. Markup dùng chung
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const svg = (inner, size = 15) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICON = {
  layers:
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  scissors:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
};

const LOGO_SVG = fs.readFileSync(path.join(ROOT, 'public/favicon.svg'), 'utf8').trim();

const HEADER_HTML = `
<header class="bcc-shell" data-bcchub>
  <div class="bcc-shell__inner">
    <a class="bcc-brand" href="/">
      <span class="bcc-brand__logo">${LOGO_SVG}</span>
      <span>
        <span class="bcc-brand__row">
          <span class="bcc-brand__name">bcc<b>Hub</b></span>
          <span class="bcc-badge">${TOTAL_TOOLS} công cụ</span>
        </span>
        <span class="bcc-brand__sub">Cổng tiện ích Văn phòng, PDF &amp; Mã QR • 100% xử lý trực tiếp trên trình duyệt</span>
      </span>
    </a>
    <div class="bcc-actions">
      <a class="bcc-btn bcc-btn--secondary bcc-search" href="/?search=1" title="Tìm kiếm công cụ (Ctrl+K)">${svg(ICON.search)}<span>Tìm nhanh</span><kbd>Ctrl K</kbd></a>
      <button type="button" class="bcc-btn bcc-btn--secondary" data-bcc-theme-toggle aria-label="Đổi giao diện Sáng/Tối">
        <span class="bcc-when-dark bcc-ico bcc-ico-sun">${svg(ICON.sun)}</span><span class="bcc-when-dark">Sáng</span>
        <span class="bcc-when-light bcc-ico bcc-ico-moon">${svg(ICON.moon)}</span><span class="bcc-when-light">Tối</span>
      </button>
    </div>
  </div>
</header>`;

const FOOTER_HTML = `
<footer class="bcc-footer" data-bcchub>
  <div class="bcc-footer__line"></div>
  <div><strong>bccHub</strong> — Toàn bộ tài liệu, văn bản và hình ảnh được xử lý 100% trên trình duyệt của bạn, không tải lên máy chủ.</div>
  <div>Hệ sinh thái tiện ích văn phòng thông minh • Nhấn <kbd>Ctrl + K</kbd> để mở nhanh mọi công cụ</div>
</footer>`;

function toolHeadHtml(toolId, standalone) {
  const loc = locations.get(toolId);
  if (!loc) return '';
  const { tool, category } = loc;
  const siblings = category.tools.map((id) => toolsById.get(id)).filter(Boolean);
  const pills =
    siblings.length > 1
      ? `<nav class="bcc-pills" aria-label="Công cụ cùng nhóm">
      <a class="bcc-pill" href="${category.href}">${svg(ICON.arrowLeft, 14)}<span>${esc(category.name)}</span></a>
      ${siblings
        .map(
          (s) =>
            `<a class="bcc-pill${s.id === tool.id ? ' is-active' : ''}" href="${toolHref(s)}"${
              s.id === tool.id ? ' aria-current="page"' : ''
            }><i class="ph ${esc(s.icon)}"></i><span>${esc(s.name)}</span></a>`
        )
        .join('\n      ')}
    </nav>`
      : `<nav class="bcc-pills"><a class="bcc-pill" href="${category.href}">${svg(ICON.arrowLeft, 14)}<span>${esc(category.name)}</span></a></nav>`;

  return `
<div class="bcc-tool-head${standalone ? ' bcc-tool-head--standalone' : ''}" data-bcchub data-bcc-tool-id="${esc(tool.id)}">
    ${pills}
    <div class="bcc-head-card" style="--bcc-accent:${esc(category.accent)}">
      <div class="bcc-head-main">
        <div class="bcc-icon-box"><i class="ph ${esc(tool.icon)}"></i></div>
        <div>
          <div class="bcc-head-title">
            <h2>${esc(tool.name)}</h2>
            <button type="button" class="bcc-fav" data-bcc-fav="${esc(tool.id)}" title="Lưu vào Yêu thích">${svg(ICON.star, 16)}</button>
          </div>
          <p class="bcc-head-desc">${esc(tool.description)}</p>
        </div>
      </div>
    </div>
</div>`;
}

// ---------------------------------------------------------------------------
// 3. Ghi asset theme.css / shell.js
// ---------------------------------------------------------------------------
const COLOR_FAMILIES = [
  'indigo', 'blue', 'sky', 'cyan', 'teal', 'emerald', 'green', 'lime', 'yellow', 'amber',
  'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet',
];
const coloredBg = [
  '.bg-black',
  '.bg-gray-950',
  ...COLOR_FAMILIES.flatMap((c) => [500, 600, 700, 800, 900].map((s) => `.bg-${c}-${s}`)),
].join(',');

fs.mkdirSync(SKIN_OUT, { recursive: true });
const themeCss = fs
  .readFileSync(path.join(SKIN_SRC, 'theme.css'), 'utf8')
  .replaceAll('/*__COLORED_BG__*/', coloredBg);
const shellJs = fs.readFileSync(path.join(SKIN_SRC, 'shell.js'), 'utf8');
fs.writeFileSync(path.join(SKIN_OUT, 'theme.css'), themeCss);
fs.writeFileSync(path.join(SKIN_OUT, 'shell.js'), shellJs);
const version = crypto.createHash('sha256').update(themeCss).update(shellJs).digest('hex').slice(0, 10);

const HEAD_HTML = `
<meta data-bcchub name="google" content="notranslate">
<link data-bcchub rel="preconnect" href="https://fonts.googleapis.com">
<link data-bcchub rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link data-bcchub rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap">
<link data-bcchub rel="stylesheet" href="/pdf/bcchub/theme.css?v=${version}">
<script data-bcchub src="/pdf/bcchub/shell.js?v=${version}"></script>`;

// ---------------------------------------------------------------------------
// 4. Xử lý từng trang HTML
// ---------------------------------------------------------------------------
const REMOVED_SECTION_KEYS = ['faq.sectionTitle', 'howItWorks.title', 'relatedTools.title'];

const walkFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
};

function skinDocument(document, toolId) {
  // Dọn phần tử cũ (lần chạy trước / bản build cũ)
  for (const el of document.querySelectorAll('[data-bcchub], #bcc-hub-style, #bcc-hub-back')) el.remove();
  for (const el of document.querySelectorAll('nav[data-simple-nav], footer[data-simple-footer]')) el.remove();
  for (const el of document.querySelectorAll('nav[data-bentopdf-breadcrumb]')) el.remove();

  for (const key of REMOVED_SECTION_KEYS) {
    for (const h of document.querySelectorAll(`[data-i18n="${key}"]`)) h.closest('section')?.remove();
  }
  // Trang công cụ: mọi <section> cấp body đều là nội dung giới thiệu (tiếng Anh), không phải giao diện công cụ
  if (toolId) for (const s of document.querySelectorAll('body > section')) s.remove();

  for (const icon of document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')) icon.remove();
  document.head.insertAdjacentHTML(
    'beforeend',
    `<link data-bcchub rel="icon" type="image/svg+xml" href="/bcc-logo.svg?v=${version}"><link data-bcchub rel="shortcut icon" type="image/svg+xml" href="/bcc-logo.svg?v=${version}">${HEAD_HTML}`
  );

  document.body.insertAdjacentHTML('afterbegin', HEADER_HTML);

  // Khung trang công cụ: #uploader hoặc khối min-h-screen đầu tiên (form-creator, json-to-pdf, markdown-to-pdf...)
  const page =
    document.getElementById('uploader') ??
    [...document.body.children].find(
      (el) => el.tagName === 'DIV' && el.classList.contains('min-h-screen') && !el.hasAttribute('data-bcchub')
    );
  page?.classList.add('bcc-page');

  const head = toolId ? toolHeadHtml(toolId, !page) : '';
  if (head) {
    if (page) page.insertAdjacentHTML('afterbegin', head);
    else document.querySelector('header.bcc-shell')?.insertAdjacentHTML('afterend', head);

    // Ẩn nút "Quay lại" và tiêu đề gốc (giữ phần tử để script gốc không lỗi)
    for (const el of document.querySelectorAll('[id^="back-to-tools"]')) el.classList.add('bcc-orig-hidden');
    for (const h1 of document.querySelectorAll('h1[data-i18n^="tools:"][data-i18n$=".name"]')) {
      if (h1.closest('[data-bcchub]')) continue;
      h1.classList.add('bcc-orig-hidden');
      const next = h1.nextElementSibling;
      if (next?.tagName === 'P') next.classList.add('bcc-orig-hidden');
    }
    const toolUploader = document.getElementById('tool-uploader');
    if (toolUploader) {
      const h1 = [...toolUploader.children].find((el) => el.tagName === 'H1');
      if (h1) {
        h1.classList.add('bcc-orig-hidden');
        const next = h1.nextElementSibling;
        if (next?.tagName === 'P') next.classList.add('bcc-orig-hidden');
      }
    }
  }

  const lastScript = [...document.body.children].find((el) => el.tagName === 'SCRIPT');
  if (lastScript) lastScript.insertAdjacentHTML('beforebegin', FOOTER_HTML);
  else document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);

  // Link về Hub (/, /?search=1, /c/..., /t/...) phải giữ nguyên: rewriteLinks() của BentoPDF
  // tự chèn tiền tố /pdf/vi/ vào mọi href bắt đầu bằng "/" -> 404 trên Vercel.
  // shell.js dựa vào data-bcc-href để khôi phục href gốc.
  for (const a of document.querySelectorAll('[data-bcchub] a[href^="/"], a[data-bcchub][href^="/"]')) {
    const href = a.getAttribute('href');
    if (href && !href.startsWith('/pdf/')) a.setAttribute('data-bcc-href', href);
  }

  document.documentElement.setAttribute('translate', 'no');
  document.documentElement.classList.add('notranslate');

  if (document.title) {
    document.title = document.title.replace(/(?:\s*[-|–—]\s*bccHub)+$/gi, '').trim() + ' — bccHub';
  }
}

let skinned = 0;
let withHead = 0;
for (const file of walkFiles(DIST)) {
  if (file.startsWith(SKIN_OUT)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('http-equiv="refresh"')) continue; // trang chuyển hướng về Hub
  const dom = new JSDOM(html);
  const toolId = path.basename(file, '.html');
  skinDocument(dom.window.document, locations.has(toolId) ? toolId : null);
  if (locations.has(toolId)) withHead++;
  fs.writeFileSync(file, `<!DOCTYPE html>\n${dom.window.document.documentElement.outerHTML}`);
  dom.window.close();
  skinned++;
}

console.log(`✔ Đã áp giao diện bccHub cho ${skinned} trang PDF (${withHead} trang có tiêu đề công cụ), skin v${version}.`);
