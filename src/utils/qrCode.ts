/**
 * Bộ tạo mã QR chuẩn ISO/IEC 18004 (Byte Mode UTF-8, Phiên bản 1–25, mức sửa lỗi L/M/Q/H).
 * Thuần TypeScript, không phụ thuộc thư viện ngoài, hỗ trợ đầy đủ tiếng Việt UTF-8.
 */

export type QrEccLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  version: number;
  size: number;
  modules: boolean[][];
}

const ECC_FORMAT_BITS: Record<QrEccLevel, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

// Số byte sửa lỗi (Reed-Solomon EC codewords) trên mỗi khối cho Version 1..25
const EC_CODEWORDS_PER_BLOCK: Record<QrEccLevel, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30],
};

// Tổng số khối sửa lỗi (EC blocks) cho Version 1..25
const NUM_EC_BLOCKS: Record<QrEccLevel, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35],
};

const MIN_VERSION = 1;
const MAX_VERSION = 25;

function getBit(val: number, bitIndex: number): boolean {
  return ((val >>> bitIndex) & 1) !== 0;
}

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number, ecl: QrEccLevel): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    EC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_EC_BLOCKS[ecl][ver]
  );
}

function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomonComputeDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[divisor.length - 1] = 0;
    divisor.forEach((v, i) => {
      result[i] ^= reedSolomonMultiply(v, factor);
    });
  }
  return result;
}

function addEccAndInterleave(data: Uint8Array, ver: number, ecl: QrEccLevel): Uint8Array {
  const numBlocks = NUM_EC_BLOCKS[ecl][ver];
  const blockEccLen = EC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: Uint8Array[] = [];
  const rsDiv = reedSolomonComputeDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.subarray(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = reedSolomonComputeRemainder(dat, rsDiv);
    const block = new Uint8Array(shortBlockLen + 1);
    block.set(dat, 0);
    block.set(ecc, shortBlockLen + 1 - blockEccLen);
    blocks.push(block);
  }

  const result = new Uint8Array(rawCodewords);
  for (let i = 0, k = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result[k] = block[i];
        k++;
      }
    });
  }
  return result;
}

function getAlignmentPatternPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step =
    ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result: number[] = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function createMatrix(ver: number, ecl: QrEccLevel, allCodewords: Uint8Array): boolean[][] {
  const size = ver * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );

  const setFunctionModule = (x: number, y: number, isDark: boolean) => {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  };

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Finder patterns (3 góc)
  const drawFinderPattern = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = cx + dx;
        const yy = cy + dy;
        if (0 <= xx && xx < size && 0 <= yy && yy < size) {
          setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };
  drawFinderPattern(3, 3);
  drawFinderPattern(size - 4, 3);
  drawFinderPattern(3, size - 4);

  // Alignment patterns
  const alignPos = getAlignmentPatternPositions(ver);
  const numAlign = alignPos.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      if (
        !((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0))
      ) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setFunctionModule(
              alignPos[i] + dx,
              alignPos[j] + dy,
              Math.max(Math.abs(dx), Math.abs(dy)) !== 1
            );
          }
        }
      }
    }
  }

  // Reserve format bits
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunctionModule(8, i, false);
      setFunctionModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunctionModule(size - 1 - i, 8, false);
    setFunctionModule(8, size - 1 - i, false);
  }
  setFunctionModule(8, size - 8, true);

  // Version bits (ver >= 7)
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, bit);
      setFunctionModule(b, a, bit);
    }
  }

  // Zigzag data placement
  let bitIdx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIdx < allCodewords.length * 8) {
          modules[y][x] = getBit(allCodewords[bitIdx >>> 3], 7 - (bitIdx & 7));
          bitIdx++;
        }
      }
    }
  }

  const drawFormatBits = (mask: number) => {
    const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getBit(bits, i));
    setFunctionModule(8, 7, getBit(bits, 6));
    setFunctionModule(8, 8, getBit(bits, 7));
    setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getBit(bits, i));
    setFunctionModule(8, size - 8, true);
  };

  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let invert = false;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
        }
        if (invert) modules[y][x] = !modules[y][x];
      }
    }
  };

  // Chọn mask tối ưu (ở đây chọn mask 0..7 với điểm phạt thấp nhất theo chuẩn)
  let bestMask = 0;
  let minPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormatBits(m);
    let penalty = 0;
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      for (let x = 0; x < size; x++) {
        if (x === 0 || modules[y][x] !== runColor) {
          runColor = modules[y][x];
          runX = 1;
        } else {
          runX++;
          if (runX === 5) penalty += 3;
          else if (runX > 5) penalty += 1;
        }
      }
    }
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = m;
    }
    applyMask(m); // Hoàn tác
  }

  applyMask(bestMask);
  drawFormatBits(bestMask);
  return modules;
}

export function encodeQrMatrix(text: string, ecl: QrEccLevel = 'M'): QrMatrix {
  const utf8 = new TextEncoder().encode(text);

  let ver = MIN_VERSION;
  let dataCapacityBits = 0;
  for (; ver <= MAX_VERSION; ver++) {
    const countBits = ver < 10 ? 8 : 16;
    dataCapacityBits = getNumDataCodewords(ver, ecl) * 8;
    if (4 + countBits + utf8.length * 8 <= dataCapacityBits) break;
  }
  if (ver > MAX_VERSION) {
    throw new Error('Nội dung quá dài để tạo mã QR (tối đa khoảng 1.200 ký tự).');
  }

  const bits: number[] = [];
  const appendBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  // Byte mode indicator (0100)
  appendBits(0b0100, 4);
  appendBits(utf8.length, ver < 10 ? 8 : 16);
  for (const byte of utf8) appendBits(byte, 8);

  // Terminator
  appendBits(0, Math.min(4, dataCapacityBits - bits.length));
  appendBits(0, (8 - (bits.length % 8)) % 8);

  // Pad bytes (0xEC, 0x11)
  for (let padByte = 0xec; bits.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
    appendBits(padByte, 8);
  }

  const dataCodewords = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) {
    dataCodewords[i >>> 3] |= bits[i] << (7 - (i & 7));
  }

  const allCodewords = addEccAndInterleave(dataCodewords, ver, ecl);
  const modules = createMatrix(ver, ecl, allCodewords);

  return {
    version: ver,
    size: modules.length,
    modules,
  };
}

export interface QrRenderOptions {
  sizePx?: number;
  marginModules?: number;
  darkColor?: string;
  lightColor?: string;
  ecl?: QrEccLevel;
}

export function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: QrRenderOptions = {}
): QrMatrix {
  const {
    sizePx = 320,
    marginModules = 3,
    darkColor = '#0f172a',
    lightColor = '#ffffff',
    ecl = 'M',
  } = options;

  const matrix = encodeQrMatrix(text, ecl);
  const totalModules = matrix.size + marginModules * 2;
  const scale = sizePx / totalModules;

  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return matrix;

  ctx.fillStyle = lightColor;
  ctx.fillRect(0, 0, sizePx, sizePx);

  ctx.fillStyle = darkColor;
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        const rx = Math.floor((x + marginModules) * scale);
        const ry = Math.floor((y + marginModules) * scale);
        const rw = Math.ceil((x + marginModules + 1) * scale) - rx;
        const rh = Math.ceil((y + marginModules + 1) * scale) - ry;
        ctx.fillRect(rx, ry, rw, rh);
      }
    }
  }
  return matrix;
}

export function renderQrToSvgString(text: string, options: QrRenderOptions = {}): string {
  const {
    sizePx = 320,
    marginModules = 3,
    darkColor = '#0f172a',
    lightColor = '#ffffff',
    ecl = 'M',
  } = options;

  const matrix = encodeQrMatrix(text, ecl);
  const totalModules = matrix.size + marginModules * 2;
  const parts: string[] = [];

  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        parts.push(`M${x + marginModules},${y + marginModules}h1v1h-1z`);
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="${lightColor}"/>`,
    `<path d="${parts.join('')}" fill="${darkColor}"/>`,
    `</svg>`,
  ].join('');
}
