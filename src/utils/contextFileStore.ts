/**
 * Kho lưu trữ tạm tệp đang được người dùng trỏ tới (từ Windows Explorer khi bấm Alt+Space,
 * hoặc từ Clipboard Ctrl+V / Kéo-thả vào Raycast Launcher) để tự động nạp thẳng vào công cụ.
 */

let pendingContextFile: File | null = null;
const listeners = new Set<(file: File | null) => void>();

export function setPendingContextFile(file: File | null): void {
  pendingContextFile = file;
  for (const listener of listeners) {
    listener(pendingContextFile);
  }
}

export function getPendingContextFile(): File | null {
  return pendingContextFile;
}

export function consumePendingContextFile(expectedExtPattern?: RegExp): File | null {
  if (!pendingContextFile) return null;
  if (expectedExtPattern && !expectedExtPattern.test(pendingContextFile.name.toLowerCase())) {
    return null;
  }
  const f = pendingContextFile;
  pendingContextFile = null;
  for (const listener of listeners) {
    listener(null);
  }
  return f;
}

export function subscribePendingContextFile(listener: (file: File | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
