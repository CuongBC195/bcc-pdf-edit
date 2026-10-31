#!/usr/bin/env node
/**
 * Cập nhật vercel.json: chuyển hướng trang công cụ cũ (/pdf/vi/<id>.html) sang bản tự xây (/t/<id>).
 * Chạy sau khi thêm công cụ vào src/pdf/registry.ts: node scripts/sync-pdf-redirects.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = fs.readFileSync(path.join(ROOT, 'src/pdf/registry.ts'), 'utf8');
const toolsBlock = registry.slice(registry.indexOf('PDF_TOOLS'), registry.indexOf('PDF_TOOL_IDS'));
const ids = [...toolsBlock.matchAll(/pdf\('([a-z0-9-]+)'/g)].map((m) => m[1]);
if (!ids.length) throw new Error('Không đọc được danh sách công cụ trong registry.ts');

const vercelPath = path.join(ROOT, 'vercel.json');
const config = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
const MARK = '/pdf/:lang(vi|en)?/:id(';
const pattern = `${MARK}${ids.join('|')})\\.html`;
config.redirects = (config.redirects ?? []).filter((r) => !String(r.source).startsWith('/pdf/:lang('));
config.redirects.push({ source: pattern, destination: '/t/:id', permanent: false });
fs.writeFileSync(vercelPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`✔ vercel.json: chuyển hướng ${ids.length} công cụ cũ sang /t/<id>.`);

