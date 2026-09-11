import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { 
  ChevronLeft, 
  ChevronRight, 
  Settings2, 
  Maximize, 
  Minimize,
  ArrowLeft,
  BookOpen,
  StickyNote,
  CloudOff,
  Loader2
} from "lucide-react";
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { EpubReader } from "@/components/EpubReader";
import { ComicReader } from "@/components/ComicReader";
import { AnnotationPanel } from "@/components/AnnotationPanel";
import { HighlightMenu } from "@/components/HighlightMenu";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import { openLocalDB, getServerUrl, originalSupabase } from "@/lib/local-supabase";
import { ChapterNavigation, Chapter } from "@/components/ChapterNavigation";
import { Badge } from "@/components/ui/badge";
import { NarrationControls } from "@/components/NarrationControls";
import { ScrollModePDF, ScrollModePDFHandle } from "@/components/ScrollModePDF";
import { ReadingTimer } from "@/components/ReadingTimer";
import { ReaderPagePill } from "@/components/reader/ReaderPagePill";
import { ReaderProgressBar } from "@/components/reader/ReaderProgressBar";
import { ReaderSettingsSheet } from "@/components/reader/ReaderSettingsSheet";

// Configure PDF.js worker. It is bundled rather than pulled from unpkg: the CDN is
// not in the site's script-src, so the CDN worker was blocked outright ("Failed to
// fetch dynamically imported module"), and a remote worker could never work offline
// or inside the Android app.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Book {
  id: string;
  title: string;
  author: string | null;
  file_url: string;
  file_type: string;
  last_page_read: number;
  total_pages: number | null;
  user_id: string;
  series?: string | null;
  tts_position?: Record<string, any> | null;
}

const Reader = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOnline, getOfflineFile, checkBookOfflineAsync, getOfflineBookAsync } = useOfflineBooks();
  
  const [book, setBook] = useState<Book | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(typeof window !== "undefined" && window.innerWidth < 768 ? 1.5 : 1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string>("");
  const [signedUrl, setSignedUrl] = useState<string | ArrayBuffer>("");
  // Surfaced to the user: "Failed to load PDF" on its own gives nothing to act on.
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfTextContent, setPdfTextContent] = useState<string>("");
  const [readingMode, setReadingMode] = useState<"page" | "scroll">("scroll");
  const [initialEpubCfi, setInitialEpubCfi] = useState<string | undefined>(undefined);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [showOverlayPage, setShowOverlayPage] = useState(false);
  const pageNumTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [pageInput, setPageInput] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [comicTotalPages, setComicTotalPages] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [txtProgress, setTxtProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (typeof signedUrl === 'string' && signedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(signedUrl);
      }
    };
  }, [signedUrl]);

  useEffect(() => {
    if (book?.file_type === 'pdf') {
      setShowOverlayPage(true);
      if (pageNumTimerRef.current) {
        clearTimeout(pageNumTimerRef.current);
      }
      pageNumTimerRef.current = setTimeout(() => {
        setShowOverlayPage(false);
      }, 2000);
    }
    return () => {
      if (pageNumTimerRef.current) {
        clearTimeout(pageNumTimerRef.current);
      }
    };
  }, [currentPage, book?.file_type]);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [highlightMenuPos, setHighlightMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReadingOffline, setIsReadingOffline] = useState(false);
  const [checkingOffline, setCheckingOffline] = useState(true);
  const [pdfChapters, setPdfChapters] = useState<Chapter[]>([]);
  const [siblingBooks, setSiblingBooks] = useState<Book[]>([]);
  const [readerTheme, setReaderTheme] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  });

  const getChapterNumber = (title: string): number => {
    const match = title.match(/(?:ch|chapter)\.?[^\d]*([0-9.]+)/i);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) return val;
    }
    const cleanTitle = title.replace(/(?:vol|volume)\.?[^\d]*[0-9.]+/i, "");
    const anyNum = cleanTitle.match(/([0-9.]+)/);
    if (anyNum && anyNum[1]) {
      const val = parseFloat(anyNum[1]);
      if (!isNaN(val)) return val;
    }
    const fallbackNum = title.match(/([0-9.]+)/);
    if (fallbackNum && fallbackNum[1]) {
      const val = parseFloat(fallbackNum[1]);
      if (!isNaN(val)) return val;
    }
    return 0;
  };

  const fetchSiblingBooks = async (seriesName: string, userId: string) => {
    try {
      let booksList: any[] = [];
      
      // 1. Try querying Supabase (proxies locally if offline)
      try {
        const { data, error } = await supabase
          .from("books")
          .select("*")
          .eq("series", seriesName)
          .eq("file_type", "cbz");
          
        if (!error && data && data.length > 0) {
          booksList = data;
        }
      } catch (e) {
        console.warn("Supabase sibling query failed, will try IndexedDB:", e);
      }
      
      // 2. Also fetch from IndexedDB offline-books store to ensure offline downloads are listed
      try {
        const db = await openLocalDB();
        const transaction = db.transaction("offline-books", "readonly");
        const store = transaction.objectStore("offline-books");
        const request = store.getAll();
        
        const idbBooks = await new Promise<any[]>((resolve) => {
          request.onsuccess = () => {
            const list = request.result || [];
            const cleanSeries = seriesName.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
            const matched = list.filter((b: any) => {
              if (b.file_type !== "cbz") return false;
              const cleanBookSeries = b.series ? b.series.toLowerCase().replace(/[^a-z0-9]/g, "").trim() : "";
              const cleanBookTitle = b.title ? b.title.toLowerCase().replace(/[^a-z0-9]/g, "").trim() : "";
              return cleanBookSeries === cleanSeries || cleanBookTitle.includes(cleanSeries);
            });
            resolve(matched);
          };
          request.onerror = () => resolve([]);
        });
        
        const existingIds = new Set(booksList.map(b => b.id));
        for (const idbBook of idbBooks) {
          if (!existingIds.has(idbBook.id)) {
            booksList.push({
              id: idbBook.id,
              title: idbBook.title,
              author: idbBook.author,
              series: idbBook.series,
              file_url: idbBook.file_url || "",
              file_type: idbBook.file_type,
              last_page_read: idbBook.last_page_read || 0,
              total_pages: null,
              user_id: userId || "",
            });
          }
        }
      } catch (idbErr) {
        console.warn("IndexedDB sibling query failed:", idbErr);
      }
      
      // Sort chronologically using getChapterNumber
      const sorted = [...booksList].sort((a, b) => {
        const numA = getChapterNumber(a.title);
        const numB = getChapterNumber(b.title);
        if (numA !== numB) {
          return numA - numB;
        }
        return a.title.localeCompare(b.title, undefined, { numeric: true });
      });
      
      setSiblingBooks(sorted);
    } catch (err) {
      console.error("fetchSiblingBooks failed:", err);
    }
  };
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionStartTime = useRef<Date>(new Date());
  const startPageRef = useRef<number>(1);
  const lastUpdateRef = useRef<Date>(new Date());
  const scrollModePDFRef = useRef<ScrollModePDFHandle>(null);
  // The session handlers below are registered once and outlive their closures, so they read refs
  const sessionIdRef = useRef<string | null>(null);
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(360);

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('a') || 
      target.closest('[role="button"]') ||
      target.closest('.interactive-element') ||
      target.closest('.chapter-nav-trigger')
    ) {
      return;
    }

    // If text is selected, do not trigger page turning
    if (window.getSelection()?.toString().trim()) {
      return;
    }

    // PDF page mode navigation support
    if (book?.file_type === 'pdf' && readingMode === 'page') {
      const clickX = e.clientX;
      const width = window.innerWidth;
      
      if (clickX < width * 0.3) {
        if (currentPage > 1) changePage(-1);
      } else if (clickX > width * 0.7) {
        if (numPages && currentPage < numPages) changePage(1);
      } else {
        setShowControls(prev => !prev);
      }
    } else {
      setShowControls(prev => !prev);
    }
  };

  useEffect(() => {
    const measure = () => {
      const h = headerRef.current?.getBoundingClientRect().height ?? 0;
      setHeaderHeight(h);

      const w = window.innerWidth;
      if (w < 768) {
        setContainerWidth(Math.round(w * 0.9));
      } else {
        setContainerWidth(Math.min(800, Math.round(w * 0.8)));
      }
    };

    // The header only mounts once the book resolves, so measure again then
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [book?.id]);


  // Start reading session
  const startReadingSession = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !bookId) return;

    const { data } = await supabase
      .from("reading_sessions")
      .insert({
        book_id: bookId,
        user_id: user.id,
        start_time: new Date().toISOString(),
        pages_read: 0,
      })
      .select()
      .single();

    if (data) {
      setSessionId(data.id);
      sessionIdRef.current = data.id;
      sessionStartTime.current = new Date();
      startPageRef.current = currentPageRef.current;
      lastUpdateRef.current = new Date();
    }
  }, [bookId]);

  // Update session periodically
  const updateSessionProgress = useCallback(async () => {
    if (!sessionIdRef.current) return;

    const now = new Date();
    const durationMinutes = Math.max(1, Math.round(
      (now.getTime() - sessionStartTime.current.getTime()) / 60000
    ));
    const pagesRead = Math.max(1, Math.abs(currentPageRef.current - startPageRef.current));

    await supabase
      .from("reading_sessions")
      .update({
        end_time: now.toISOString(),
        duration_minutes: durationMinutes,
        pages_read: pagesRead,
      })
      .eq("id", sessionIdRef.current);
    
    lastUpdateRef.current = now;
  }, []);

  // End reading session
  const endReadingSession = useCallback(async () => {
    if (!sessionIdRef.current) return;

    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.round(
      (endTime.getTime() - sessionStartTime.current.getTime()) / 60000
    ));
    const pagesRead = Math.max(1, Math.abs(currentPageRef.current - startPageRef.current));

    await supabase
      .from("reading_sessions")
      .update({
        end_time: endTime.toISOString(),
        duration_minutes: durationMinutes,
        pages_read: pagesRead,
      })
      .eq("id", sessionIdRef.current);
  }, []);

  useEffect(() => {
    if (!bookId) return;
    fetchBook();
    startReadingSession();

    // Periodic session updates every 30 seconds
    const updateInterval = setInterval(() => {
      updateSessionProgress();
    }, 30000);

    // Handle visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        updateSessionProgress();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Handle page unload
    const handleUnload = () => {
      endReadingSession();
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(updateInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
      endReadingSession();
    };
  }, [bookId]);

  useEffect(() => {
    const handleSelection = (e: MouseEvent) => {
      // Interacting with the popup collapses the selection - don't let that unmount it mid-click
      if ((e.target as HTMLElement)?.closest?.("[data-highlight-menu]")) return;

      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 0 && book?.file_type === 'pdf') {
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
        const rect = range?.getBoundingClientRect();
        
        if (rect) {
          setSelectedText(text);
          setHighlightMenuPos({
            x: rect.left + rect.width / 2 - 160,
            y: rect.top - 10,
          });
        }
      } else {
        setHighlightMenuPos(null);
      }
    };

    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, [book]);

  // Fetch saved EPUB CFI location from the local-only reading_locations database table
  useEffect(() => {
    if (!book || book.file_type !== 'epub') {
      setLoadingLocation(false);
      return;
    }
    
    const loadLocation = async () => {
      try {
        const localCfi = localStorage.getItem(`epub_cfi_${book.id}`);
        if (localCfi) {
          setInitialEpubCfi(localCfi);
          setLoadingLocation(false);
          return;
        }

        // Try book.tts_position (synced from remote DB!)
        if (book.tts_position && typeof book.tts_position === 'object') {
          const ttsObj = book.tts_position as Record<string, any>;
          if (ttsObj.epub_cfi) {
            setInitialEpubCfi(ttsObj.epub_cfi);
            setLoadingLocation(false);
            return;
          }
        }

        const { data: locData } = await supabase
          .from("reading_locations")
          .select("cfi_location")
          .eq("book_id", book.id)
          .maybeSingle();
        if (locData?.cfi_location) {
          setInitialEpubCfi(locData.cfi_location);
        }
      } catch (e) {
        console.warn("Failed to load local EPUB cfi location:", e);
      } finally {
        setLoadingLocation(false);
      }
    };
    
    loadLocation();
  }, [book?.id]);

  const fetchBook = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user && Capacitor.isNativePlatform() && navigator.onLine) {
      navigate("/auth");
      return;
    }
    setCheckingOffline(true);
    setComicTotalPages(null);
    setPdfChapters([]);
    
    try {
      // Check if we're offline first
      const currentlyOnline = navigator.onLine;
      
      // Check if book is available in offline storage
      const hasOfflineCopy = bookId ? await checkBookOfflineAsync(bookId) : false;
      setCheckingOffline(false);
      
      // If offline, we MUST use offline copy
      if (!currentlyOnline) {
        if (hasOfflineCopy && bookId) {
          const offlineFile = await getOfflineFile(bookId);
          if (offlineFile) {
            // Do NOT use URL.createObjectURL to avoid CORS/Worker issues in Capacitor
            // Pass the Blob directly to components
            const arrayBuffer = await offlineFile.arrayBuffer();
            setSignedUrl(arrayBuffer);
            setIsReadingOffline(true);
            // Try to get book metadata from database (may fail if offline)
            try {
              const { data } = await supabase
                .from("books")
                .select("*")
                .eq("id", bookId)
                .maybeSingle();
                
              if (data) {
                if (data.file_type === 'manga') {
                  navigate(`/manga?url=${encodeURIComponent(data.file_url)}&source=${(data.author || '').toLowerCase()}&title=${encodeURIComponent(data.title)}&offline=true&id=${bookId}`);
                  return;
                }
                setBook(data);
                setCurrentPage(data.last_page_read || 1);
                setReadingMode(data.reading_mode as "page" | "scroll" || "scroll");
                if (data.file_type === 'txt') {
                  const decoder = new TextDecoder('utf-8');
                  setTextContent(decoder.decode(arrayBuffer));
                }
                if (data.series) {
                  fetchSiblingBooks(data.series, data.user_id);
                }
              } else {
                const offlineMeta = await getOfflineBookAsync(bookId);
                if (offlineMeta) {
                  if (offlineMeta.file_type === 'manga') {
                    navigate(`/manga?url=${encodeURIComponent(offlineMeta.file_url || '')}&source=${(offlineMeta.author || '').toLowerCase()}&title=${encodeURIComponent(offlineMeta.title)}&offline=true&id=${bookId}`);
                    return;
                  }
                  
                  setBook({
                    id: offlineMeta.id,
                    title: offlineMeta.title,
                    author: offlineMeta.author,
                    series: offlineMeta.series || null,
                    cover_url: offlineMeta.cover_url,
                    file_url: "",
                    file_type: offlineMeta.file_type,
                    is_public: false,
                    is_completed: false,
                    reading_progress: 0,
                    last_page_read: offlineMeta.last_page_read || 0,
                    total_pages: null,
                    file_size: offlineMeta.fileSize,
                    created_at: new Date(offlineMeta.cachedAt).toISOString(),
                    user_id: "",
                  } as any);
                  setCurrentPage(offlineMeta.last_page_read || 1);
                  if (offlineMeta.file_type === 'txt') {
                    const decoder = new TextDecoder('utf-8');
                    setTextContent(decoder.decode(arrayBuffer));
                  }
                  if (offlineMeta.series) {
                    fetchSiblingBooks(offlineMeta.series, "");
                  }
                }
              }
            } catch {
              // Try reading from offline books store
              const offlineMeta = await getOfflineBookAsync(bookId);
              if (offlineMeta) {
                if (offlineMeta.file_type === 'manga') {
                  navigate(`/manga?url=${encodeURIComponent(offlineMeta.file_url || '')}&source=${(offlineMeta.author || '').toLowerCase()}&title=${encodeURIComponent(offlineMeta.title)}&offline=true&id=${bookId}`);
                  return;
                }

                setBook({
                  id: offlineMeta.id,
                  title: offlineMeta.title,
                  author: offlineMeta.author,
                  series: offlineMeta.series || null,
                  cover_url: offlineMeta.cover_url,
                  file_url: "",
                  file_type: offlineMeta.file_type,
                  is_public: false,
                  is_completed: false,
                  reading_progress: 0,
                  last_page_read: offlineMeta.last_page_read || 0,
                  total_pages: null,
                  file_size: offlineMeta.fileSize,
                  created_at: new Date(offlineMeta.cachedAt).toISOString(),
                  user_id: "",
                } as any);
                setCurrentPage(offlineMeta.last_page_read || 1);
                if (offlineMeta.series) {
                  fetchSiblingBooks(offlineMeta.series, "");
                }
                if (offlineMeta.file_type === 'txt') {
                  const decoder = new TextDecoder('utf-8');
                  setTextContent(decoder.decode(arrayBuffer));
                }
              }
            }
            
            setLoading(false);
            
            toast({
              title: "Reading offline",
              description: "Book loaded from offline storage",
            });
            return;
          }
        }
        
        // Offline but no cached copy - show error and navigate away
        toast({
          variant: "destructive",
          title: "Offline",
          description: "This book is not available offline. Save it for offline reading first.",
        });
        navigate("/");
        return;
      }
      
      // Online - local mirror first, then the hosted library for another member's public book
      const { data: localBook, error: localError } = await supabase
        .from("books")
        .select("*")
        .eq("id", bookId)
        .maybeSingle();

      let data: any = localBook;
      let isPublicBook = false;

      if (!data) {
        const { data: publicBook } = await originalSupabase
          .from("books")
          .select("*")
          .eq("id", bookId)
          .eq("is_public", true)
          .maybeSingle();

        if (publicBook) {
          // Someone else's shared book - read-only here, so don't inherit the owner's page
          data = { ...publicBook, last_page_read: 0 };
          isPublicBook = true;
        }
      }

      if (!data) throw localError || new Error("Book not found");
      
      if (data.file_type === "manga") {
        navigate(`/manga?url=${encodeURIComponent(data.file_url)}&source=${(data.author || '').toLowerCase()}&title=${encodeURIComponent(data.title)}`);
        return;
      }
      
      setBook(data);
      setCurrentPage(data.last_page_read || 1);
      setReadingMode(data.reading_mode as "page" | "scroll" || "scroll");
      setIsReadingOffline(false); // Explicitly set to false for online reads
      if (data.series) {
        fetchSiblingBooks(data.series, data.user_id);
      }

      if (isPublicBook) {
        // The row came from hosted Supabase, so sign its file there rather than on the local server
        let publicUrl: string = data.file_url;
        const publicParts = String(publicUrl || "").split('/book-files/');
        const publicPath = publicParts[1] ? publicParts[1].split('?')[0] : data.file_url;

        if (publicPath) {
          try {
            const { data: remoteSigned, error: remoteSignedError } = await originalSupabase.storage
              .from('book-files')
              .createSignedUrl(decodeURIComponent(publicPath), 60 * 60 * 4);
            if (!remoteSignedError && remoteSigned?.signedUrl) {
              publicUrl = remoteSigned.signedUrl;
            }
          } catch (err) {
            console.warn("Failed to sign public book URL:", err);
          }
        }

        setSignedUrl(publicUrl);

        if (data.file_type === 'txt') {
          const response = await fetch(publicUrl);
          setTextContent(await response.text());
        }

        setLoading(false);
        return;
      }
      
      // Dynamically generate a fresh signed URL if online to avoid expired URL issues
      let fileUrl = data.file_url;
      let filePath = data.file_url;
      
      // If it's a relative path, prepend the server URL
      if (fileUrl && !fileUrl.startsWith('http') && !fileUrl.startsWith('blob:') && !fileUrl.startsWith('data:')) {
        fileUrl = `${getServerUrl()}/uploads/book-files/${fileUrl}`;
      } else {
        const fileParts = fileUrl.split('/book-files/');
        filePath = fileParts[1] ? fileParts[1].split('?')[0] : data.file_url;
      }
      
      if (filePath) {
        try {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('book-files')
            .createSignedUrl(decodeURIComponent(filePath), 60 * 60 * 4); // 4 hours
          if (!signedError && signedData?.signedUrl) {
            fileUrl = signedData.signedUrl;
          }
        } catch (err) {
          console.error("Failed to generate fresh signed URL:", err);
        }
      }

      if (fileUrl && session?.access_token && !fileUrl.startsWith('blob:') && !fileUrl.startsWith('data:')) {
        fileUrl += (fileUrl.includes('?') ? '&' : '?') + `token=${session.access_token}`;
      }

      // Self-healing: verify if file exists on server disk
      if (currentlyOnline && fileUrl && !fileUrl.startsWith('blob:') && !fileUrl.startsWith('data:')) {
        try {
          const testRes = await fetch(fileUrl, { method: 'HEAD' });
          const contentType = testRes.headers.get('content-type') || '';
          if (testRes.status === 404 || contentType.includes('text/html')) {
            console.log("[Reader] File not found on server (404 or HTML fallback). Checking local offline cache for upload...");
            const fileBlob = await getOfflineFile(data.id);
            if (fileBlob) {
              console.log("[Reader] Found local file blob. Syncing to server disk...");
              const uploadRes = await fetch(`${getServerUrl()}/api/upload`, {
                method: 'POST',
                headers: {
                  'x-file-path': `book-files/${decodeURIComponent(filePath || '')}`,
                  'Content-Type': 'application/octet-stream'
                },
                body: fileBlob
              });
              if (uploadRes.ok) {
                console.log("[Reader] Self-healing file upload succeeded. Retrying loader...");
                const cacheBuster = (fileUrl.includes('?') ? '&' : '?') + 'healed=' + Date.now();
                setSignedUrl(fileUrl + cacheBuster);
                setLoading(false);
                return;
              }
            } else {
              // Fallback to remote Supabase Storage for existing files
              console.log("[Reader] No local cache found. Falling back to remote Supabase Storage...");
              try {
                const { data: remoteSigned, error: remoteSignedError } = await originalSupabase.storage
                  .from('book-files')
                  .createSignedUrl(decodeURIComponent(filePath || ''), 60 * 60 * 4);
                if (!remoteSignedError && remoteSigned?.signedUrl) {
                  console.log("[Reader] Resolved remote signed URL fallback.");
                  fileUrl = remoteSigned.signedUrl;
                }
              } catch (remoteErr) {
                console.warn("Failed to generate remote signed URL fallback:", remoteErr);
              }
            }
          }
        } catch (headErr) {
          console.warn("Failed to check server file availability:", headErr);
        }
      }

      setSignedUrl(fileUrl);
      
      // If it's a text file, fetch and display content
      if (data.file_type === 'txt') {
        const response = await fetch(fileUrl);
        const text = await response.text();
        setTextContent(text);
      }
      
      setLoading(false);
    } catch (error: any) {
      setCheckingOffline(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load book",
      });
      navigate("/");
    }
  };

  // progressPage lets 0-based readers (comics) keep a 0-based last_page_read while the
  // percentage still counts the page the reader is on as read
  const updateProgress = async (page: number, total?: number, progressPage?: number) => {
    if (!book) return;
    
    // Comics never report a page count, so a missing total must not be treated as a 1-page book
    const totalPages = total || numPages || book.total_pages;
    const payload: Record<string, any> = { last_page_read: page };
    
    if (totalPages) {
      const progress = Math.min(100, Math.round(((progressPage ?? page) / totalPages) * 100));
      payload.reading_progress = progress;
      payload.is_completed = progress >= 98;
    }
    
    await supabase
      .from("books")
      .update(payload)
      .eq("id", book.id);
  };

  const toggleReadingMode = async () => {
    if (!book) return;
    const newMode = readingMode === "page" ? "scroll" : "page";
    setReadingMode(newMode);
    
    await supabase
      .from("books")
      .update({ reading_mode: newMode })
      .eq("id", book.id);
  };

  const jumpToPage = () => {
    const page = parseInt(pageInput);
    if (page >= 1 && numPages && page <= numPages) {
      if (readingMode === "scroll" && scrollModePDFRef.current) {
        scrollModePDFRef.current.scrollToPage(page);
      } else {
        setCurrentPage(page);
      }
      updateProgress(page, numPages);
      setPageInput("");
      setSettingsOpen(false);
    }
  };

  const seekToPercent = (percent: number) => {
    if (!numPages) return;
    const page = Math.min(numPages, Math.max(1, Math.round((percent / 100) * numPages)));
    if (readingMode === "scroll" && scrollModePDFRef.current) {
      scrollModePDFRef.current.scrollToPage(page);
    } else {
      setCurrentPage(page);
    }
    updateProgress(page, numPages);
  };

  const onDocumentLoadSuccess = async (pdf: any) => {
    const { numPages } = pdf;
    setNumPages(numPages);
    
    // Update total pages if not set
    if (book && !book.total_pages) {
      supabase
        .from("books")
        .update({ total_pages: numPages })
        .eq("id", book.id);
      setBook(prev => (prev ? { ...prev, total_pages: numPages } : prev));
    }

    // Extract text from current page for narration
    extractPdfPageText(pdf, currentPage);

    // Extract PDF outline/chapters
    try {
      const outline = await pdf.getOutline();
      if (outline && outline.length > 0) {
        const extractedChapters: Chapter[] = [];
        
        const processOutline = async (items: any[], level = 0) => {
          for (const item of items) {
            let pageNum = 1;
            if (item.dest) {
              try {
                const dest = typeof item.dest === 'string' 
                  ? await pdf.getDestination(item.dest)
                  : item.dest;
                if (dest) {
                  const pageIndex = await pdf.getPageIndex(dest[0]);
                  pageNum = pageIndex + 1;
                }
              } catch {
                // Skip if can't resolve destination
              }
            }
            
            extractedChapters.push({
              id: `chapter-${extractedChapters.length}`,
              label: level > 0 ? `${"  ".repeat(level)}${item.title}` : item.title,
              page: pageNum,
            });
            
            if (item.items && item.items.length > 0) {
              await processOutline(item.items, level + 1);
            }
          }
        };
        
        await processOutline(outline);
        setPdfChapters(extractedChapters);
      }
    } catch (error) {
      console.log("Could not extract PDF outline:", error);
    }
  };

  // Extract text from PDF page for narration
  const extractPdfPageText = async (pdf: any, pageNum: number) => {
    try {
      const page = await pdf.getPage(pageNum);
      const textContentResult = await page.getTextContent();
      const text = textContentResult.items
        .map((item: any) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      setPdfTextContent(text);
    } catch (error) {
      console.log("Could not extract page text:", error);
      setPdfTextContent("");
    }
  };

  // Store pdf reference for text extraction
  const pdfDocRef = useRef<any>(null);

  const onDocumentLoadSuccessWrapper = async (pdf: any) => {
    pdfDocRef.current = pdf;
    await onDocumentLoadSuccess(pdf);
  };

  // Update text when page changes
  useEffect(() => {
    if (pdfDocRef.current && book?.file_type === 'pdf') {
      extractPdfPageText(pdfDocRef.current, currentPage);
    }
  }, [currentPage, book?.file_type]);

  const changePage = (delta: number) => {
    const newPage = currentPage + delta;
    if (newPage >= 1 && numPages && newPage <= numPages) {
      setCurrentPage(newPage);
      updateProgress(newPage, numPages);
    }
  };

  // TXT has no pages, so reading progress is how far the document itself is scrolled
  useEffect(() => {
    if (book?.file_type !== 'txt') return;

    const handleScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setTxtProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [book?.file_type, textContent]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  // Esc leaves fullscreen without going through toggleFullscreen, so track the browser instead
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const generateAudio = async (text: string) => {
    try {
      const response = await supabase.functions.invoke("text-to-speech", {
        body: { text, voice: "alloy" },
      });

      if (response.error) throw response.error;

      const { audioContent } = response.data;
      const audioBlob = new Blob(
        [Uint8Array.from(atob(audioContent), c => c.charCodeAt(0))],
        { type: "audio/mpeg" }
      );
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return url;
    } catch (error) {
      console.error("TTS error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate audio",
      });
      return null;
    }
  };

  const toggleAudio = async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      let url = audioUrl;
      
      if (!url && textContent) {
        // For text files
        url = await generateAudio(textContent.substring(0, 3000));
      } else if (!url && isPDF) {
        // For PDFs, generate audio for current page
        toast({
          title: "Generating audio",
          description: "Please wait...",
        });
        
        // This would need actual PDF text extraction
        // For now, show a placeholder message
        toast({
          title: "Feature coming soon",
          description: "PDF text-to-speech is being implemented",
        });
        return;
      }

      if (url && audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  if (checkingOffline) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-spin" />
          <p className="text-muted-foreground">Checking offline storage...</p>
        </div>
      </div>
    );
  }

  if (loading || !book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading book...</p>
        </div>
      </div>
    );
  }

  const isPDF = book.file_type === 'pdf';
  const isEPUB = book.file_type === 'epub';
  const isCBZ = book.file_type === 'cbz';
  const isCBR = book.file_type === 'cbr';
  const isTXT = book.file_type === 'txt';
  const isUnsupported = !isPDF && !isEPUB && !isCBZ && !isCBR && !isTXT;
  // EPUB, comics and PDF scroll mode each ship their own bottom chrome
  const pdfPageMode = isPDF && readingMode === "page";
  const showBottomBar = pdfPageMode || isTXT;
  const currentBookIndex = siblingBooks.findIndex(b => b.id === book.id);
  const prevBook = currentBookIndex > 0 ? siblingBooks[currentBookIndex - 1] : null;
  const nextBook = currentBookIndex >= 0 && currentBookIndex < siblingBooks.length - 1 ? siblingBooks[currentBookIndex + 1] : null;

  const getPageBgClass = () => {
    if (!isEPUB) return "bg-background text-foreground";
    if (readerTheme === "black") return "bg-black text-gray-200";
    if (readerTheme === "dark") return "bg-[#0b0f19] text-gray-200";
    if (readerTheme === "sepia") return "bg-[#f7f1e3] text-[#5d4037]";
    return "bg-white text-gray-900";
  };

  const getHeaderBgClass = () => {
    if (!isEPUB) return "glass-panel border-b-0";
    if (readerTheme === "black") return "bg-black/80 border-neutral-900/50 text-gray-200 backdrop-blur-xl";
    if (readerTheme === "dark") return "bg-[#0b0f19]/80 border-slate-800/50 text-gray-200 backdrop-blur-xl";
    if (readerTheme === "sepia") return "bg-[#f7f1e3]/80 border-[#e3dcd0]/50 text-[#5d4037] backdrop-blur-xl";
    return "bg-white/80 border-white/20 text-gray-900 backdrop-blur-xl shadow-sm";
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${getPageBgClass()}`}>
      {/* Header */}
      <div 
        ref={headerRef} 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ease-in-out ${getHeaderBgClass()} ${
          showControls ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        } shadow-lg pt-[env(safe-area-inset-top)]`}
      >
        <div className="container mx-auto px-3 sm:px-4 py-2.5">
          {/* Top row: back, title, offline badge */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="h-10 w-10 shrink-0 rounded-full"
              title="Back to library"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold truncate text-sm">{book.title}</h1>
              {book.author && (
                <p className="text-xs text-muted-foreground truncate">{book.author}</p>
              )}
            </div>
            {isReadingOffline && (
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 border-0 shrink-0 text-xs">
                <CloudOff className="w-3 h-3" />
              </Badge>
            )}
          </div>

          {/* Action row: chapters on the left, one icon per tool on the right */}
          <div className="mt-2 flex items-center gap-2">
            {isPDF && pdfChapters.length > 0 && (
              <div className="min-w-0 flex-1">
                <ChapterNavigation
                  chapters={pdfChapters}
                  currentPage={currentPage}
                  totalPages={numPages || undefined}
                  onChapterSelect={(chapter) => {
                    if (!chapter.page) return;
                    if (readingMode === "scroll" && scrollModePDFRef.current) {
                      scrollModePDFRef.current.scrollToPage(chapter.page);
                    } else {
                      setCurrentPage(chapter.page);
                    }
                    updateProgress(chapter.page, numPages || undefined);
                  }}
                  fileType="pdf"
                />
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              {(isTXT || isPDF) && (
                <NarrationControls 
                  text={isTXT ? textContent : pdfTextContent}
                  onPlayingChange={setIsPlaying}
                />
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowAnnotations(!showAnnotations)}
                className="h-10 w-10 rounded-full border-border/60 bg-background/90 backdrop-blur-md"
                title="View annotations"
              >
                <StickyNote className="w-4 h-4" />
              </Button>

              {isPDF && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className="h-10 w-10 rounded-full border-border/60 bg-background/90 backdrop-blur-md"
                  title="Reading settings"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Per-format reading options */}
      {isPDF && (
        <ReaderSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          zoom={{
            value: scale,
            onChange: setScale,
            min: 0.5,
            max: 5,
            step: 0.1,
            format: (value) => `${Math.round(value * 100)}%`,
          }}
        >
          <div className="space-y-2">
            <Label className="text-sm">Layout</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { id: "page", label: "Page turn" },
                { id: "scroll", label: "Continuous scroll" },
              ] as const).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    if (readingMode !== option.id) toggleReadingMode();
                  }}
                  className={cn(
                    "flex min-h-9 items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    readingMode === option.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Jump to page</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder={numPages ? `1 - ${numPages}` : "Page"}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && jumpToPage()}
                className="h-10 flex-1"
                min={1}
                max={numPages || 1}
              />
              <Button variant="outline" onClick={jumpToPage} className="h-10 px-4">
                Go
              </Button>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={toggleFullscreen}
            className="h-10 w-full justify-center gap-2"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          </Button>
        </ReaderSettingsSheet>
      )}

      {/* Reader Content */}
      <div 
        onClick={handleContentClick}
        className="container mx-auto px-1 sm:px-4 pb-2 sm:py-8 overflow-x-hidden"
        style={{
          paddingTop: `${headerHeight || 80}px`,
          paddingBottom: showBottomBar ? "calc(5rem + env(safe-area-inset-bottom))" : undefined,
        }}
      >
        {isPDF && signedUrl && (
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <Document
              file={signedUrl instanceof ArrayBuffer ? { data: signedUrl } : signedUrl}
              onLoadSuccess={onDocumentLoadSuccessWrapper}
              onLoadError={(err: Error) => {
                console.error(
                  "[Reader] PDF failed to load:",
                  err,
                  "source:",
                  typeof signedUrl === "string" ? signedUrl : "(in-memory buffer)"
                );
                setPdfError(err?.message || String(err));
              }}
              loading={
                <div className="flex items-center justify-center py-20">
                  <p className="text-muted-foreground text-sm">Loading PDF...</p>
                </div>
              }
              error={
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
                  <p className="text-destructive text-sm">Failed to load PDF</p>
                  {pdfError && (
                    <p className="max-w-md break-all text-xs text-muted-foreground">{pdfError}</p>
                  )}
                </div>
              }
            >
              {readingMode === "page" ? (
                <div className="shadow-lg rounded mx-auto bg-card border overflow-x-auto overflow-y-hidden w-full relative">
                  <div className="mx-auto" style={{ width: `${containerWidth * scale}px`, minWidth: `${containerWidth * scale}px` }}>
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      width={containerWidth}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="mx-auto"
                    />
                  </div>
                  
                  {/* Invisible Tap Zones for page turning */}
                  <div className="absolute inset-0 flex justify-between z-10 pointer-events-none">
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (currentPage > 1) changePage(-1);
                      }}
                      className="w-[15%] h-full cursor-w-resize pointer-events-auto"
                      title="Previous Page"
                    />
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (numPages && currentPage < numPages) changePage(1);
                      }}
                      className="w-[15%] h-full cursor-e-resize pointer-events-auto"
                      title="Next Page"
                    />
                  </div>
                </div>
              ) : (
                <ScrollModePDF 
                  ref={scrollModePDFRef}
                  numPages={numPages || 0}
                  scale={scale}
                  width={containerWidth}
                  initialPage={currentPage}
                  topOffset={Math.max(80, Math.round(headerHeight) + 8)}
                  onPageChange={(page) => {
                    setCurrentPage(page);
                    updateProgress(page, numPages || undefined);
                  }}
                  onScaleChange={setScale}
                  showControls={showControls}
                />
              )}
            </Document>
          </div>
        )}

        {isEPUB && signedUrl && !loadingLocation && (
          <EpubReader
            url={signedUrl}
            onLocationChange={(location, progressPercent) => {
              if (book) {
                // Save to localStorage immediately (100% reliable synchronous write)
                try {
                  localStorage.setItem(`epub_cfi_${book.id}`, location);
                } catch (e) {}

                const isCompleted = progressPercent >= 98;
                supabase
                  .from("books")
                  .update({ 
                    reading_progress: progressPercent,
                    is_completed: isCompleted,
                    last_page_read: 1, // EPUB locations rely on cfi, but set placeholder to mark started
                    tts_position: { epub_cfi: location } as any
                  })
                  .eq("id", book.id)
                  .then(() => {});
                
                // Save cfi position in local-only reading_locations database table
                supabase
                  .from("reading_locations")
                  .upsert({
                    book_id: book.id,
                    cfi_location: location,
                    progress_percent: progressPercent
                  }, { onConflict: "book_id" })
                  .then(() => {})
                  .catch(err => console.warn("Failed to upsert local cfi:", err));
              }
            }}
            initialLocation={initialEpubCfi}
            showControls={showControls}
            onThemeChange={setReaderTheme}
            onToggleControls={() => setShowControls(prev => !prev)}
          />
        )}

        {(isCBZ || isCBR) && signedUrl && (
          <ComicReader
            key={book.id}
            url={signedUrl}
            onTotalPages={setComicTotalPages}
            onPageChange={(page) => {
              // ComicReader is 0-based and last_page_read stays 0-based; only the percentage counts page+1
              setCurrentPage(page);
              updateProgress(page, comicTotalPages || undefined, page + 1);
            }}
            initialPage={book.last_page_read || 0}
            showControls={showControls}
            onToggleControls={() => setShowControls(prev => !prev)}
            chapterTitle={book?.title}
            onPrevChapter={prevBook ? () => navigate(`/reader/${prevBook.id}`) : undefined}
            onNextChapter={nextBook ? () => navigate(`/reader/${nextBook.id}`) : undefined}
          />
        )}

        {isTXT && (
          <div className="max-w-4xl mx-auto">
            <div className="glass-card p-4 sm:p-8 rounded-lg">
              <pre className="whitespace-pre-wrap font-serif text-foreground leading-relaxed text-lg sm:text-xl md:text-2xl">
                {textContent}
              </pre>
            </div>
          </div>
        )}

        {isUnsupported && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-md">
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                Reader Coming Soon
              </h3>
              <p className="text-muted-foreground mb-4">
                Support for {book.file_type.toUpperCase()} files is in development.
              </p>
              <p className="text-sm text-muted-foreground">
                Currently supported: PDF, EPUB, CBZ, CBR, TXT
              </p>
              <Button
                className="mt-6"
                onClick={() => window.open(book.file_url, '_blank')}
              >
                Download File
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to play audio",
          });
        }}
      />

      {/* Annotation Panel */}
      {showAnnotations && book && (
        <AnnotationPanel
          bookId={book.id}
          currentPage={currentPage}
          onClose={() => setShowAnnotations(false)}
        />
      )}

      {/* Highlight Menu */}
      {highlightMenuPos && book && (
        <div
          data-highlight-menu
          onMouseDown={(e) => {
            // Keep the underlying selection alive, but still let the note field take focus
            if (!(e.target as HTMLElement).closest("textarea, input")) e.preventDefault();
          }}
        >
          <HighlightMenu
            selectedText={selectedText}
            bookId={book.id}
            pageNumber={currentPage}
            position={highlightMenuPos}
            onClose={() => {
              setHighlightMenuPos(null);
              window.getSelection()?.removeAllRanges();
            }}
            onSaved={() => {
              window.getSelection()?.removeAllRanges();
            }}
          />
        </div>
      )}

      {/* Transient page indicator for PDF page mode */}
      {pdfPageMode && !!numPages && (
        <ReaderPagePill
          current={currentPage}
          total={numPages}
          visible={showOverlayPage}
        />
      )}

      {/* Reading progress */}
      {pdfPageMode && (
        <ReaderProgressBar
          percent={numPages ? (currentPage / numPages) * 100 : 0}
          caption={numPages ? `${currentPage} / ${numPages}` : `${currentPage}`}
          visible={showControls}
          onSeek={numPages ? seekToPercent : undefined}
          leading={
            <Button
              onClick={() => changePage(-1)}
              disabled={currentPage <= 1}
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          }
          trailing={
            <Button
              onClick={() => changePage(1)}
              disabled={!numPages || currentPage >= numPages}
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          }
        />
      )}

      {isTXT && (
        <ReaderProgressBar
          percent={txtProgress}
          caption={`${Math.round(txtProgress)}%`}
          visible={showControls}
          onSeek={(percent) => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            if (max > 0) window.scrollTo({ top: (percent / 100) * max, behavior: "smooth" });
          }}
        />
      )}

      {/* Reading Timer / Pomodoro */}
      <div 
        className={`fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 transition-all duration-300 ${
          showControls ? "translate-y-0 opacity-100 scale-100" : "translate-y-12 opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <ReadingTimer />
      </div>
    </div>
  );
};

export default Reader;
