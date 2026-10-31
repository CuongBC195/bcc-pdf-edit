/**
 * Lưu tệp đầu vào của công cụ vào IndexedDB.
 *
 * Dùng chung CSDL `bcchub_tool_files` với pdf-skin/shell.js (trang công cụ cũ) để tệp đã mở
 * ở bản cũ vẫn được khôi phục khi chuyển sang công cụ mới, và đọc (chỉ đọc) danh sách tệp
 * của Tách PDF hàng loạt (`bccpdf_db`) cho mục "Tệp gần đây".
 */

const FILE_DB = 'bcchub_tool_files';
const SESSION_STORE = 'sessions';
const RECENT_STORE = 'recent';
const MAX_RECENT = 12;
const MAX_SESSION_FILES = 50;
export const MAX_FILE_BYTES = 300 * 1024 * 1024;
/** Khóa input mặc định, trùng với id `file-input` của trang cũ */
export const DEFAULT_SLOT = 'file-input';

interface StoredFile {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  blob: Blob;
}

interface SessionRecord {
  key: string;
  toolId: string;
  inputId: string;
  files: StoredFile[];
  updatedAt: number;
}

export interface RecentFile extends StoredFile {
  sig: string;
  usedAt: number;
  toolId?: string;
}

export function fileSignature(f: { name: string; size: number; lastModified?: number }): string {
  return [f.name, f.size, f.lastModified || 0].join('::');
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không khả dụng'));
      return;
    }
    const req = indexedDB.open(FILE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(RECENT_STORE)) db.createObjectStore(RECENT_STORE, { keyPath: 'sig' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function toStored(f: File): StoredFile {
  return { name: f.name, type: f.type || '', size: f.size, lastModified: f.lastModified || Date.now(), blob: f };
}

export function storedToFile(rec: StoredFile): File {
  return new File([rec.blob], rec.name, { type: rec.type || '', lastModified: rec.lastModified || Date.now() });
}

const sessionKey = (toolId: string, slot: string) => `${toolId}::${slot}`;

/** Ghi đè danh sách tệp của một ô nhập (slot) */
export async function saveSession(toolId: string, slot: string, files: File[]): Promise<void> {
  const valid = files.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES).slice(-MAX_SESSION_FILES);
  if (!valid.length) {
    await clearSession(toolId, slot);
    return;
  }
  const record: SessionRecord = {
    key: sessionKey(toolId, slot),
    toolId,
    inputId: slot,
    files: valid.map(toStored),
    updatedAt: Date.now(),
  };
  await withStore(SESSION_STORE, 'readwrite', (s) => {
    s.put(record);
  });
}

export async function loadSession(toolId: string, slot: string): Promise<File[]> {
  try {
    const rec = (await withStore<SessionRecord>(SESSION_STORE, 'readonly', (s) =>
      s.get(sessionKey(toolId, slot))
    )) as SessionRecord | undefined;
    return rec?.files?.map(storedToFile) ?? [];
  } catch {
    return [];
  }
}

export async function clearSession(toolId: string, slot: string): Promise<void> {
  await withStore(SESSION_STORE, 'readwrite', (s) => {
    s.delete(sessionKey(toolId, slot));
  }).catch(() => undefined);
}

export async function addRecentFiles(toolId: string, files: File[]): Promise<void> {
  const valid = files.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES);
  if (!valid.length) return;
  const now = Date.now();
  await withStore(RECENT_STORE, 'readwrite', (s) => {
    valid.forEach((f, i) => {
      const rec: RecentFile = { ...toStored(f), sig: fileSignature(f), usedAt: now + i, toolId };
      s.put(rec);
    });
    const all = s.getAll();
    all.onsuccess = () => {
      const list = (all.result as RecentFile[]).sort((a, b) => b.usedAt - a.usedAt);
      list.slice(MAX_RECENT).forEach((old) => s.delete(old.sig));
    };
  }).catch(() => undefined);
}

async function loadOwnRecents(): Promise<RecentFile[]> {
  try {
    return ((await withStore<RecentFile[]>(RECENT_STORE, 'readonly', (s) => s.getAll())) ?? []) as RecentFile[];
  } catch {
    return [];
  }
}

/** Đọc danh sách tệp của Tách PDF hàng loạt (không tạo CSDL nếu chưa có) */
function loadMultiSplitRecents(): Promise<RecentFile[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve([]);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open('bccpdf_db');
    } catch {
      return resolve([]);
    }
    req.onupgradeneeded = () => req.transaction?.abort();
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recent_files')) {
        db.close();
        resolve([]);
        return;
      }
      const getAll = db.transaction('recent_files', 'readonly').objectStore('recent_files').getAll();
      getAll.onsuccess = () => {
        db.close();
        const items = (getAll.result || []) as {
          pdfMeta?: { name: string; size?: number; arrayBuffer?: ArrayBuffer };
          lastUpdated?: number;
        }[];
        resolve(
          items
            .filter((it) => it.pdfMeta?.arrayBuffer && it.pdfMeta.name)
            .map((it) => {
              const meta = it.pdfMeta!;
              const size = meta.size || meta.arrayBuffer!.byteLength;
              return {
                name: meta.name,
                type: 'application/pdf',
                size,
                lastModified: it.lastUpdated || 0,
                usedAt: it.lastUpdated || 0,
                sig: `${meta.name}::${size}::ms`,
                blob: new Blob([meta.arrayBuffer!], { type: 'application/pdf' }),
              };
            })
        );
      };
      getAll.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

export function acceptsFile(accept: string, file: { name: string; type?: string }): boolean {
  const list = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return list.some((a) => {
    if (a.startsWith('.')) return name.endsWith(a);
    if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
}

/** Tệp gần đây (của mọi công cụ + Tách PDF hàng loạt), lọc theo định dạng nhận */
export async function loadRecentFiles(accept: string, limit = 8): Promise<RecentFile[]> {
  const [own, ms] = await Promise.all([loadOwnRecents(), loadMultiSplitRecents()]);
  const seen = new Set<string>();
  return [...own, ...ms]
    .sort((a, b) => b.usedAt - a.usedAt)
    .filter((r) => {
      const k = `${r.name}::${r.size}`;
      if (seen.has(k) || !acceptsFile(accept, r)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

