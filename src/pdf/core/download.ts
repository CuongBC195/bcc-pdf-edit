import JSZip from 'jszip';
import type { OutputFile } from './ops';

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'zip':
      return 'application/zip';
    case 'csv':
      return 'text/csv;charset=utf-8';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

export function downloadOutput(file: OutputFile) {
  triggerDownload(new Blob([file.bytes as BlobPart], { type: mimeFor(file.name) }), file.name);
}

export async function buildZip(files: OutputFile[], onProgress?: (percent: number) => void): Promise<Blob> {
  const zip = new JSZip();
  const used = new Map<string, number>();
  for (const f of files) {
    // Tránh trùng tên trong ZIP
    let name = f.name;
    const n = used.get(name) ?? 0;
    if (n) name = name.replace(/(\.[^.]+)?$/, (ext) => ` (${n + 1})${ext}`);
    used.set(f.name, n + 1);
    zip.file(name, f.bytes);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) =>
    onProgress?.(Math.round(m.percent))
  );
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '') || 'tai-lieu';
}

export function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

