#!/usr/bin/env node
/**
 * Đồng bộ danh sách 118 công cụ PDF từ nhân xử lý sang catalog của bccHub.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENTO = path.join(ROOT, 'vendor/bentopdf');
const OUT = path.join(ROOT, 'src/catalog/bentoTools.generated.json');

const read = (p) => fs.readFileSync(path.join(BENTO, p), 'utf8');

const toolsSrc = read('src/js/config/tools.ts');
const start = toolsSrc.indexOf('const baseCategories = [');
const end = toolsSrc.indexOf('];', toolsSrc.indexOf('const getToolIdFromHref') - 10);
if (start < 0 || end < 0) throw new Error('Không tìm thấy baseCategories trong tools.ts');
const arrayLiteral = toolsSrc
  .slice(start + 'const baseCategories = '.length, end + 1)
  .replace(/import\.meta\.env\.BASE_URL\s*\+\s*/g, '');
const baseCategories = new Function(`return ${arrayLiteral};`)();

const mainSrc = read('src/js/main.ts');
const keyBlock = mainSrc.slice(
  mainSrc.indexOf('const toolTranslationKeys'),
  mainSrc.indexOf('};', mainSrc.indexOf('const toolTranslationKeys'))
);
const nameToKey = {};
for (const m of keyBlock.matchAll(/'([^']+)':\s*'tools:(\w+)'/g)) nameToKey[m[1]] = m[2];

const vi = JSON.parse(read('public/locales/vi/tools.json'));

const tools = new Map();
for (const cat of baseCategories) {
  for (const t of cat.tools) {
    const id = t.href.replace(/\.html$/, '');
    const camelId = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    const key = nameToKey[t.name] ?? (vi[camelId] ? camelId : undefined);
    const tr = key ? vi[key] : undefined;
    const existing = tools.get(id);
    if (existing) {
      existing.upstreamCategories.push(cat.name);
      continue;
    }
    tools.set(id, {
      id,
      href: t.href,
      i18nKey: key ?? null,
      name: (tr?.name ?? t.name).replace(/BentoPDF/gi, 'bccHub'),
      nameEn: t.name.replace(/BentoPDF/gi, 'bccHub'),
      description: (tr?.subtitle ?? t.subtitle).replace(/BentoPDF/gi, 'bccHub'),
      icon: t.icon,
      upstreamCategories: [cat.name],
    });
  }
}

const list = [...tools.values()];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(list, null, 2) + '\n');
console.log(`✔ Đã đồng bộ ${list.length} công cụ PDF vào ${path.relative(ROOT, OUT)}`);
