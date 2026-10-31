/**
 * qpdf (Apache-2.0) biên dịch sang WebAssembly — dùng cho mã hóa/giải mã, tối ưu web (linearize),
 * sửa tệp lỗi, làm phẳng chú thích và nén cấu trúc.
 */
import createModule from '@neslinesli93/qpdf-wasm';

export interface QpdfResult {
  output: Uint8Array;
  /** 0 = ổn, 3 = thành công nhưng có cảnh báo */
  exitCode: number;
  log: string;
}

type QpdfModule = {
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array; unlink(path: string): void };
  callMain(args: string[]): number;
};

let wasmUrlPromise: Promise<string> | null = null;
let locate: (() => Promise<string>) | null = null;

/** Cho phép môi trường test (Node) chỉ đường tới qpdf.wasm */
export function setQpdfWasmLocator(fn: () => Promise<string>) {
  locate = fn;
  wasmUrlPromise = null;
}

function wasmUrl(): Promise<string> {
  if (!wasmUrlPromise) {
    wasmUrlPromise = locate
      ? locate()
      : import('@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url').then((m) => m.default as string);
  }
  return wasmUrlPromise;
}

/**
 * Chạy qpdf với tệp vào /in.pdf, tệp ra /out.pdf.
 * `args` là tham số nằm giữa (ví dụ ['--decrypt', '--password=123']).
 */
export async function runQpdf(input: Uint8Array | ArrayBuffer, args: string[], extraInputs: Record<string, Uint8Array> = {}): Promise<QpdfResult> {
  const url = await wasmUrl();
  const logs: string[] = [];
  // Bản build qpdf này ghi thẳng ra console (giữ tham chiếu lúc khởi tạo) -> bắt console trong suốt quá trình chạy
  const original = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...a: unknown[]) => logs.push(a.map(String).join(' '));
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  let exitCode = 0;
  let mod: QpdfModule;
  try {
    mod = (await (createModule as unknown as (o: object) => Promise<QpdfModule>)({
      locateFile: () => url,
      noInitialRun: true,
    })) as QpdfModule;
    mod.FS.writeFile('/in.pdf', input instanceof Uint8Array ? input : new Uint8Array(input));
    for (const [name, data] of Object.entries(extraInputs)) mod.FS.writeFile(name, data);
    try {
      exitCode = mod.callMain(['/in.pdf', ...args, '/out.pdf']);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (typeof status === 'number') exitCode = status;
      else throw err;
    }
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
  const log = logs.join('\n');
  if (exitCode !== 0 && exitCode !== 3) {
    throw new QpdfError(log, exitCode);
  }
  return { output: mod.FS.readFile('/out.pdf'), exitCode, log };
}

export class QpdfError extends Error {
  log: string;
  exitCode: number;
  constructor(log: string, exitCode: number) {
    super(qpdfMessage(log));
    this.log = log;
    this.exitCode = exitCode;
  }
}

/** Diễn giải lỗi qpdf sang tiếng Việt */
export function qpdfMessage(log: string): string {
  if (/invalid password/i.test(log)) return 'Mật khẩu không đúng.';
  if (/not a PDF file|can't find PDF header/i.test(log)) return 'Tệp không phải PDF hợp lệ.';
  if (/unable to find trailer|file is damaged/i.test(log)) return 'Tệp bị hỏng nặng, không khôi phục được cấu trúc.';
  const first = log.split('\n').find((l) => l.trim()) ?? 'Lỗi không xác định';
  return `Không xử lý được tệp: ${first}`;
}

/**
 * Ghi lại tệp chỉ gồm các đối tượng còn được tham chiếu (pdf-lib giữ cả đối tượng mồ côi khi lưu).
 * Dùng sau khi xóa dữ liệu nhạy cảm để dữ liệu cũ thực sự biến mất khỏi tệp.
 */
export async function compactPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const { output } = await runQpdf(bytes, ['--object-streams=generate', '--compress-streams=y', '--recompress-flate']);
  return output;
}
