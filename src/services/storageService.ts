import type { SplitRule, PDFMetadata } from '../types/pdf';

const DB_NAME = 'bccpdf_db';
const DB_VERSION = 3;
const RECENT_STORE = 'recent_files';
const STATE_STORE = 'app_state';

export interface SavedWorkspaceSession {
  id: string; // File name used as unique ID
  pdfMeta: {
    name: string;
    size: number;
    pageCount: number;
    arrayBuffer: ArrayBuffer;
  };
  rules: SplitRule[];
  activeRuleId: string | null;
  pageRotations: Record<number, number>;
  selectedPages: number[];
  windowScrollY?: number;
  gridScrollTop?: number;
  lastUpdated: number;
}

export interface RecentFileSummary {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  ruleCount: number;
  lastUpdated: number;
}

/**
 * Opens or initializes the BCCPDF IndexedDB database with schema migration support
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = (event.target as IDBOpenDBRequest).transaction;

      if (!db.objectStoreNames.contains(RECENT_STORE)) {
        db.createObjectStore(RECENT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: 'key' });
      }

      // Migrate from legacy v1 store 'workspace_session' if it exists
      if (db.objectStoreNames.contains('workspace_session') && transaction) {
        try {
          const oldStore = transaction.objectStore('workspace_session');
          const getAllReq = oldStore.getAll();
          getAllReq.onsuccess = () => {
            const items = getAllReq.result || [];
            const recentStore = transaction.objectStore(RECENT_STORE);
            for (const item of items) {
              if (item && item.pdfMeta && item.pdfMeta.name) {
                recentStore.put({
                  id: item.pdfMeta.name,
                  ...item,
                });
              }
            }
          };
        } catch {
          // Non-critical migration
        }
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      // If version mismatch (e.g. a higher version already exists)
      if (request.error?.name === 'VersionError') {
        const fallbackReq = indexedDB.open(DB_NAME);
        fallbackReq.onsuccess = () => resolve(fallbackReq.result);
        fallbackReq.onerror = () => reject(request.error);
        return;
      }
      reject(request.error);
    };
  });
}

/**
 * Saves current active file session to IndexedDB (both in recent_files and active pointer)
 */
export async function saveSessionToDb(
  pdfMeta: PDFMetadata,
  rules: SplitRule[],
  activeRuleId: string | null,
  pageRotations: Record<number, number>,
  selectedPages: number[],
  windowScrollY: number = 0,
  gridScrollTop: number = 0
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RECENT_STORE, STATE_STORE], 'readwrite');
      const recentStore = transaction.objectStore(RECENT_STORE);
      const stateStore = transaction.objectStore(STATE_STORE);

      // Attempt to clone current arrayBuffer safely
      let bufferToSave: ArrayBuffer | null = null;
      if (pdfMeta.arrayBuffer && pdfMeta.arrayBuffer.byteLength > 0) {
        try {
          bufferToSave = pdfMeta.arrayBuffer.slice(0);
        } catch {
          bufferToSave = null;
        }
      }

      // Check existing record in case the current in-memory buffer was detached by a worker
      const existingReq = recentStore.get(pdfMeta.name);
      existingReq.onsuccess = () => {
        const existingData = existingReq.result as SavedWorkspaceSession | undefined;
        const finalBuffer = bufferToSave || existingData?.pdfMeta?.arrayBuffer;

        if (!finalBuffer) {
          console.warn('No valid arrayBuffer available to save for', pdfMeta.name);
          resolve();
          return;
        }

        const sessionData: SavedWorkspaceSession = {
          id: pdfMeta.name,
          pdfMeta: {
            name: pdfMeta.name,
            size: pdfMeta.size,
            pageCount: pdfMeta.pageCount,
            arrayBuffer: finalBuffer,
          },
          rules,
          activeRuleId,
          pageRotations,
          selectedPages,
          windowScrollY,
          gridScrollTop,
          lastUpdated: Date.now(),
        };

        recentStore.put(sessionData);
        stateStore.put({ key: 'active_file_id', value: pdfMeta.name });
      };

      existingReq.onerror = () => {
        if (bufferToSave) {
          const sessionData: SavedWorkspaceSession = {
            id: pdfMeta.name,
            pdfMeta: {
              name: pdfMeta.name,
              size: pdfMeta.size,
              pageCount: pdfMeta.pageCount,
              arrayBuffer: bufferToSave,
            },
            rules,
            activeRuleId,
            pageRotations,
            selectedPages,
            windowScrollY,
            gridScrollTop,
            lastUpdated: Date.now(),
          };
          recentStore.put(sessionData);
          stateStore.put({ key: 'active_file_id', value: pdfMeta.name });
        }
      };

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        console.warn('Failed to save session to IndexedDB', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (err) {
    console.warn('Could not save workspace session to IndexedDB:', err);
  }
}

/**
 * Loads the active workspace session (when user is currently editing a file and presses F5)
 */
export async function loadSessionFromDb(): Promise<SavedWorkspaceSession | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([RECENT_STORE, STATE_STORE], 'readonly');
      const stateStore = transaction.objectStore(STATE_STORE);
      const activeReq = stateStore.get('active_file_id');

      activeReq.onsuccess = () => {
        const activeFileId = activeReq.result?.value;
        if (!activeFileId) {
          db.close();
          resolve(null);
          return;
        }

        const recentStore = transaction.objectStore(RECENT_STORE);
        const fileReq = recentStore.get(activeFileId);

        fileReq.onsuccess = () => {
          const result = fileReq.result as SavedWorkspaceSession | undefined;
          if (result && result.pdfMeta && result.pdfMeta.arrayBuffer) {
            resolve(result);
          } else {
            resolve(null);
          }
        };

        fileReq.onerror = () => resolve(null);
      };

      activeReq.onerror = () => resolve(null);
      transaction.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('Could not read session from IndexedDB:', err);
    return null;
  }
}

/**
 * Closes the active session pointer (when user clicks "Đóng file"),
 * but KEEPS the file and its rules preserved in recent_files!
 */
export async function closeActiveSessionInDb(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([STATE_STORE], 'readwrite');
      const stateStore = transaction.objectStore(STATE_STORE);
      stateStore.put({ key: 'active_file_id', value: null });

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Could not close active session in IndexedDB:', err);
  }
}

/**
 * Gets the list of recently uploaded files (summaries) for the Home screen
 */
export async function getRecentFilesList(): Promise<RecentFileSummary[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([RECENT_STORE], 'readonly');
      const store = transaction.objectStore(RECENT_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const list = (request.result as SavedWorkspaceSession[] || []).map((item) => ({
          id: item.id,
          name: item.pdfMeta.name,
          size: item.pdfMeta.size,
          pageCount: item.pdfMeta.pageCount,
          ruleCount: (item.rules || []).length,
          lastUpdated: item.lastUpdated || Date.now(),
        }));

        // Sort descending by last updated timestamp
        list.sort((a, b) => b.lastUpdated - a.lastUpdated);
        resolve(list);
      };

      request.onerror = () => {
        console.warn('Failed to load recent files list', request.error);
        resolve([]);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('Could not fetch recent files list:', err);
    return [];
  }
}

/**
 * Loads a specific recent file session from IndexedDB by ID/Name
 */
export async function loadRecentFileSession(fileId: string): Promise<SavedWorkspaceSession | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([RECENT_STORE, STATE_STORE], 'readwrite');
      const recentStore = transaction.objectStore(RECENT_STORE);
      const stateStore = transaction.objectStore(STATE_STORE);

      const request = recentStore.get(fileId);

      request.onsuccess = () => {
        const result = request.result as SavedWorkspaceSession | undefined;
        if (result && result.pdfMeta && result.pdfMeta.arrayBuffer) {
          // Set as currently active file
          stateStore.put({ key: 'active_file_id', value: fileId });
          resolve(result);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
      transaction.oncomplete = () => db.close();
    });
  } catch (err) {
    console.warn('Could not load recent file session:', err);
    return null;
  }
}

/**
 * Deletes a specific file from recent files history
 */
export async function deleteRecentFileFromDb(fileId: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([RECENT_STORE, STATE_STORE], 'readwrite');
      const recentStore = transaction.objectStore(RECENT_STORE);
      const stateStore = transaction.objectStore(STATE_STORE);

      recentStore.delete(fileId);

      // If this was the active file, clear the active pointer
      const activeReq = stateStore.get('active_file_id');
      activeReq.onsuccess = () => {
        if (activeReq.result?.value === fileId) {
          stateStore.put({ key: 'active_file_id', value: null });
        }
      };

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Could not delete recent file from IndexedDB:', err);
  }
}

/**
 * Clears all recent files history and active session
 */
export async function clearAllRecentFilesFromDb(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([RECENT_STORE, STATE_STORE], 'readwrite');
      transaction.objectStore(RECENT_STORE).clear();
      transaction.objectStore(STATE_STORE).clear();

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Could not clear all recent files from IndexedDB:', err);
  }
}

// Backwards-compatible alias
export const clearSessionFromDb = closeActiveSessionInDb;
