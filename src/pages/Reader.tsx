import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Minimize,
  ArrowLeft,
  BookOpen,
  StickyNote,
  CloudOff
} from "lucide-react";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { EpubReader } from "@/components/EpubReader";
import { ComicReader } from "@/components/ComicReader";
import { AnnotationPanel } from "@/components/AnnotationPanel";
import { HighlightMenu } from "@/components/HighlightMenu";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import { ChapterNavigation, Chapter } from "@/components/ChapterNavigation";
import { Badge } from "@/components/ui/badge";
import { NarrationControls } from "@/components/NarrationControls";
import { ScrollModePDF, ScrollModePDFHandle } from "@/components/ScrollModePDF";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Book {
  id: string;
  title: string;
  author: string | null;
  file_url: string;
  file_type: string;
  last_page_read: number;
  total_pages: number | null;
  user_id: string;
}

const Reader = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOnline, getOfflineFile, isBookOffline } = useOfflineBooks();
  
  const [book, setBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string>("");
  const [signedUrl, setSignedUrl] = useState<string>("");
  const [pdfTextContent, setPdfTextContent] = useState<string>("");
  const [readingMode, setReadingMode] = useState<"page" | "scroll">("page");
  const [pageInput, setPageInput] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [highlightMenuPos, setHighlightMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReadingOffline, setIsReadingOffline] = useState(false);
  const [pdfChapters, setPdfChapters] = useState<Chapter[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionStartTime = useRef<Date>(new Date());
  const startPageRef = useRef<number>(1);
  const lastUpdateRef = useRef<Date>(new Date());
  const scrollModePDFRef = useRef<ScrollModePDFHandle>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const measure = () => {
      const h = headerRef.current?.getBoundingClientRect().height ?? 0;
      setHeaderHeight(h);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);


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
      sessionStartTime.current = new Date();
      startPageRef.current = currentPage;
      lastUpdateRef.current = new Date();
    }
  }, [bookId, currentPage]);

  // Update session periodically
  const updateSessionProgress = useCallback(async () => {
    if (!sessionId) return;

    const now = new Date();
    const durationMinutes = Math.max(1, Math.round(
      (now.getTime() - sessionStartTime.current.getTime()) / 60000
    ));
    const pagesRead = Math.max(1, Math.abs(currentPage - startPageRef.current));

    await supabase
      .from("reading_sessions")
      .update({
        end_time: now.toISOString(),
        duration_minutes: durationMinutes,
        pages_read: pagesRead,
      })
      .eq("id", sessionId);
    
    lastUpdateRef.current = now;
  }, [sessionId, currentPage]);

  // End reading session
  const endReadingSession = useCallback(async () => {
    if (!sessionId) return;

    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.round(
      (endTime.getTime() - sessionStartTime.current.getTime()) / 60000
    ));
    const pagesRead = Math.max(1, Math.abs(currentPage - startPageRef.current));

    await supabase
      .from("reading_sessions")
      .update({
        end_time: endTime.toISOString(),
        duration_minutes: durationMinutes,
        pages_read: pagesRead,
      })
      .eq("id", sessionId);
  }, [sessionId, currentPage]);

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
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      
      if (text && text.length > 0 && book?.file_type === 'pdf') {
        const range = selection?.getRangeAt(0);
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

  const fetchBook = async () => {
    try {
      // First check if book is available offline
      if (bookId && isBookOffline(bookId)) {
        const offlineFile = await getOfflineFile(bookId);
        if (offlineFile) {
          // Get book metadata from database (may fail if offline)
          try {
            const { data } = await supabase
              .from("books")
              .select("*")
              .eq("id", bookId)
              .maybeSingle();
              
            if (data) {
              setBook(data);
              setCurrentPage(data.last_page_read || 1);
              setReadingMode(data.reading_mode as "page" | "scroll" || "page");
            }
          } catch {
            // If we can't fetch from DB, continue with offline data
          }
          
          // Create URL from offline blob
          const url = URL.createObjectURL(offlineFile);
          setSignedUrl(url);
          setIsReadingOffline(true);
          setLoading(false);
          
          toast({
            title: "Reading offline",
            description: "Book loaded from offline storage",
          });
          return;
        }
      }
      
      // Online fetch
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("id", bookId)
        .single();

      if (error) throw error;
      
      setBook(data);
      setCurrentPage(data.last_page_read || 1);
      setReadingMode(data.reading_mode as "page" | "scroll" || "page");
      
      // Use public URL for files (bucket is public)
      if (data.file_type === 'pdf' || data.file_type === 'epub') {
        setSignedUrl(data.file_url);
      }
      
      // If it's a text file, fetch and display content
      if (data.file_type === 'txt') {
        const response = await fetch(data.file_url);
        const text = await response.text();
        setTextContent(text);
      }
      
      setLoading(false);
    } catch (error: any) {
      // If offline and no cached book, show error
      if (!isOnline) {
        toast({
          variant: "destructive",
          title: "Offline",
          description: "This book is not available offline. Save it for offline reading first.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load book",
        });
      }
      navigate("/");
    }
  };

  const updateProgress = async (page: number, total?: number) => {
    if (!book) return;
    
    const totalPages = total || numPages || book.total_pages || 1;
    const progress = Math.round((page / totalPages) * 100);
    const isCompleted = progress >= 98;
    
    await supabase
      .from("books")
      .update({ 
        last_page_read: page,
        reading_progress: progress,
        is_completed: isCompleted
      })
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
    }
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

  const changeScale = (delta: number) => {
    const newScale = Math.max(0.5, Math.min(5.0, scale + delta));
    setScale(newScale);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div ref={headerRef} className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-2 sm:px-4 py-2">
          <div className="flex flex-col gap-2">
            {/* Top row: back button and title */}
            <div className="flex items-center gap-2 w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="shrink-0 h-8 px-2 sm:px-3"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline ml-2">Back</span>
              </Button>
              <div className="min-w-0 flex-1 flex items-center gap-2">
                <div className="min-w-0">
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
            </div>
            
            {/* Bottom row: controls */}

            <div className="flex flex-wrap items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end">
              {/* Narration Controls */}
              {(isTXT || isPDF) && (
                <NarrationControls 
                  text={isTXT ? textContent : pdfTextContent}
                  onPlayingChange={setIsPlaying}
                />
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAnnotations(!showAnnotations)}
                className="h-9 px-3"
                title="View annotations"
              >
                <StickyNote className="w-4 h-4" />
              </Button>

              {isPDF && (
                <>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="Pg"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && jumpToPage()}
                      className="w-12 sm:w-16 h-8 text-xs sm:text-sm"
                      min={1}
                      max={numPages || 1}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={jumpToPage}
                      className="h-8 px-2 text-xs"
                    >
                      Go
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleReadingMode}
                    className="text-xs h-8 px-2"
                  >
                    {readingMode === "page" ? "Scroll" : "Page"}
                  </Button>
                  <div className="flex items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changeScale(-0.2)}
                      className="h-8 px-2 rounded-r-none"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </Button>
                    <span className="text-xs font-medium px-2 bg-muted h-8 flex items-center border-y">
                      {Math.round(scale * 100)}%
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => changeScale(0.2)}
                      className="h-8 px-2 rounded-l-none"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="h-8 px-2 hidden sm:flex"
                  >
                    {isFullscreen ? (
                      <Minimize className="w-3 h-3" />
                    ) : (
                      <Maximize className="w-3 h-3" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reader Content */}
      <div className="container mx-auto px-1 sm:px-4 py-2 sm:py-8 overflow-x-hidden">
        {isPDF && signedUrl && (
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <Document
              file={signedUrl}
              onLoadSuccess={onDocumentLoadSuccessWrapper}
              loading={
                <div className="flex items-center justify-center py-20">
                  <p className="text-muted-foreground text-sm">Loading PDF...</p>
                </div>
              }
              error={
                <div className="flex items-center justify-center py-20">
                  <p className="text-destructive text-sm">Failed to load PDF</p>
                </div>
              }
            >
              {readingMode === "page" ? (
                <div className="shadow-lg rounded overflow-hidden w-full mx-auto" style={{ maxWidth: '100%' }}>
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="mx-auto [&_.react-pdf__Page__canvas]:!max-w-full [&_.react-pdf__Page__canvas]:!h-auto"
                  />
                </div>
              ) : (
                <ScrollModePDF 
                  ref={scrollModePDFRef}
                  numPages={numPages || 0}
                  scale={scale}
                  initialPage={currentPage}
                  topOffset={Math.max(80, Math.round(headerHeight) + 8)}
                  onPageChange={(page) => {
                    setCurrentPage(page);
                    updateProgress(page, numPages || undefined);
                  }}
                />
              )}
            </Document>

            {/* Page Navigation - only show in page mode */}
            {readingMode === "page" && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 sm:gap-4">
                  <Button
                    onClick={() => changePage(-1)}
                    disabled={currentPage <= 1}
                    variant="outline"
                    size="sm"
                  >
                    <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>
                  
                  <div className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    Page {currentPage} of {numPages || "..."}
                  </div>

                  <Button
                    onClick={() => changePage(1)}
                    disabled={!numPages || currentPage >= numPages}
                    variant="outline"
                    size="sm"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 sm:ml-2" />
                  </Button>
                </div>
                
                {/* Chapter Navigation for PDF */}
                {pdfChapters.length > 0 && (
                  <ChapterNavigation
                    chapters={pdfChapters}
                    currentPage={currentPage}
                    totalPages={numPages || undefined}
                    onChapterSelect={(chapter) => {
                      if (chapter.page) {
                        setCurrentPage(chapter.page);
                        updateProgress(chapter.page, numPages || undefined);
                      }
                    }}
                    fileType="pdf"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {isEPUB && signedUrl && (
          <EpubReader
            url={signedUrl}
            onLocationChange={(location) => {
              // Save location for progress tracking
              if (book) {
                supabase
                  .from("books")
                  .update({ last_page_read: currentPage })
                  .eq("id", book.id);
              }
            }}
            initialLocation={book.last_page_read ? String(book.last_page_read) : undefined}
          />
        )}

        {(isCBZ || isCBR) && signedUrl && (
          <ComicReader
            url={signedUrl}
            onPageChange={(page) => {
              setCurrentPage(page);
              updateProgress(page);
            }}
            initialPage={book.last_page_read || 0}
          />
        )}

        {isTXT && (
          <div className="max-w-4xl mx-auto">
            <div className="glass-card p-8 rounded-lg">
              <pre className="whitespace-pre-wrap font-serif text-foreground leading-relaxed">
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
      )}
    </div>
  );
};

export default Reader;
