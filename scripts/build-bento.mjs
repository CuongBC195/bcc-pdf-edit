#!/usr/bin/env node
/**
 * Build bộ công cụ PDF (vendor/bentopdf) dưới thương hiệu riêng bccHub (/pdf/).
 */
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENTO = path.join(ROOT, 'vendor/bentopdf');
const DIST = path.join(BENTO, 'dist');
const STAMP = path.join(DIST, '.bcc-build-stamp');

const force = process.argv.includes('--force');

// Tự động tải mã nguồn nhân PDF nếu chạy trên môi trường CI/Vercel mới clone
const wasClonedFresh = !fs.existsSync(path.join(BENTO, 'package.json'));
if (wasClonedFresh) {
  console.log('▶ Đang tải nhân PDF cho bccHub (vendor/bentopdf)...');
  fs.mkdirSync(BENTO, { recursive: true });
  // Trên Vercel/CI, build cache có thể khôi phục sẵn thư mục vendor/bentopdf/node_modules
  // khiến `git clone` báo lỗi exit code 128 ("destination path already exists and is not an empty directory").
  // Dùng git init + fetch + checkout trực tiếp để tương thích cả khi thư mục đã có cache.
  const gitDir = path.join(BENTO, '.git');
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }
  execSync('git init -q', { cwd: BENTO, stdio: 'inherit' });
  execSync('git remote add origin https://github.com/alam00000/bentopdf.git', {
    cwd: BENTO,
    stdio: 'inherit',
  });
  execSync('git fetch --depth 1 origin main', { cwd: BENTO, stdio: 'inherit' });
  execSync('git checkout -f FETCH_HEAD', { cwd: BENTO, stdio: 'inherit' });
}

// Đảm bảo bản vá ONLY_LANG trong generate-i18n-pages.mjs và SKIP_COMPRESSION trong vite.config.ts
const i18nScriptPath = path.join(BENTO, 'scripts/generate-i18n-pages.mjs');
if (fs.existsSync(i18nScriptPath)) {
  const i18nSrc = fs.readFileSync(i18nScriptPath, 'utf8');
  if (!i18nSrc.includes('process.env.ONLY_LANG')) {
    const patched = i18nSrc.replace(
      'const languages = fs.readdirSync(LOCALES_DIR).filter((file) => {',
      `const onlyLangs = process.env.ONLY_LANG\n  ? new Set(['en', ...process.env.ONLY_LANG.split(',').map((s) => s.trim())])\n  : null;\n\nconst languages = fs.readdirSync(LOCALES_DIR).filter((file) => {\n  if (onlyLangs && !onlyLangs.has(file)) return false;`
    );
    fs.writeFileSync(i18nScriptPath, patched);
  }
}

const bentoViteConfigPath = path.join(BENTO, 'vite.config.ts');
if (fs.existsSync(bentoViteConfigPath)) {
  const viteSrc = fs.readFileSync(bentoViteConfigPath, 'utf8');
  if (!viteSrc.includes('SKIP_COMPRESSION')) {
    const patched = viteSrc.replace(
      /viteCompression\(\{[\s\S]*?deleteOriginFile:\s*false,\s*\}\),\s*viteCompression\(\{[\s\S]*?deleteOriginFile:\s*false,\s*\}\),/,
      (match) => `...(process.env.SKIP_COMPRESSION === 'true' ? [] : [\n${match}\n]),`
    );
    fs.writeFileSync(bentoViteConfigPath, patched);
  }
}

const bentoPkg = JSON.parse(fs.readFileSync(path.join(BENTO, 'package.json'), 'utf8'));
const stampValue = crypto
  .createHash('sha256')
  .update(bentoPkg.version)
  .update(fs.readFileSync(fileURLToPath(import.meta.url)))
  .digest('hex');

if (!force && fs.existsSync(STAMP) && fs.readFileSync(STAMP, 'utf8') === stampValue) {
  console.log(`✔ Nhân PDF bccHub (${bentoPkg.version}) đã được build sẵn.`);
  process.exit(0);
}

const env = {
  ...process.env,
  BASE_URL: '/pdf/',
  VITE_DEFAULT_LANGUAGE: 'vi',
  SIMPLE_MODE: 'true',
  DISABLE_GITHUB_STARS: 'true',
  VITE_BRAND_NAME: 'bccHub',
  VITE_FOOTER_TEXT: '© 2026 bccHub — Cổng tiện ích văn phòng & xử lý tài liệu 100% Client-Side.',
  SKIP_COMPRESSION: 'true',
  ONLY_LANG: 'vi',
  SITE_URL: process.env.SITE_URL || '',
  NODE_OPTIONS: '--max-old-space-size=4096',
};

const run = (cmd) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd: BENTO, env, stdio: 'inherit' });
};

if (!fs.existsSync(path.join(BENTO, 'node_modules'))) {
  run('npm ci --ignore-scripts --no-audit --no-fund');
} else if (wasClonedFresh) {
  run('npm install --ignore-scripts --no-audit --no-fund --prefer-offline');
}

run('node scripts/generate-blog.mjs');
run('node scripts/generate-static-tool-links.mjs');
run('npx vite build');
run('node scripts/generate-i18n-pages.mjs');

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

// 1. Dọn dẹp các ngôn ngữ không cần thiết trong dist/locales & đổi thương hiệu sang bccHub
const localesDist = path.join(DIST, 'locales');
if (fs.existsSync(localesDist)) {
  for (const lang of fs.readdirSync(localesDist)) {
    if (lang !== 'vi' && lang !== 'en') {
      fs.rmSync(path.join(localesDist, lang), { recursive: true, force: true });
      continue;
    }
    for (const f of walk(path.join(localesDist, lang))) {
      if (f.endsWith('.json')) {
        const content = fs
          .readFileSync(f, 'utf8')
          .replace(/BentoPDF/g, 'bccHub')
          .replace(/Bento PDF/g, 'bccHub');
        fs.writeFileSync(f, content);
      }
    }
  }
}

// 2. Đổi nhận diện chữ trên trang HTML sang bccHub.
//    Header/footer/tiêu đề công cụ theo design system bccHub do scripts/skin-pdf-tools.mjs áp sau bước này.
let injected = 0;
for (const file of walk(DIST)) {
  if (!file.endsWith('.html')) continue;
  const html = fs
    .readFileSync(file, 'utf8')
    .replace(/href="\/pdf\/(vi\/?)?"/g, 'href="/"')
    .replace(/href="\/pdf\/vi\/index(\.html)?"/g, 'href="/"')
    .replace(/BentoPDF/g, 'bccHub')
    .replace(/Bento PDF/g, 'bccHub');
  fs.writeFileSync(file, html);
  injected++;
}

// 3. Chuyển hướng trang gốc /pdf/ về thẳng trang chủ bccHub "/"
const REDIRECT_HTML = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/"><title>bccHub</title></head><body><a href="/">Quay về bccHub</a></body></html>`;
for (const rel of ['index.html', 'tools.html', 'vi/index.html', 'vi/tools.html']) {
  const p = path.join(DIST, rel);
  if (fs.existsSync(p)) fs.writeFileSync(p, REDIRECT_HTML);
}

fs.writeFileSync(STAMP, stampValue);
console.log(`\n✔ Đã build xong ${injected} trang công cụ PDF dưới thương hiệu bccHub.`);
