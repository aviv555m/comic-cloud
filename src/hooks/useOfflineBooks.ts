import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { openLocalDB } from '@/lib/local-supabase';

interface OfflineBook {
  id: string;
  title: string;
  author: string | null;
  file_type: string;
  cover_url: string | null;
  last_page_read: number | null;
  cachedAt: number;
  fileSize: number;
  series?: string | null;
}

const DB_NAME = 'comic-cloud-offline';
const DB_VERSION = 2;
const BOOKS_STORE = 'offline-books';
const FILES_STORE = 'offline-files';
const LOCAL_FILES_STORE = 'local-files';

export function useOfflineBooks() {
  const [offlineBooks, setOfflineBooks] = useState<OfflineBook[]>([]);
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isReady, setIsReady] = useState(false);
  const { toast } = useToast();

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load offline books list
  const loadOfflineBooks = useCallback(async () => {
    try {
      const db = await openLocalDB();
      const transaction = db.transaction(BOOKS_STORE, 'readonly');
      const booksStore = transaction.objectStore(BOOKS_STORE);
      
      const request = booksStore.getAll();
      
      request.onsuccess = async () => {
        const booksList = request.result || [];
        const processedBooks: OfflineBook[] = [];
        
        for (const book of booksList) {
          const fileRecord = await new Promise<any>(async (resolve) => {
            try {
              const readDb = await openLocalDB();
              const readTx = readDb.transaction(FILES_STORE, 'readonly');
              const readStore = readTx.objectStore(FILES_STORE);
              const fileRequest = readStore.get(book.id);
              fileRequest.onsuccess = () => resolve(fileRequest.result);
              fileRequest.onerror = () => resolve(null);
            } catch (err) {
              resolve(null);
            }
          });
          
          if (!fileRecord || !fileRecord.data) {
            try {
              const writeDb = await openLocalDB();
              const writeTx = writeDb.transaction(BOOKS_STORE, 'readwrite');
              const writeStore = writeTx.objectStore(BOOKS_STORE);
              writeStore.delete(book.id);
            } catch (err) {
              console.warn("Failed to delete corrupted offline book metadata:", err);
            }
            continue;
          }

          let coverUrl = book.cover_url;
          if (fileRecord?.coverData) {
            let binary = '';
            const bytes = new Uint8Array(fileRecord.coverData);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64String = window.btoa(binary);
            coverUrl = `data:image/jpeg;base64,${base64String}`;
          }
          
          processedBooks.push({
            ...book,
            cover_url: coverUrl
          });
        }
        
        setOfflineBooks(processedBooks);
        setIsReady(true);
      };
    } catch (error) {
      console.error('Failed to load offline books:', error);
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    loadOfflineBooks();
  }, [loadOfflineBooks]);

  // Async check if book exists in IndexedDB (doesn't depend on state)
  const checkBookOfflineAsync = useCallback(async (bookId: string): Promise<boolean> => {
    try {
      const db = await openLocalDB();
      const transaction = db.transaction(BOOKS_STORE, 'readonly');
      const store = transaction.objectStore(BOOKS_STORE);
      
      return new Promise((resolve) => {
        const request = store.get(bookId);
        request.onsuccess = () => {
          resolve(!!request.result);
        };
        request.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }, []);

  // Async get offline book metadata directly from IndexedDB
  const getOfflineBookAsync = useCallback(async (bookId: string): Promise<OfflineBook | null> => {
    try {
      const db = await openLocalDB();
      const transaction = db.transaction(BOOKS_STORE, 'readonly');
      const store = transaction.objectStore(BOOKS_STORE);
      
      return new Promise((resolve) => {
        const request = store.get(bookId);
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }, []);

  // Save book for offline reading
  const saveBookOffline = useCallback(async (book: {
    id: string;
    title: string;
    author: string | null;
    file_url: string;
    file_type: string;
    cover_url: string | null;
    last_page_read: number | null;
    series?: string | null;
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      toast({
        variant: 'destructive',
        title: 'Sign in required',
        description: 'You must have an account to save books offline.',
      });
      return;
    }
    setDownloadingBooks(prev => new Set(prev).add(book.id));

    try {
      // Try the stored file_url first; if it 4xx's (expired signed URL), ask the
      // backend to mint a fresh signed URL from the storage path embedded in the URL.
      const fetchWithRetry = async (url: string): Promise<Response> => {
        const first = await fetch(url).catch(() => null);
        if (first && first.ok) return first;

        try {
          const { supabase } = await import('@/integrations/supabase/client');
          const parts = url.split('/book-files/');
          const path = parts[1] ? parts[1].split('?')[0] : null;
          if (path) {
            const { data } = await supabase.storage
              .from('book-files')
              .createSignedUrl(decodeURIComponent(path), 60 * 60 * 24 * 7);
            if (data?.signedUrl) {
              const retry = await fetch(data.signedUrl);
              if (retry.ok) return retry;
            }
          }
        } catch (e) {
          console.warn('Signed URL refresh failed', e);
        }
        throw new Error('Failed to download book file (URL may be expired)');
      };

      const response = await fetchWithRetry(book.file_url);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      // Optionally cache cover image
      let coverBlob: ArrayBuffer | null = null;
      if (book.cover_url) {
        const fetchUrl = book.cover_url.startsWith('/') 
          ? `${window.location.origin}${book.cover_url}` 
          : book.cover_url;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
          const coverResponse = await fetch(fetchUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (coverResponse.ok) {
            const coverBlobData = await coverResponse.blob();
            coverBlob = await coverBlobData.arrayBuffer();
          }
        } catch (e) {
          clearTimeout(timeoutId);
          console.log('Failed to cache cover, continuing without it:', e);
        }
      }
      
      const db = await openLocalDB();
      const transaction = db.transaction([BOOKS_STORE, FILES_STORE], 'readwrite');
      
      // Save book metadata
      const booksStore = transaction.objectStore(BOOKS_STORE);
      const offlineBook: OfflineBook = {
        id: book.id,
        title: book.title,
        author: book.author,
        file_type: book.file_type,
        cover_url: book.cover_url,
        last_page_read: book.last_page_read,
        cachedAt: Date.now(),
        fileSize: arrayBuffer.byteLength,
        series: book.series || null,
      };
      booksStore.put(offlineBook);
      
      // Save book file
      const filesStore = transaction.objectStore(FILES_STORE);
      filesStore.put({
        bookId: book.id,
        data: arrayBuffer,
        coverData: coverBlob,
        contentType: `application/${book.file_type}`,
      });
      
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      
      await loadOfflineBooks();
      
      toast({
        title: 'Saved for offline',
        description: `"${book.title}" is now available offline`,
      });
    } catch (error: any) {
      console.error('Failed to save book offline:', error);
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: error.message || 'Could not save book for offline reading',
      });
    } finally {
      setDownloadingBooks(prev => {
        const next = new Set(prev);
        next.delete(book.id);
        return next;
      });
    }
  }, [loadOfflineBooks, toast]);

  // Remove book from offline storage
  const removeBookOffline = useCallback(async (bookId: string) => {
    try {
      const db = await openLocalDB();
      const transaction = db.transaction([BOOKS_STORE, FILES_STORE], 'readwrite');
      
      transaction.objectStore(BOOKS_STORE).delete(bookId);
      transaction.objectStore(FILES_STORE).delete(bookId);
      
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      
      await loadOfflineBooks();
      
      toast({
        title: 'Removed from offline',
        description: 'Book removed from offline storage',
      });
    } catch (error) {
      console.error('Failed to remove offline book:', error);
    }
  }, [loadOfflineBooks, toast]);

  // Get offline file for reading
  const getOfflineFile = useCallback(async (bookId: string): Promise<Blob | null> => {
    try {
      const db = await openLocalDB();
      const transaction = db.transaction(FILES_STORE, 'readonly');
      const store = transaction.objectStore(FILES_STORE);
      
      return new Promise((resolve, reject) => {
        const request = store.get(bookId);
        request.onsuccess = () => {
          if (request.result?.data) {
            const blob = new Blob([request.result.data], { 
              type: request.result.contentType 
            });
            resolve(blob);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get offline file:', error);
      return null;
    }
  }, []);

  // Check if book is available offline
  const isBookOffline = useCallback((bookId: string): boolean => {
    return offlineBooks.some(book => book.id === bookId);
  }, [offlineBooks]);

  // Check if book is currently downloading
  const isBookDownloading = useCallback((bookId: string): boolean => {
    return downloadingBooks.has(bookId);
  }, [downloadingBooks]);

  // Get total offline storage used
  const getTotalStorageUsed = useCallback((): number => {
    return offlineBooks.reduce((total, book) => total + book.fileSize, 0);
  }, [offlineBooks]);

  // Clear all offline data
  const clearAllOfflineData = useCallback(async () => {
    try {
      const db = await openLocalDB();
      const transaction = db.transaction([BOOKS_STORE, FILES_STORE], 'readwrite');
      
      transaction.objectStore(BOOKS_STORE).clear();
      transaction.objectStore(FILES_STORE).clear();
      
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      
      setOfflineBooks([]);
      
      toast({
        title: 'Storage cleared',
        description: 'All offline books have been removed',
      });
    } catch (error) {
      console.error('Failed to clear offline data:', error);
    }
  }, [toast]);

  return {
    offlineBooks,
    isOnline,
    isReady,
    saveBookOffline,
    removeBookOffline,
    getOfflineFile,
    isBookOffline,
    checkBookOfflineAsync,
    getOfflineBookAsync,
    isBookDownloading,
    getTotalStorageUsed,
    clearAllOfflineData,
  };
}
