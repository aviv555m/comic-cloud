import { createClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types';
import localforage from 'localforage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Safe storage wrapper to prevent SecurityError in sandbox/incognito/blocked-cookie environments
const getSafeStorage = (): Storage => {
  try {
    const testKey = "__storage_test__";
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (e) {
    console.warn("localStorage is not available, using in-memory mock storage", e);
    const mockStorage: Record<string, string> = {};
    return {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { for (const key in mockStorage) delete mockStorage[key]; },
      key: (index: number) => Object.keys(mockStorage)[index] || null,
      get length() { return Object.keys(mockStorage).length; }
    } as Storage;
  }
};

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const safeLocalStorage = getSafeStorage();

const CURRENT_VERSION = "v1.0.112";
if (typeof window !== 'undefined') {
  try {
    const lastVersion = safeLocalStorage.getItem("app_version");
    if (lastVersion !== CURRENT_VERSION) {
      safeLocalStorage.setItem("app_version", CURRENT_VERSION);
      safeLocalStorage.setItem("app_outdated", "false");
    }
  } catch (e) {
    console.warn("Failed to reset outdated flag on upgrade:", e);
  }
}

// Original remote Supabase client
export const originalSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: safeLocalStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// IndexedDB configuration
const DB_NAME = 'comic-cloud-offline';
const DB_VERSION = 2;
const LOCAL_FILES_STORE = 'local-files';
const BOOKS_STORE = 'offline-books';
const FILES_STORE = 'offline-files';

let cachedDB: IDBDatabase | null = null;

export function openLocalDB(): Promise<IDBDatabase> {
  if (cachedDB) {
    return Promise.resolve(cachedDB);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      cachedDB = request.result;
      cachedDB.onversionchange = () => {
        cachedDB?.close();
        cachedDB = null;
      };
      cachedDB.onclose = () => {
        cachedDB = null;
      };
      resolve(cachedDB);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(BOOKS_STORE)) {
        db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains(LOCAL_FILES_STORE)) {
        db.createObjectStore(LOCAL_FILES_STORE, { keyPath: 'filePath' });
      }
    };
  });
}

export async function saveLocalFile(filePath: string, fileData: Blob | ArrayBuffer) {
  let data: ArrayBuffer;
  if (fileData instanceof Blob) {
    data = await fileData.arrayBuffer();
  } else {
    data = fileData;
  }

  const db = await openLocalDB();
  const transaction = db.transaction(LOCAL_FILES_STORE, 'readwrite');
  const store = transaction.objectStore(LOCAL_FILES_STORE);
  
  store.put({
    filePath,
    data,
    contentType: fileData instanceof Blob ? fileData.type : 'application/octet-stream'
  });
  
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getLocalFile(filePath: string): Promise<Blob | null> {
  try {
    const db = await openLocalDB();
    const transaction = db.transaction(LOCAL_FILES_STORE, 'readonly');
    const store = transaction.objectStore(LOCAL_FILES_STORE);
    const request = store.get(filePath);
    
    return new Promise<Blob | null>((resolve) => {
      request.onsuccess = () => {
        if (request.result) {
          resolve(new Blob([request.result.data], { type: request.result.contentType }));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error('Failed to read local file from IndexedDB:', e);
    return null;
  }
}

// Monkey-patch window.fetch to intercept local-file-route requests
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
    if (url.includes('/local-file-route/')) {
      const filePath = decodeURIComponent(url.split('/local-file-route/')[1]);
      const blob = await getLocalFile(filePath);
      if (blob) {
        return new Response(blob, {
          status: 200,
          headers: { 'Content-Type': blob.type || 'application/octet-stream' }
        });
      } else {
        return new Response('Local file not found', { status: 404 });
      }
    }
    return originalFetch.apply(this, arguments as any);
  };
}

// Local Database JSON storage
export async function getTableData(table: string): Promise<any[]> {
  try {
    const data = await localforage.getItem(`local_db_${table}`);
    return data ? (data as any[]) : [];
  } catch (e) {
    console.warn(`Failed to read local table ${table}:`, e);
    return [];
  }
}

export async function setTableData(table: string, data: any[]) {
  try {
    await localforage.setItem(`local_db_${table}`, data);
  } catch (e) {
    console.warn(`Failed to save local table ${table}:`, e);
  }
}

function getRowKey(table: string, row: any) {
  if (!row) return "";
  if (row.id) return String(row.id);
  if (table === "book_tags") return `${row.book_id || ""}:${row.tag_id || ""}`;
  if (table === "reading_list_books") return `${row.list_id || ""}:${row.book_id || ""}`;
  if (row.book_id) return String(row.book_id);
  return JSON.stringify(row);
}

async function mergeRemoteData(table: string, remoteRows: any[]) {
  if (!remoteRows || !Array.isArray(remoteRows)) return;
  const localRows = await getTableData(table);
  const localMap = new Map(localRows.map(r => [getRowKey(table, r), r]));
  
  const queue = await getSyncQueue();
  const deletedKeys = new Set(
    queue
      .filter(q => q.operation === 'delete' && q.table === table)
      .flatMap(q => Array.isArray(q.payload) ? q.payload.map((r: any) => getRowKey(table, r)) : [getRowKey(table, q.payload)])
  );

  let changed = false;
  for (const row of remoteRows) {
    const rowKey = getRowKey(table, row);
    if (!localMap.has(rowKey)) {
      if (deletedKeys.has(rowKey)) {
        continue; // Skip adding back a row we just deleted locally
      }
      localRows.push(row);
      changed = true;
    } else {
      const index = localRows.findIndex(r => getRowKey(table, r) === rowKey);
      if (index !== -1) {
        const localRow = localRows[index];
        
        // Extract timestamps for LWW (Last-Write-Wins) comparison
        const localTime = localRow.updated_at ? new Date(localRow.updated_at).getTime() : (localRow.created_at ? new Date(localRow.created_at).getTime() : 0);
        const remoteTime = row.updated_at ? new Date(row.updated_at).getTime() : (row.created_at ? new Date(row.created_at).getTime() : 0);
        
        // Only merge remote if it has a newer modification timestamp
        if (remoteTime > localTime) {
          const localStr = JSON.stringify(localRow);
          const mergedRow = { ...localRow, ...row };
          const mergedStr = JSON.stringify(mergedRow);
          if (localStr !== mergedStr) {
            localRows[index] = mergedRow;
            changed = true;
          }
        }
      }
    }
  }
  
  if (changed) {
    await setTableData(table, localRows);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('local-db-synced', { detail: { table } }));
    }
  }
}

// Process local URLs inside query results (convert local cover_url or avatar_url to base64)
async function processLocalUrls(rows: any[]) {
  if (!rows || !Array.isArray(rows)) return rows;
  const processed = [];
  for (const row of rows) {
    const newRow = { ...row };
    // Process cover_url
    if (newRow.cover_url && newRow.cover_url.includes('/local-file-route/')) {
      const match = newRow.cover_url.match(/\/local-file-route\/([^?]+)/);
      const filePath = match ? decodeURIComponent(match[1]) : null;
      if (filePath) {
        const fileBlob = await getLocalFile(filePath);
        if (fileBlob) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(fileBlob);
          });
          newRow.cover_url = base64;
        }
      }
    }
    // Process avatar_url
    if (newRow.avatar_url && newRow.avatar_url.includes('/local-file-route/')) {
      const match = newRow.avatar_url.match(/\/local-file-route\/([^?]+)/);
      const filePath = match ? decodeURIComponent(match[1]) : null;
      if (filePath) {
        const fileBlob = await getLocalFile(filePath);
        if (fileBlob) {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(fileBlob);
          });
          newRow.avatar_url = base64;
        }
      }
    }
    processed.push(newRow);
  }
  return processed;
}

// Automatically registers locally inserted book offline if its local file exists
async function handleBookInsertionOffline(book: any) {
  try {
    if (book.file_type === 'manga') {
      let coverBlob: ArrayBuffer | null = null;
      if (book.cover_url) {
        try {
          const fetchUrl = book.cover_url.startsWith('/')
            ? `${window.location.origin}${book.cover_url}`
            : book.cover_url;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          try {
            const response = await fetch(fetchUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
              coverBlob = await response.arrayBuffer();
            }
          } catch (fetchErr) {
            clearTimeout(timeoutId);
            console.warn("[Local DB] Cover pre-fetch failed for manga:", fetchErr);
          }
        } catch (coverErr) {
          console.warn("[Local DB] Failed to pre-fetch cover for manga:", coverErr);
        }
      }

      const db = await openLocalDB();
      const transaction = db.transaction([BOOKS_STORE, FILES_STORE], 'readwrite');
      
      const booksStore = transaction.objectStore(BOOKS_STORE);
      const offlineBook = {
        id: book.id,
        title: book.title,
        author: book.author,
        file_type: book.file_type,
        cover_url: book.cover_url,
        last_page_read: null,
        cachedAt: Date.now(),
        fileSize: 0,
        series: book.series || null,
        file_url: book.file_url || null,
      };
      booksStore.put(offlineBook);

      const filesStore = transaction.objectStore(FILES_STORE);
      filesStore.put({
        bookId: book.id,
        data: new ArrayBuffer(1),
        coverData: coverBlob,
        contentType: 'application/x-manga',
      });

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      console.log(`[Local DB] Successfully registered local manga series card ${book.id} offline`);
      return;
    }

    if (!book.file_url) return;
    const match = book.file_url.match(/\/local-file-route\/([^?]+)/);
    const filePath = match ? decodeURIComponent(match[1]) : null;
    if (!filePath) return;

    const fileBlob = await getLocalFile(filePath);
    if (!fileBlob) return;

    // Resolve buffers/async requests BEFORE starting transaction
    const arrayBuffer = await fileBlob.arrayBuffer();
    
    let coverBlob: ArrayBuffer | null = null;
    if (book.cover_url) {
      try {
        if (book.cover_url.includes('/local-file-route/')) {
          const coverMatch = book.cover_url.match(/\/local-file-route\/([^?]+)/);
          const coverPath = coverMatch ? decodeURIComponent(coverMatch[1]) : null;
          if (coverPath) {
            const coverFile = await getLocalFile(coverPath);
            if (coverFile) {
              coverBlob = await coverFile.arrayBuffer();
            }
          }
        } else {
          // Fetch remote cover (or proxied cover, or data URI)
          const fetchUrl = book.cover_url.startsWith('/')
            ? `${window.location.origin}${book.cover_url}`
            : book.cover_url;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          try {
            const response = await fetch(fetchUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
              coverBlob = await response.arrayBuffer();
            }
          } catch (fetchErr) {
            clearTimeout(timeoutId);
            console.warn("[Local DB] Cover pre-fetch timed out or failed:", fetchErr);
          }
        }
      } catch (coverErr) {
        console.warn("[Local DB] Failed to pre-fetch cover:", coverErr);
      }
    }

    const db = await openLocalDB();
    const transaction = db.transaction([BOOKS_STORE, FILES_STORE], 'readwrite');
    
    const booksStore = transaction.objectStore(BOOKS_STORE);
    const offlineBook = {
      id: book.id,
      title: book.title,
      author: book.author,
      file_type: book.file_type,
      cover_url: book.cover_url,
      last_page_read: null,
      cachedAt: Date.now(),
      fileSize: fileBlob.size,
      series: book.series || null,
      file_url: book.file_url || null,
    };
    booksStore.put(offlineBook);

    const filesStore = transaction.objectStore(FILES_STORE);
    filesStore.put({
      bookId: book.id,
      data: arrayBuffer,
      coverData: coverBlob,
      contentType: fileBlob.type,
    });

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    console.log(`[Local DB] Successfully registered local book ${book.id} offline`);
  } catch (e) {
    console.error('[Local DB] Failed to register local book offline:', e);
  }
}

// Clone function to pull remote Supabase data locally
let cloneInProgress = false;
let lastCloneUserId: string | null = null;
let lastCloneCompletedAt = 0;
const MIN_CLONE_INTERVAL_MS = 60_000;

export async function cloneRemoteData(userId: string, options: { force?: boolean } = {}) {
  const now = Date.now();
  if (cloneInProgress) {
    console.log('[Clone] Clone already in progress, skipping.');
    return;
  }
  if (!options.force && lastCloneUserId === userId && now - lastCloneCompletedAt < MIN_CLONE_INTERVAL_MS) {
    console.log('[Clone] Recent clone already completed, skipping.');
    return;
  }
  cloneInProgress = true;
  try {
    await _cloneRemoteData(userId);
    lastCloneUserId = userId;
    lastCloneCompletedAt = Date.now();
  } finally {
    cloneInProgress = false;
  }
}

async function _cloneRemoteData(userId: string) {
  const BACKUP_TABLES = [
    "profiles",
    "books",
    "tags",
    "book_tags",
    "annotations",
    "book_reviews",
    "reading_sessions",
    "reading_lists",
    "reading_list_books",
    "reading_challenges",
    "reading_reminders",
    "scheduled_reading",
    "journal_entries",
    "vocabulary",
    "user_reading_preferences",
  ];

  console.log("[Clone] Starting server data clone for user:", userId);

  let serverTables: Record<string, any[]> = {};
  let serverPullSucceeded = false;
  const legacyMigrationKey = `legacy_supabase_migrated_${userId}`;
  const legacyMigrationDone = safeLocalStorage.getItem(legacyMigrationKey) === 'true';
  try {
    const response = await serverJson(`/api/db/pull?userId=${encodeURIComponent(userId)}`);
    serverTables = response.tables || {};
    serverPullSucceeded = true;
  } catch (serverErr) {
    console.warn('[Clone] Local server clone failed, using legacy Supabase fallback:', serverErr);
  }

  for (const table of BACKUP_TABLES) {
    try {
      let data = serverTables[table] || [];
      const localRowsBeforeFallback = await getTableData(table);
      const shouldTryLegacyFallback = !serverPullSucceeded || (!legacyMigrationDone && localRowsBeforeFallback.length === 0 && data.length === 0);
      if (shouldTryLegacyFallback) {
        let query = originalSupabase.from(table as any).select("*");
        if (table === "profiles") {
          query = query.eq("id", userId) as any;
        } else if (table !== "book_tags" && table !== "reading_list_books") {
          query = query.eq("user_id", userId) as any;
        }
        const legacy = await query;
        if (legacy.error) {
          console.warn(`[Clone] Failed to fetch legacy table ${table}:`, legacy.error);
          continue;
        }
        data = legacy.data || [];
        if (data.length) {
          await serverJson('/api/db/push', {
            method: 'POST',
            body: JSON.stringify({ items: [{ table, operation: 'upsert', payload: data }] })
          }).catch(err => console.warn(`[Clone] Failed to migrate ${table} to local server:`, err));
        }
      }
      
      // Self-healing: if online and fetching books, check for any unsynced local uploads
      if (table === "books" && data) {
        const remoteIds = new Set(data.map(b => b.id));
        const localBooks = await getTableData("books");
        const unsyncedBooks = localBooks.filter(b => b.user_id === userId && !remoteIds.has(b.id));
        
        if (unsyncedBooks.length > 0) {
          console.log(`[Sync] Self-healing: Found ${unsyncedBooks.length} unsynced local books. Syncing to local server...`);
          serverJson('/api/db/push', {
            method: 'POST',
            body: JSON.stringify({ items: [{ table: 'books', operation: 'upsert', payload: unsyncedBooks }] })
          }).then(() => {
            console.log("[Sync] Self-healing: Successfully uploaded unsynced books to local server.");
          }).catch(err => {
            console.warn("[Sync] Self-healing: Failed to sync books to local server:", err);
          });
        }

        // Proactively scan all local books cached in IndexedDB and upload them to the server if missing
        for (const book of localBooks) {
          if (book.user_id !== userId || !book.file_url) continue;
          let filePath = null;
          if (book.file_url.includes('book-files/')) {
            filePath = book.file_url.split('book-files/').pop().split('?')[0];
          } else if (book.file_url.includes('uploads/')) {
            filePath = book.file_url.split('uploads/').pop().split('?')[0];
          } else {
            filePath = book.file_url.split('/').pop().split('?')[0];
          }
          if (filePath) {
            const fullPath = `book-files/${decodeURIComponent(filePath)}`;
            getLocalFile(fullPath).then((fileBlob) => {
              if (fileBlob) {
                const serverPathToCheck = book.file_url.split('?')[0];
                const serverUrl = serverPathToCheck.startsWith('http') ? serverPathToCheck : `${getServerUrl()}${serverPathToCheck.startsWith('/') ? '' : '/'}${serverPathToCheck}`;
                fetch(serverUrl, { method: 'HEAD' }).then(async (testRes) => {
                  const contentType = testRes.headers.get('content-type') || '';
                  if (testRes.status === 404 || contentType.includes('text/html')) {
                    console.log(`[Sync] Self-healing: Syncing missing file blob for ${book.title} to server...`);
                    
                    let uploadPath = filePath;
                    if (book.file_url.includes('/book-files/')) {
                      uploadPath = `book-files/${decodeURIComponent(filePath)}`;
                    } else {
                      uploadPath = decodeURIComponent(filePath);
                    }

                    fetch(`${getServerUrl()}/api/upload`, {
                      method: 'POST',
                      headers: {
                        'x-file-path': uploadPath,
                        'Content-Type': 'application/octet-stream'
                      },
                      body: fileBlob
                    }).then(res => {
                      if (res.ok) {
                        console.log(`[Sync] Self-healing: Proactively uploaded file blob for ${book.title} to server`);
                      }
                    }).catch(() => {});
                  }
                }).catch(() => {});
              }
            }).catch(() => {});
          }

          if (book.cover_url && book.cover_url.includes('/uploads/book-covers/')) {
            const coverPath = book.cover_url.split('/book-covers/').pop().split('?')[0];
            if (coverPath) {
              const fullCoverPath = `book-covers/${decodeURIComponent(coverPath)}`;
              getLocalFile(fullCoverPath).then((coverBlob) => {
                if (coverBlob) {
                  const serverCoverUrl = book.cover_url.split('?')[0];
                  fetch(serverCoverUrl, { method: 'HEAD' }).then(async (testRes) => {
                    const contentType = testRes.headers.get('content-type') || '';
                    if (testRes.status === 404 || contentType.includes('text/html')) {
                      console.log(`[Sync] Self-healing: Syncing missing cover blob for ${book.title} to server...`);
                      fetch(`${getServerUrl()}/api/upload`, {
                        method: 'POST',
                        headers: {
                          'x-file-path': `book-covers/${decodeURIComponent(coverPath)}`,
                          'Content-Type': 'application/octet-stream'
                        },
                        body: coverBlob
                      }).catch(() => {});
                    }
                  }).catch(() => {});
                }
              }).catch(() => {});
            }
          }
        }
      }
      
      if (data && data.length > 0) {
        await mergeRemoteData(table, data);
        console.log(`[Clone] Synced ${data.length} rows for table ${table}`);
      }
    } catch (err) {
      console.error(`[Clone] Error cloning table ${table}:`, err);
    }
  }
  if (serverPullSucceeded) {
    safeLocalStorage.setItem(legacyMigrationKey, 'true');
  }
  console.log("[Clone] Server data clone completed!");
}

interface SyncItem {
  table: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  payload: any;
  upsertConflict?: string;
  timestamp: number;
}

// Read pending offline sync items
async function getSyncQueue(): Promise<SyncItem[]> {
  try {
    const q = await localforage.getItem("local_db_sync_queue");
    return q ? (q as SyncItem[]) : [];
  } catch (e) {
    return [];
  }
}

// Save offline sync queue
async function setSyncQueue(queue: SyncItem[]) {
  try {
    await localforage.setItem("local_db_sync_queue", queue);
  } catch (e) {
    console.error("Failed to save sync queue", e);
  }
}

// Add item to offline sync queue
async function queueSync(table: string, operation: 'insert' | 'update' | 'upsert' | 'delete', payload: any, upsertConflict?: string) {
  if (table === 'reading_locations') return; // local-only table
  const queue = await getSyncQueue();
  queue.push({
    table,
    operation,
    payload,
    upsertConflict,
    timestamp: Date.now()
  });
  await setSyncQueue(queue);
  processSyncQueue().catch(console.error);
}

let isSyncing = false;

// Process offline queue and upload to remote Supabase server when connection is active
export async function processSyncQueue() {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  isSyncing = true;
  try {
    await _processSyncQueue();
  } finally {
    isSyncing = false;
  }
}

async function _processSyncQueue() {
  const session = getLocalSession();
  if (!session?.user) return;

  const queue = await getSyncQueue();
  if (queue.length === 0) return;

  console.log(`[Sync] Processing ${queue.length} local-server changes...`);

  try {
    const items = queue.map(item => {
      let payload = item.payload;
      if (item.operation !== 'delete' && !['books', 'profiles', 'book_reviews', 'annotations', 'tags'].includes(item.table)) {
        payload = (Array.isArray(payload) ? payload : [payload]).map((p: any) => {
          const next = { ...p };
          delete next.updated_at;
          return next;
        });
      }
      return { ...item, payload };
    });
    await serverJson('/api/db/push', {
      method: 'POST',
      body: JSON.stringify({ userId: session.user.id, items })
    });
    await setSyncQueue([]);
    console.log(`[Sync] Successfully synced ${queue.length} changes to local server`);
  } catch (err) {
    console.warn('[Sync] Failed to sync local-server changes:', err);
  }
}

// Add window online listener to auto-sync when network reconnects
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Sync] Device is back online! Processing queued offline changes...');
    processSyncQueue().catch(console.error);
    const session = getLocalSession();
    if (session?.user) {
      cloneRemoteData(session.user.id).catch(console.error);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('[Sync] App returned to foreground, checking for remote updates...');
      processSyncQueue().catch(console.error);
      const session = getLocalSession();
      if (session?.user) {
        cloneRemoteData(session.user.id).catch(console.error);
      }
    }
  });
}

let realtimeSyncChannel: any = null;

function setupRealtimeSync(userId: string) {
  if (realtimeSyncChannel) return;
  realtimeSyncChannel = originalSupabase.channel('custom-all-channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public' },
      (payload) => {
        console.log('[Sync] Realtime change detected on server:', payload);
        cloneRemoteData(userId).catch(console.error);
      }
    )
    .subscribe();
}

function teardownRealtimeSync() {
  if (realtimeSyncChannel) {
    originalSupabase.removeChannel(realtimeSyncChannel);
    realtimeSyncChannel = null;
  }
}

// Local mock Query Builder
class MockQueryBuilder {
  private tableName: string;
  private filters: Array<(row: any) => boolean> = [];
  private filterMeta: Array<{ field: string; operator: string; value: any }> = [];
  private orderField: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  private selectFields: string = '*';
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private isSingle = false;
  private isMaybeSingle = false;
  private upsertConflict: string | undefined = undefined;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields: string = '*') {
    if (this.operation === 'select') {
      this.selectFields = fields;
    }
    return this;
  }

  insert(values: any) {
    this.operation = 'insert';
    this.payload = values;
    return this;
  }

  update(values: any) {
    this.operation = 'update';
    this.payload = values;
    return this;
  }

  upsert(values: any, options?: { onConflict?: string }) {
    this.operation = 'upsert';
    this.payload = values;
    this.upsertConflict = options?.onConflict;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(field: string, value: any) {
    this.filterMeta.push({ field, operator: 'eq', value });
    this.filters.push(row => row[field] === value);
    return this;
  }

  ilike(field: string, pattern: string) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cleanPattern = escaped.replace(/%/g, '.*');
    const regex = new RegExp(`^${cleanPattern}$`, 'i');
    this.filters.push(row => {
      const val = row[field];
      if (val === null || val === undefined) return false;
      return regex.test(String(val));
    });
    return this;
  }

  neq(field: string, value: any) {
    this.filterMeta.push({ field, operator: 'neq', value });
    this.filters.push(row => row[field] !== value);
    return this;
  }

  not(field: string, operator: string, value: any) {
    if (operator === 'is' && value === null) {
      this.filters.push(row => row[field] !== null && row[field] !== undefined);
    } else {
      this.filters.push(row => row[field] !== value);
    }
    return this;
  }

  in(field: string, values: any[]) {
    this.filters.push(row => values.includes(row[field]));
    return this;
  }

  gte(field: string, value: any) {
    this.filters.push(row => row[field] >= value);
    return this;
  }

  lte(field: string, value: any) {
    this.filters.push(row => row[field] <= value);
    return this;
  }

  match(obj: Record<string, any>) {
    this.filters.push(row => {
      for (const key in obj) {
        if (row[key] !== obj[key]) return false;
      }
      return true;
    });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderField = field;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  async execute() {
    try {
      let data = await getTableData(this.tableName);

      if (this.operation === 'select') {
        const isPublicBooksQuery = this.tableName === 'books' && this.filterMeta.some(f => f.field === 'is_public' && f.operator === 'eq' && f.value === true);
        if (isPublicBooksQuery && navigator.onLine) {
          try {
            const response = await serverJson('/api/db/public-books');
            data = response.books || [];
            await mergeRemoteData('books', data);
          } catch (err) {
            console.warn('[Local DB] Failed to fetch public books from local server:', err);
          }
        }
        // Apply filters
        for (const filter of this.filters) {
          data = data.filter(filter);
        }

        // Apply order
        if (this.orderField) {
          const field = this.orderField;
          const asc = this.orderAscending;
          data.sort((a, b) => {
            const valA = a[field];
            const valB = b[field];
            if (valA === valB) return 0;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;
            if (valA < valB) return asc ? -1 : 1;
            return asc ? 1 : -1;
          });
        }

        // Apply limit
        if (this.limitCount !== null) {
          data = data.slice(0, this.limitCount);
        }

        // Convert any local image URLs to Base64 in selected rows
        data = await processLocalUrls(data);

        if (this.isSingle) {
          if (data.length === 0) {
            return { data: null, error: { message: 'No rows found' } };
          }
          return { data: data[0], error: null };
        }

        if (this.isMaybeSingle) {
          return { data: data.length > 0 ? data[0] : null, error: null };
        }

        return { data, error: null };
      }

      if (this.operation === 'insert') {
        const toInsert = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted: any[] = [];
        
        for (const item of toInsert) {
          const newItem = {
            id: item.id || generateUUID(),
            created_at: item.created_at || new Date().toISOString(),
            ...item
          };
          data.push(newItem);
          inserted.push(newItem);

          if (this.tableName === 'books' && newItem.file_url?.includes('/local-file-route/') && newItem.file_type !== 'manga') {
            await handleBookInsertionOffline(newItem);
          }
        }

        await setTableData(this.tableName, data);
        
        // Queue for offline remote synchronization
        await queueSync(this.tableName, 'insert', inserted);
        
        const returnData = Array.isArray(this.payload) ? inserted : inserted[0];
        return { data: returnData, error: null };
      }

      if (this.operation === 'update') {
        let updatedRows: any[] = [];
        data = data.map(row => {
          let matches = true;
          for (const filter of this.filters) {
            if (!filter(row)) {
              matches = false;
              break;
            }
          }
          if (matches) {
            const updatedRow = { ...row, ...this.payload };
            if ('updated_at' in row) {
              updatedRow.updated_at = new Date().toISOString();
            }
            updatedRows.push(updatedRow);
            return updatedRow;
          }
          return row;
        });

        await setTableData(this.tableName, data);
        
        // Queue for offline remote synchronization
        if (updatedRows.length > 0) {
          await queueSync(this.tableName, 'update', updatedRows);
        }
        
        const returnData = this.isSingle || this.isMaybeSingle ? (updatedRows[0] || null) : updatedRows;
        return { data: returnData, error: null };
      }

      if (this.operation === 'upsert') {
        const toUpsert = Array.isArray(this.payload) ? this.payload : [this.payload];
        const conflictKeys = this.upsertConflict ? this.upsertConflict.split(',').map(s => s.trim()) : ['id'];
        const upserted: any[] = [];
        
        for (const item of toUpsert) {
          // Find matching row locally
          const matchIdx = data.findIndex(row => {
            return conflictKeys.every(k => row[k] === item[k]);
          });
          
          if (matchIdx !== -1) {
            // Update existing row
            const updatedRow = {
              ...data[matchIdx],
              ...item
            };
            if ('updated_at' in data[matchIdx]) {
              updatedRow.updated_at = new Date().toISOString();
            }
            data[matchIdx] = updatedRow;
            upserted.push(updatedRow);
          } else {
            // Insert new row
            const newRow = {
              id: item.id || generateUUID(),
              created_at: new Date().toISOString(),
              ...item
            };
            if (['books', 'profiles', 'book_reviews', 'annotations', 'tags'].includes(this.tableName)) {
              newRow.updated_at = new Date().toISOString();
            }
            data.push(newRow);
            upserted.push(newRow);
          }
        }

        await setTableData(this.tableName, data);
        
        // Queue for offline remote synchronization
        await queueSync(this.tableName, 'upsert', upserted, this.upsertConflict);
        
        const returnData = Array.isArray(this.payload) ? upserted : upserted[0];
        return { data: returnData, error: null };
      }

      if (this.operation === 'delete') {
        const remaining: any[] = [];
        const deleted: any[] = [];
        for (const row of data) {
          let matches = true;
          for (const filter of this.filters) {
            if (!filter(row)) {
              matches = false;
              break;
            }
          }
          if (matches) {
            deleted.push(row);
          } else {
            remaining.push(row);
          }
        }

        await setTableData(this.tableName, remaining);

        if (this.tableName === 'books' && deleted.length > 0) {
          const deletedIds = new Set(deleted.map(row => row.id).filter(Boolean));
          const cascadeTables = [
            'book_tags',
            'annotations',
            'book_reviews',
            'reading_sessions',
            'reading_list_books',
            'journal_entries',
            'scheduled_reading'
          ];

          for (const table of cascadeTables) {
            const tableRows = await getTableData(table);
            const cascadeDeleted = tableRows.filter(row => deletedIds.has(row.book_id));
            if (cascadeDeleted.length > 0) {
              await setTableData(table, tableRows.filter(row => !deletedIds.has(row.book_id)));
              await queueSync(table, 'delete', cascadeDeleted);
            }
          }
        }

        if (this.tableName === 'reading_lists' && deleted.length > 0) {
          const deletedIds = new Set(deleted.map(row => row.id).filter(Boolean));
          const tableRows = await getTableData('reading_list_books');
          const cascadeDeleted = tableRows.filter(row => deletedIds.has(row.list_id));
          if (cascadeDeleted.length > 0) {
            await setTableData('reading_list_books', tableRows.filter(row => !deletedIds.has(row.list_id)));
            await queueSync('reading_list_books', 'delete', cascadeDeleted);
          }
        }

        if (this.tableName === 'tags' && deleted.length > 0) {
          const deletedIds = new Set(deleted.map(row => row.id).filter(Boolean));
          const tableRows = await getTableData('book_tags');
          const cascadeDeleted = tableRows.filter(row => deletedIds.has(row.tag_id));
          if (cascadeDeleted.length > 0) {
            await setTableData('book_tags', tableRows.filter(row => !deletedIds.has(row.tag_id)));
            await queueSync('book_tags', 'delete', cascadeDeleted);
          }
        }
        
        // Queue for offline remote synchronization
        if (deleted.length > 0) {
          await queueSync(this.tableName, 'delete', deleted);
        }
        
        const returnData = this.isSingle || this.isMaybeSingle ? (deleted[0] || null) : deleted;
        return { data: returnData, error: null };
      }

      return { data: null, error: { message: 'Unsupported operation' } };
    } catch (e: any) {
      return { data: null, error: { message: e.message || 'Error executing query' } };
    }
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// Helpers for auth
function getLocalUsers(): any[] {
  try {
    const users = safeLocalStorage.getItem('local_users');
    return users ? JSON.parse(users) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalUsers(users: any[]) {
  try {
    safeLocalStorage.setItem('local_users', JSON.stringify(users));
  } catch (e) {}
}

function getLocalSession() {
  try {
    const session = safeLocalStorage.getItem('local_session');
    return session ? JSON.parse(session) : null;
  } catch (e) {
    return null;
  }
}

function saveLocalSession(session: any) {
  try {
    if (session) {
      safeLocalStorage.setItem('local_session', JSON.stringify(session));
    } else {
      safeLocalStorage.removeItem('local_session');
    }
  } catch (e) {}
}

let authListeners: Array<(event: string, session: any) => void> = [];

function triggerAuthEvent(event: string, session: any) {
  authListeners.forEach(listener => {
    try {
      listener(event, session);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  });
}

// Local mock Auth Object
const localAuthProxy = {
  signUp: async (credentials: any) => {
    try {
      const email = String(credentials.email || '').trim().toLowerCase();
      const password = credentials.password;
      const response = await serverJson('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const session = toLocalSession(response.user, password);
      const users = getLocalUsers();
      if (!users.some(u => u.email === email)) {
        users.push({ id: response.user.id, email, password });
        saveLocalUsers(users);
      }
      saveLocalSession(session);
      triggerAuthEvent('SIGNED_IN', session);
      cloneRemoteData(response.user.id, { force: true }).catch(console.error);
      return { data: { user: session.user, session }, error: null };
    } catch (e: any) {
      return { data: { user: null, session: null }, error: e };
    }
  },

  signInWithPassword: async (credentials: any) => {
    const email = String(credentials.email || '').trim().toLowerCase();
    const password = credentials.password;
    try {
      const response = await serverJson('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const session = toLocalSession(response.user, password);
      const users = getLocalUsers();
      const idx = users.findIndex(u => u.email === email);
      if (idx >= 0) users[idx] = { id: response.user.id, email, password };
      else users.push({ id: response.user.id, email, password });
      saveLocalUsers(users);
      saveLocalSession(session);
      triggerAuthEvent('SIGNED_IN', session);
      cloneRemoteData(response.user.id, { force: true }).catch(console.error);
      return { data: { user: session.user, session }, error: null };
    } catch (serverError: any) {
      // Legacy fallback only: lets existing Supabase users migrate into the local server once.
      if (navigator.onLine) {
        try {
          const { data: remoteData, error: remoteError } = await originalSupabase.auth.signInWithPassword({ email, password });
          if (!remoteError && remoteData?.user) {
            const migrated = await serverJson('/api/auth/signup', {
              method: 'POST',
              body: JSON.stringify({ id: remoteData.user.id, email, password })
            }).catch(async () => serverJson('/api/auth/signin', {
              method: 'POST',
              body: JSON.stringify({ email, password })
            }));
            const session = toLocalSession(migrated.user || remoteData.user, password);
            saveLocalSession(session);
            triggerAuthEvent('SIGNED_IN', session);
            cloneRemoteData(session.user.id, { force: true }).catch(console.error);
            return { data: { user: session.user, session }, error: null };
          }
          if (remoteError) return { data: { user: null, session: null }, error: remoteError };
        } catch {}
      }

      const users = getLocalUsers();
      const localUser = users.find(u => u.email === email && u.password === password);
      if (localUser) {
        const session = toLocalSession({ id: localUser.id, email }, password);
        saveLocalSession(session);
        triggerAuthEvent('SIGNED_IN', session);
        return { data: { user: session.user, session }, error: null };
      }
      return { data: { user: null, session: null }, error: serverError };
    }
  },

  signOut: async () => {
    saveLocalSession(null);
    triggerAuthEvent('SIGNED_OUT', null);
    return { error: null };
  },

  getUser: async () => {
    const session = getLocalSession();
    return { data: { user: session?.user || null }, error: null };
  },

  getSession: async () => {
    const session = getLocalSession();
    if (session?.user) {
      cloneRemoteData(session.user.id).catch(console.error);
    }
    return { data: { session: session || null }, error: null };
  },

  onAuthStateChange: (callback: (event: any, session: any) => void) => {
    authListeners.push(callback);
    const session = getLocalSession();
    setTimeout(() => {
      callback(session ? 'INITIAL_SESSION' : 'SIGNED_OUT', session);
    }, 0);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            authListeners = authListeners.filter(l => l !== callback);
          }
        }
      }
    };
  }
};

export function getServerUrl() {
  if (typeof window === 'undefined') return "https://cc.displayname.top";
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')) {
    return window.location.origin;
  }
  return "https://cc.displayname.top";
}


async function serverJson(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${getServerUrl()}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error || `Server request failed (${res.status})`);
  }
  return data;
}

function toLocalSession(user: any, password?: string) {
  return {
    access_token: `local-server-token-${user.id}`,
    refresh_token: `local-server-refresh-${user.id}`,
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365),
    token_type: 'bearer',
    user: {
      id: user.id,
      email: user.email,
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: { email: user.email },
      app_metadata: { provider: 'local-server', providers: ['local-server'] },
      created_at: user.created_at || new Date().toISOString()
    }
  };
}

// Local mock Storage Object
const localStorageProxy = {
  from: (bucket: string) => ({
    upload: async (filePath: string, file: any, options?: any) => {
      try {
        const fullPath = `${bucket}/${filePath}`;
        await saveLocalFile(fullPath, file);
        console.log(`[Storage] Uploaded ${fullPath} locally to IndexedDB`);

        if (navigator.onLine) {
          const res = await fetch(`${getServerUrl()}/api/upload`, {
            method: 'POST',
            headers: {
              'x-file-path': `${bucket}/${filePath}`,
              'Content-Type': 'application/octet-stream'
            },
            body: file
          });
          if (!res.ok) {
            const message = await res.text().catch(() => res.statusText);
            throw new Error(`Failed to sync ${fullPath} to local server: ${message}`);
          }
          console.log(`[Storage] Successfully synced ${fullPath} to local server`);
        }

        return { data: { path: filePath }, error: null };
      } catch (e: any) {
        console.error('[Storage] Local upload failed:', e);
        return { data: null, error: e };
      }
    },
    
    remove: async (paths: string[]) => {
      try {
        const db = await openLocalDB();
        const transaction = db.transaction(LOCAL_FILES_STORE, 'readwrite');
        const store = transaction.objectStore(LOCAL_FILES_STORE);
        for (const p of paths) {
          const fullPath = `${bucket}/${p}`;
          store.delete(fullPath);
          if (navigator.onLine) {
            await fetch(`${getServerUrl()}/api/upload`, {
              method: 'DELETE',
              headers: { 'x-file-path': fullPath }
            }).catch(err => console.warn(`[Storage] Failed to delete ${fullPath} from local server:`, err));
          }
        }
        return { data: null, error: null };
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    
    createSignedUrl: async (filePath: string, expiresIn: number) => {
      const fullPath = `${bucket}/${filePath}`;
      
      // 1. If online, serve directly from the local Node server static path
      if (navigator.onLine) {
        const serverUrl = `${getServerUrl()}/uploads/${bucket}/${filePath}`;
        return { data: { signedUrl: serverUrl }, error: null };
      }
      
      // 2. If offline, fallback to IndexedDB file blob
      const localFile = await getLocalFile(fullPath);
      if (localFile) {
        const localUrl = `${window.location.origin}/local-file-route/${encodeURIComponent(fullPath)}`;
        return { data: { signedUrl: localUrl }, error: null };
      }
      
      return { data: null, error: new Error("File not available offline") };
    },
    
    getPublicUrl: (filePath: string) => {
      const fullPath = `${bucket}/${filePath}`;
      // Return local server URL for cover images and other public assets
      const serverUrl = `${getServerUrl()}/uploads/${bucket}/${filePath}`;
      return { data: { publicUrl: serverUrl } };
    }
  })
};

// Main Export Client Proxy
export const supabase = new Proxy({
  auth: localAuthProxy,
  from: (table: string) => new MockQueryBuilder(table),
  storage: localStorageProxy,
  functions: {
    invoke: async (functionName: string, options?: any) => {
      if (functionName === 'public-library-proxy') {
        try {
          const data = await serverJson('/api/public-library-proxy', {
            method: 'POST',
            body: JSON.stringify(options?.body || {})
          });
          return { data, error: null };
        } catch (error: any) {
          return { data: null, error };
        }
      }

      // Local-server architecture: server-side generated metadata/covers are optional enhancements.
      // Avoid sending normal app writes through Supabase Edge Functions.
      if (['extract-metadata', 'generate-cover'].includes(functionName)) {
        return { data: { skipped: true }, error: null };
      }

      console.log(`[Functions] Invoking legacy Edge Function "${functionName}" via original Supabase client`);
      return originalSupabase.functions.invoke(functionName, options);
    }
  }
}, {
  get: (target, prop) => {
    if (typeof window !== 'undefined' && safeLocalStorage.getItem("app_outdated") === "true") {
      if (prop === 'from') {
        return (table: string) => ({
          select: () => Promise.resolve({ data: [], error: { message: "Outdated version" } }),
          insert: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
          update: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
          delete: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
          upsert: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
          eq: function() { return this; },
          neq: function() { return this; },
          ilike: function() { return this; },
          gt: function() { return this; },
          lt: function() { return this; },
          order: function() { return this; },
          single: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
          maybeSingle: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
        });
      }
      if (prop === 'functions') {
        return {
          invoke: () => Promise.resolve({ data: null, error: { message: "Outdated version" } })
        };
      }
      if (prop === 'auth') {
        return {
          getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          getUser: () => Promise.resolve({ data: { user: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
          signOut: () => Promise.resolve({ error: null })
        };
      }
      if (prop === 'storage') {
        return {
          from: () => ({
            upload: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
            download: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
            remove: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
            createSignedUrl: () => Promise.resolve({ data: null, error: { message: "Outdated version" } }),
            getPublicUrl: () => ({ data: { publicUrl: "" } })
          })
        };
      }
    }
    return Reflect.get(target, prop);
  }
});

// Legacy Supabase auth is intentionally not used for primary auth anymore.
// The local server auth proxy above owns user sessions; Supabase remains only as a one-time legacy migration fallback.
