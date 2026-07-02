import { createClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types';

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

const CURRENT_VERSION = "v1.0.97";
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
export function getTableData(table: string): any[] {
  try {
    const data = safeLocalStorage.getItem(`local_db_${table}`);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.warn(`Failed to read local table ${table}:`, e);
    return [];
  }
}

export function setTableData(table: string, data: any[]) {
  try {
    safeLocalStorage.setItem(`local_db_${table}`, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to save local table ${table}:`, e);
  }
}

function mergeRemoteData(table: string, remoteRows: any[]) {
  if (!remoteRows || !Array.isArray(remoteRows)) return;
  const localRows = getTableData(table);
  const localMap = new Map(localRows.map(r => [r.id, r]));
  
  let changed = false;
  for (const row of remoteRows) {
    if (!localMap.has(row.id)) {
      localRows.push(row);
      changed = true;
    } else {
      const index = localRows.findIndex(r => r.id === row.id);
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
    setTableData(table, localRows);
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
export async function cloneRemoteData(userId: string) {
  if (cloneInProgress) {
    console.log('[Clone] Clone already in progress, skipping.');
    return;
  }
  cloneInProgress = true;
  try {
    await _cloneRemoteData(userId);
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

  console.log("[Clone] Starting remote data clone for user:", userId);

  for (const table of BACKUP_TABLES) {
    try {
      let query = originalSupabase.from(table as any).select("*");
      if (table === "profiles") {
        query = query.eq("id", userId) as any;
      } else if (table !== "book_tags" && table !== "reading_list_books") {
        query = query.eq("user_id", userId) as any;
      }
      
      const { data, error } = await query;
      if (error) {
        console.warn(`[Clone] Failed to fetch table ${table}:`, error);
        continue;
      }
      
      // Self-healing: if online and fetching books, check for any unsynced local uploads
      if (table === "books" && data) {
        const remoteIds = new Set(data.map(b => b.id));
        const localBooks = getTableData("books");
        const unsyncedBooks = localBooks.filter(b => b.user_id === userId && !remoteIds.has(b.id));
        
        if (unsyncedBooks.length > 0) {
          console.log(`[Sync] Self-healing: Found ${unsyncedBooks.length} unsynced local books. Syncing to remote...`);
          originalSupabase.from("books").upsert(unsyncedBooks).then(() => {
            console.log("[Sync] Self-healing: Successfully uploaded unsynced books to server.");
          }).catch(err => {
            console.warn("[Sync] Self-healing: Failed to sync books to remote server:", err);
          });
        }

        // Proactively scan all local books cached in IndexedDB and upload them to the server if missing
        for (const book of localBooks) {
          if (book.user_id !== userId || !book.file_url) continue;
          const fileParts = book.file_url.split('/book-files/');
          const filePath = fileParts[1] ? fileParts[1].split('?')[0] : null;
          if (filePath) {
            const fullPath = `book-files/${decodeURIComponent(filePath)}`;
            getLocalFile(fullPath).then((fileBlob) => {
              if (fileBlob) {
                const serverUrl = `${getServerUrl()}/uploads/book-files/${filePath}`;
                fetch(serverUrl, { method: 'HEAD' }).then(async (testRes) => {
                  const contentType = testRes.headers.get('content-type') || '';
                  if (testRes.status === 404 || contentType.includes('text/html')) {
                    console.log(`[Sync] Self-healing: Syncing missing file blob for ${book.title} to server...`);
                    fetch(`${getServerUrl()}/api/upload`, {
                      method: 'POST',
                      headers: {
                        'x-file-path': `book-files/${decodeURIComponent(filePath)}`,
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
        }
      }
      
      if (data && data.length > 0) {
        mergeRemoteData(table, data);
        console.log(`[Clone] Synced ${data.length} rows for table ${table}`);
      }
    } catch (err) {
      console.error(`[Clone] Error cloning table ${table}:`, err);
    }
  }
  console.log("[Clone] Remote data clone completed!");
}

interface SyncItem {
  table: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  payload: any;
  upsertConflict?: string;
  timestamp: number;
}

// Read pending offline sync items
function getSyncQueue(): SyncItem[] {
  try {
    const q = safeLocalStorage.getItem("local_db_sync_queue");
    return q ? JSON.parse(q) : [];
  } catch (e) {
    return [];
  }
}

// Save offline sync queue
function setSyncQueue(queue: SyncItem[]) {
  try {
    safeLocalStorage.setItem("local_db_sync_queue", JSON.stringify(queue));
  } catch (e) {}
}

// Add item to offline sync queue
function queueSync(table: string, operation: 'insert' | 'update' | 'upsert' | 'delete', payload: any, upsertConflict?: string) {
  if (table === 'reading_locations') return; // local-only table
  const queue = getSyncQueue();
  queue.push({
    table,
    operation,
    payload,
    upsertConflict,
    timestamp: Date.now()
  });
  setSyncQueue(queue);
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
  const { data: { session } } = await originalSupabase.auth.getSession();
  if (!session?.user) return; // Must be authenticated to sync

  const queue = getSyncQueue();
  if (queue.length === 0) return;

  console.log(`[Sync] Processing ${queue.length} offline changes...`);

  const remainingQueue: SyncItem[] = [];

  for (const item of queue) {
    try {
      if (item.operation === 'insert' || item.operation === 'upsert' || item.operation === 'update') {
        const payloadToSync = Array.isArray(item.payload) ? item.payload : [item.payload];
        const { error } = await originalSupabase
          .from(item.table as any)
          .upsert(payloadToSync, { onConflict: item.upsertConflict });
          
        if (error) throw error;
      } else if (item.operation === 'delete') {
        const payloadToSync = Array.isArray(item.payload) ? item.payload : [item.payload];
        const ids = payloadToSync.map((r: any) => r.id);
        const { error } = await originalSupabase
          .from(item.table as any)
          .delete()
          .in('id', ids);
          
        if (error) throw error;
      }
      console.log(`[Sync] Successfully synced offline ${item.operation} for table ${item.table}`);
    } catch (err) {
      console.warn(`[Sync] Failed to sync ${item.operation} for table ${item.table}:`, err);
      remainingQueue.push(item);
    }
  }

  setSyncQueue(remainingQueue);
}

// Add window online listener to auto-sync when network reconnects
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Sync] Device is back online! Processing queued offline changes...');
    processSyncQueue().catch(console.error);
  });
}

// Local mock Query Builder
class MockQueryBuilder {
  private tableName: string;
  private filters: Array<(row: any) => boolean> = [];
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
      let data = getTableData(this.tableName);

      if (this.operation === 'select') {
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

        setTableData(this.tableName, data);
        
        // Queue for offline remote synchronization
        queueSync(this.tableName, 'insert', inserted);
        
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

        setTableData(this.tableName, data);
        
        // Queue for offline remote synchronization
        if (updatedRows.length > 0) {
          queueSync(this.tableName, 'update', updatedRows);
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
              ...item,
              updated_at: new Date().toISOString()
            };
            data[matchIdx] = updatedRow;
            upserted.push(updatedRow);
          } else {
            // Insert new row
            const newRow = {
              id: item.id || generateUUID(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...item
            };
            data.push(newRow);
            upserted.push(newRow);
          }
        }

        setTableData(this.tableName, data);
        
        // Queue for offline remote synchronization
        queueSync(this.tableName, 'upsert', upserted, this.upsertConflict);
        
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

        setTableData(this.tableName, remaining);
        
        // Queue for offline remote synchronization
        if (deleted.length > 0) {
          queueSync(this.tableName, 'delete', deleted);
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
      const email = credentials.email;
      const password = credentials.password;
      const users = getLocalUsers();
      
      if (users.some(u => u.email === email)) {
        return { data: { user: null, session: null }, error: new Error('User already registered') };
      }

      // Sync account creation to remote Supabase server when online
      let remoteUser: any = null;
      let remoteSession: any = null;
      
      if (navigator.onLine) {
        const { data, error } = await originalSupabase.auth.signUp({
          email,
          password,
          options: credentials.options
        });
        if (error) {
          return { data: { user: null, session: null }, error };
        }
        if (data && data.user) {
          remoteUser = data.user;
          remoteSession = data.session;
        }
      }
      
      const userId = remoteUser?.id || generateUUID();
      const mockUser = remoteUser || {
        id: userId,
        email,
        role: 'authenticated',
        aud: 'authenticated',
        user_metadata: {},
        app_metadata: {},
        created_at: new Date().toISOString()
      };
      
      const mockSession = remoteSession || {
        access_token: 'mock-local-token-' + userId,
        refresh_token: 'mock-local-refresh-token-' + userId,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: mockUser
      };
      
      users.push({ id: userId, email, password });
      saveLocalUsers(users);
      saveLocalSession(mockSession);
      
      // Auto-create profile in database
      const defaultProfile = {
        id: userId,
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const profiles = getTableData('profiles');
      if (!profiles.some(p => p.id === userId)) {
        profiles.push(defaultProfile);
        setTableData('profiles', profiles);
      }

      triggerAuthEvent('SIGNED_IN', mockSession);
      return { data: { user: mockUser, session: mockSession }, error: null };
    } catch (e: any) {
      return { data: { user: null, session: null }, error: e };
    }
  },

  signInWithPassword: async (credentials: any) => {
    try {
      const email = credentials.email;
      const password = credentials.password;
      
      // Try remote Supabase server login first if online
      if (navigator.onLine) {
        console.log('[Auth] Online: Attempting remote database login...');
        const { data: remoteData, error: remoteError } = await originalSupabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (!remoteError && remoteData && remoteData.session && remoteData.user) {
          const users = getLocalUsers();
          if (!users.some(u => u.email === email)) {
            users.push({ id: remoteData.user.id, email, password });
            saveLocalUsers(users);
          } else {
            const idx = users.findIndex(u => u.email === email);
            if (idx !== -1) users[idx].password = password;
            saveLocalUsers(users);
          }
          
          const localSession = {
            access_token: remoteData.session.access_token,
            refresh_token: remoteData.session.refresh_token,
            expires_in: remoteData.session.expires_in,
            expires_at: remoteData.session.expires_at,
            token_type: remoteData.session.token_type,
            user: remoteData.user
          };
          saveLocalSession(localSession);
          
          // Explicitly sync session context
          await originalSupabase.auth.setSession({
            access_token: remoteData.session.access_token,
            refresh_token: remoteData.session.refresh_token
          }).catch(() => {});
          
          cloneRemoteData(remoteData.user.id).catch(console.error);
          triggerAuthEvent('SIGNED_IN', localSession);
          return { data: { user: remoteData.user, session: remoteData.session }, error: null };
        }
        
        // If it is a credentials error (wrong password/user doesn't exist), return immediately
        if (remoteError && remoteError.status && remoteError.status >= 400 && remoteError.status < 500) {
          return { data: { user: null, session: null }, error: remoteError };
        }
      }
      
      // Offline fallback or remote server error fallback: authenticate locally
      console.log('[Auth] Offline or remote server error. Authenticating locally...');
      const users = getLocalUsers();
      const localUser = users.find(u => u.email === email);
      if (localUser) {
        if (localUser.password !== password) {
          return { data: { user: null, session: null }, error: new Error('Invalid credentials') };
        }
        
        const mockUser = {
          id: localUser.id,
          email,
          role: 'authenticated',
          aud: 'authenticated',
          user_metadata: {},
          app_metadata: {},
          created_at: new Date().toISOString()
        };
        
        const mockSession = {
          access_token: 'mock-local-token-' + localUser.id,
          refresh_token: 'mock-local-refresh-token-' + localUser.id,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: mockUser
        };
        saveLocalSession(mockSession);
        triggerAuthEvent('SIGNED_IN', mockSession);
        return { data: { user: mockUser, session: mockSession }, error: null };
      }
      
      return { data: { user: null, session: null }, error: new Error('User not registered or device is offline') };
    } catch (e: any) {
      return { data: { user: null, session: null }, error: e };
    }
  },

  signOut: async () => {
    saveLocalSession(null);
    await originalSupabase.auth.signOut().catch(() => {});
    triggerAuthEvent('SIGNED_OUT', null);
    return { error: null };
  },

  getUser: async () => {
    const session = getLocalSession();
    if (session && session.user) {
      return { data: { user: session.user }, error: null };
    }
    // Try remote client
    const { data, error } = await originalSupabase.auth.getUser();
    if (data && data.user) {
      // Sync local session
      const remoteSessionResponse = await originalSupabase.auth.getSession();
      if (remoteSessionResponse.data.session) {
        saveLocalSession(remoteSessionResponse.data.session);
      }
      return { data: { user: data.user }, error: null };
    }
    return { data: { user: null }, error: null };
  },

  getSession: async () => {
    const session = getLocalSession();
    if (session) {
      if (session.user) {
        // Synchronize authenticated session state to original remote Supabase client
        originalSupabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        }).catch(err => console.warn("[Auth] Failed to set originalSupabase session:", err));

        // Trigger background clone of remote data to stay up-to-date!
        cloneRemoteData(session.user.id).catch(console.error);
      }
      return { data: { session }, error: null };
    }
    // Try remote client
    const { data, error } = await originalSupabase.auth.getSession();
    if (data && data.session) {
      saveLocalSession(data.session);
      if (data.session.user) {
        // Trigger background clone of remote data to stay up-to-date!
        cloneRemoteData(data.session.user.id).catch(console.error);
      }
      return { data: { session: data.session }, error: null };
    }
    return { data: { session: null }, error: null };
  },

  onAuthStateChange: (callback: (event: any, session: any) => void) => {
    authListeners.push(callback);
    
    // Trigger initial auth check
    const session = getLocalSession();
    if (session) {
      originalSupabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }).catch(() => {});
    }

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

// Local mock Storage Object
const localStorageProxy = {
  from: (bucket: string) => ({
    upload: async (filePath: string, file: any, options?: any) => {
      try {
        const fullPath = `${bucket}/${filePath}`;
        await saveLocalFile(fullPath, file);
        console.log(`[Storage] Uploaded ${fullPath} locally to IndexedDB`);
        
        // Propagate file upload to local server in background if online
        if (navigator.onLine) {
          fetch(`${getServerUrl()}/api/upload`, {
            method: 'POST',
            headers: {
              'x-file-path': `${bucket}/${filePath}`,
              'Content-Type': 'application/octet-stream'
            },
            body: file
          }).then(async (res) => {
            if (res.ok) {
              console.log(`[Storage] Successfully synced ${fullPath} to local server`);
            } else {
              console.warn(`[Storage] Failed to sync ${fullPath} to local server:`, res.statusText);
            }
          }).catch(err => {
            console.warn(`[Storage] Failed to sync ${fullPath} to local server:`, err);
          });
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
          store.delete(`${bucket}/${p}`);
        }
        
        // Propagate deletion to remote Supabase storage in background if authenticated
        originalSupabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            originalSupabase.storage.from(bucket).remove(paths).catch(err => {
              console.warn(`[Storage] Failed to remove ${paths} from remote storage:`, err);
            });
          }
        }).catch(() => {});

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
      // Delegate Edge Functions invocation to the original remote client
      console.log(`[Functions] Invoking Edge Function "${functionName}" via original Supabase client`);
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

// Synchronize remote client auth changes back to local storage session cache
originalSupabase.auth.onAuthStateChange((event, session) => {
  console.log(`[Auth Sync] Remote auth state change event: ${event}`);
  if (session) {
    const currentSession = getLocalSession();
    // Prevent infinite recursion loops by only triggering updates when the token has actually changed
    if (currentSession && currentSession.access_token === session.access_token) {
      return;
    }
    
    const localSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user
    };
    saveLocalSession(localSession);
    triggerAuthEvent(event as any, localSession);
  } else {
    // Only clear session if we are online and truly signed out remotely
    if (navigator.onLine && (event === 'SIGNED_OUT' || event === 'USER_DELETED')) {
      saveLocalSession(null);
      triggerAuthEvent('SIGNED_OUT', null);
    }
  }
});
