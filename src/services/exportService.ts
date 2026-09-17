import JSZip from 'jszip';
import type { GeneratedPdfResult } from './pdfService';

/**
 * Packs multiple split PDFs into a single ZIP file maintaining subfolder structure
 */
export async function downloadAsZip(
  files: GeneratedPdfResult[],
  zipFilename: string = 'BentoPDF_Splitted.zip',
  onProgress?: (percent: number, message: string) => void
): Promise<void> {
  const zip = new JSZip();

  for (const item of files) {
    // JSZip automatically creates subdirectories if path contains slashes (e.g. "Folder/Sub/File.pdf")
    zip.file(item.path, item.bytes);
  }

  if (onProgress) {
    onProgress(10, 'Đang nén các tệp tin vào file ZIP...');
  }

  const blob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        onProgress(Math.floor(metadata.percent), `Đang đóng gói file ZIP (${Math.floor(metadata.percent)}%)...`);
      }
    }
  );

  // Trigger download in browser
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  document.body.appendChild(a);
  a.click();

  // Delay revocation so Chrome/Safari have time to start the file transfer
  setTimeout(() => {
    if (a.parentNode) {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 20000);
}

/**
 * Checks if the browser supports the native File System Access API
 */
export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Writes split PDFs directly to user chosen directory on their computer
 */
export async function saveDirectlyToDirectory(
  files: GeneratedPdfResult[],
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ success: boolean; error?: string }> {
  if (!isDirectoryPickerSupported()) {
    return {
      success: false,
      error: 'Trình duyệt của bạn không hỗ trợ File System Access API. Hãy sử dụng tính năng "Tải file .ZIP" hoặc dùng Chrome/Edge/Cốc Cốc.',
    };
  }

  try {
    // Prompt user to select target folder on local machine
    const rootHandle = await (window as any).showDirectoryPicker({
      id: 'bentopdf-split-export',
      mode: 'readwrite',
      startIn: 'documents',
    });

    const total = files.length;

    for (let i = 0; i < total; i++) {
      const item = files[i];
      if (onProgress) {
        onProgress(i + 1, total, `Đang ghi vào ổ đĩa: ${item.path}...`);
      }

      const segments = item.path.split('/').filter(Boolean);
      const fileName = segments.pop()!;

      // Traverse or create nested subdirectories
      let currentDir = rootHandle;
      for (const dirName of segments) {
        currentDir = await currentDir.getDirectoryHandle(dirName, { create: true });
      }

      // Create and write to file
      const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(item.bytes);
      await writable.close();
    }

    return { success: true };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Người dùng đã hủy chọn thư mục lưu trữ.' };
    }
    return { success: false, error: err.message || 'Lỗi khi ghi tệp vào thư mục' };
  }
}
