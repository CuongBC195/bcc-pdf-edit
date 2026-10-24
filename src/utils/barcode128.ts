/**
 * Mã vạch Code 128 (ISO/IEC 15417), tự chọn bộ mã B (chữ & số) hoặc C (chuỗi số chẵn, nén gấp đôi).
 * Xuất ra dãy độ rộng vạch/khoảng trắng để vẽ SVG/Canvas.
 */

// Độ rộng 6 phần tử (vạch-trắng-vạch-trắng-vạch-trắng) của giá trị 0..105, 106 = STOP (7 phần tử)
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

/** Chỉ hỗ trợ ký tự ASCII in được (32–126). */
export function isCode128Encodable(text: string): boolean {
  return text.length > 0 && /^[\x20-\x7e]+$/.test(text);
}

function encodeValues(text: string): number[] {
  const values: number[] = [];
  let i = 0;
  let mode: 'B' | 'C' | null = null;

  const digitRun = (from: number) => {
    let n = 0;
    while (from + n < text.length && text[from + n] >= '0' && text[from + n] <= '9') n++;
    return n;
  };

  while (i < text.length) {
    const run = digitRun(i);
    // Dùng bộ C cho chuỗi số dài (≥4, hoặc toàn bộ chuỗi là số chẵn) để mã vạch ngắn hơn
    const useC = run >= 4 || (run >= 2 && run === text.length - i && run % 2 === 0);
    if (useC) {
      if (mode !== 'C') {
        values.push(mode === null ? START_C : CODE_C);
        mode = 'C';
      }
      const pairs = Math.floor(run / 2);
      for (let p = 0; p < pairs; p++) {
        values.push(Number(text.slice(i, i + 2)));
        i += 2;
      }
      continue;
    }
    if (mode !== 'B') {
      values.push(mode === null ? START_B : CODE_B);
      mode = 'B';
    }
    values.push(text.charCodeAt(i) - 32);
    i++;
  }

  let checksum = values[0];
  for (let k = 1; k < values.length; k++) checksum += values[k] * k;
  values.push(checksum % 103, STOP);
  return values;
}

/** Trả về dãy độ rộng module, phần tử chẵn là vạch đen, lẻ là khoảng trắng. */
export function encodeCode128(text: string): number[] {
  if (!isCode128Encodable(text)) {
    throw new Error('Code 128 chỉ hỗ trợ chữ không dấu, số và ký hiệu ASCII');
  }
  const widths: number[] = [];
  for (const v of encodeValues(text)) {
    for (const ch of PATTERNS[v]) widths.push(Number(ch));
  }
  return widths;
}

export interface BarcodeRenderOptions {
  moduleWidth?: number;
  height?: number;
  quietZone?: number;
  showText?: boolean;
  color?: string;
  background?: string;
}

export function renderCode128Svg(text: string, opts: BarcodeRenderOptions = {}): string {
  const { moduleWidth = 2, height = 90, quietZone = 10, showText = true, color = '#000000', background = '#ffffff' } = opts;
  const widths = encodeCode128(text);
  const totalModules = widths.reduce((a, b) => a + b, 0) + quietZone * 2;
  const textH = showText ? 22 : 0;
  const w = totalModules * moduleWidth;
  const h = height + textH + 8;

  const rects: string[] = [];
  let x = quietZone;
  widths.forEach((wd, idx) => {
    if (idx % 2 === 0) rects.push(`<rect x="${x * moduleWidth}" y="4" width="${wd * moduleWidth}" height="${height}"/>`);
    x += wd;
  });

  const safeText = text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="${background}"/>`,
    `<g fill="${color}">${rects.join('')}</g>`,
    showText
      ? `<text x="${w / 2}" y="${height + 22}" text-anchor="middle" font-family="monospace" font-size="16" fill="${color}">${safeText}</text>`
      : '',
    '</svg>',
  ].join('');
}
