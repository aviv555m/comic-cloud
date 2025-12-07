import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface OfflineBook {
  id: string;
  title: string;
  author: string | null;
  file_type: string;
  cover_url: string | null;
  last_page_read: number | null;
  cachedAt: number;
  fileSize: number;
}

const DB_NAME = 'comic-cloud-offline';
const DB_VERSION = 1;
const BOOKS_STORE = 'offline-books';
const FILES_STORE = 'offline-files';

export function useOfflineBooks() {
  const [offlineBooks, setOfflineBooks] = useState<OfflineBook[]>([]);
  const [downloadingBooks, setDownloadingBooks] = useState<Set<string>>(new Set());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
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

  // Open IndexedDB
  const openDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE, { keyPath: 'bookId' });
        }
      };
    });
  }, []);

  // Load offline books list
  const loadOfflineBooks = useCallback(async () => {
    try {
      const db = await openDB();
      const transaction = db.transaction(BOOKS_STORE, 'readonly');
      const store = transaction.objectStore(BOOKS_STORE);
      
      const request = store.getAll();
      
      request.onsuccess = () => {
        setOfflineBooks(request.result || []);
      };
    } catch (error) {
      console.error('Failed to load offline books:', error);
    }
  }, [openDB]);

  useEffect(() => {
    loadOfflineBooks();
  }, [loadOfflineBooks]);

  // Save book for offline reading
  const saveBookOffline = useCallback(async (book: {
    id: string;
    title: string;
    author: string | null;
    file_url: string;
    file_type: string;
    cover_url: string | null;
    last_page_read: number | null;
  }) => {
    setDownloadingBooks(prev => new Set(prev).add(book.id));
    
    try {
      // Fetch the book file
      const response = await fetch(book.file_url);
      if (!response.ok) throw new Error('Failed to download book file');
      
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      // Optionally cache cover image
      let coverBlob: ArrayBuffer | null = null;
      if (book.cover_url) {
        try {
          const coverResponse = await fetch(book.cover_url);
          if (coverResponse.ok) {
            const coverBlobData = await coverResponse.blob();
            coverBlob = await coverBlobData.arrayBuffer();
          }
        } catch (e) {
          console.log('Failed to cache cover, continuing without it');
        }
      }
      
      const db = await openDB();
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
  }, [openDB, loadOfflineBooks, toast]);

  // Remove book from offline storage
  const removeBookOffline = useCallback(async (bookId: string) => {
    try {
      const db = await openDB();
      const transaction = db.transaction([BOOKS_STORE, FILES_STORE], 'readwrite');
      
      transaction.objectStore(BOOKS_STORE).delete(bookId);
      transaction.objectStore(FILES_STORE).delete(bookId);
      
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
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
  }, [openDB, loadOfflineBooks, toast]);

  // Get offline file for reading
  const getOfflineFile = useCallback(async (bookId: string): Promise<Blob | null> => {
    try {
      const db = await openDB();
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
  }, [openDB]);

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
      const db = await openDB();
      const transaction = db.transaction([BOOKS_STORE, FILES_STORE], 'readwrite');
      
      transaction.objectStore(BOOKS_STORE).clear();
      transaction.objectStore(FILES_STORE).clear();
      
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
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
  }, [openDB, toast]);

  return {
    offlineBooks,
    isOnline,
    saveBookOffline,
    removeBookOffline,
    getOfflineFile,
    isBookOffline,
    isBookDownloading,
    getTotalStorageUsed,
    clearAllOfflineData,
  };
}
