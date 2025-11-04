import { useEffect, useState } from "react";
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
  BookOpen
} from "lucide-react";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { EpubReader } from "@/components/EpubReader";
import { ComicReader } from "@/components/ComicReader";

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
  
  const [book, setBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string>("");
  const [signedUrl, setSignedUrl] = useState<string>("");
  const [readingMode, setReadingMode] = useState<"page" | "scroll">("page");
  const [pageInput, setPageInput] = useState("");

  useEffect(() => {
    if (!bookId) return;
    fetchBook();
  }, [bookId]);

  const fetchBook = async () => {
    try {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("id", bookId)
        .single();

      if (error) throw error;
      
      setBook(data);
      setCurrentPage(data.last_page_read || 1);
      setReadingMode(data.reading_mode as "page" | "scroll" || "page");
      
      // Generate signed URL for private files
      if (data.file_type === 'pdf' || data.file_type === 'epub') {
        const filePath = data.file_url.split('/book-files/')[1];
        const { data: urlData, error: urlError } = await supabase.storage
          .from('book-files')
          .createSignedUrl(filePath, 3600); // 1 hour expiry
        
        if (urlError) throw urlError;
        setSignedUrl(urlData.signedUrl);
      }
      
      // If it's a text file, fetch and display content
      if (data.file_type === 'txt') {
        const filePath = data.file_url.split('/book-files/')[1];
        const { data: urlData } = await supabase.storage
          .from('book-files')
          .createSignedUrl(filePath, 3600);
        
        if (urlData?.signedUrl) {
          const response = await fetch(urlData.signedUrl);
          const text = await response.text();
          setTextContent(text);
        }
      }
      
      setLoading(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load book",
      });
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
      setCurrentPage(page);
      updateProgress(page, numPages);
      setPageInput("");
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    
    // Update total pages if not set
    if (book && !book.total_pages) {
      supabase
        .from("books")
        .update({ total_pages: numPages })
        .eq("id", book.id);
    }
  };

  const changePage = (delta: number) => {
    const newPage = currentPage + delta;
    if (newPage >= 1 && numPages && newPage <= numPages) {
      setCurrentPage(newPage);
      updateProgress(newPage, numPages);
    }
  };

  const changeScale = (delta: number) => {
    const newScale = Math.max(0.5, Math.min(3.0, scale + delta));
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
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Library</span>
              </Button>
              <div className="border-l h-6 mx-1 sm:mx-2 hidden sm:block" />
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold truncate text-sm sm:text-base">{book.title}</h1>
                {book.author && (
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">{book.author}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end">
              {isPDF && (
                <>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="Page"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && jumpToPage()}
                      className="w-16 h-8 text-xs"
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
                    className="text-xs h-8"
                  >
                    {readingMode === "page" ? "Scroll" : "Page"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => changeScale(-0.1)}
                    className="h-8 px-2"
                  >
                    <ZoomOut className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                  <span className="text-xs sm:text-sm font-medium min-w-[40px] text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => changeScale(0.1)}
                    className="h-8 px-2"
                  >
                    <ZoomIn className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="h-8 px-2 hidden sm:flex"
                  >
                    {isFullscreen ? (
                      <Minimize className="w-3 h-3 sm:w-4 sm:h-4" />
                    ) : (
                      <Maximize className="w-3 h-3 sm:w-4 sm:h-4" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reader Content */}
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {isPDF && signedUrl && (
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <Document
              file={signedUrl}
              onLoadSuccess={onDocumentLoadSuccess}
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
                <div className="shadow-lg rounded overflow-hidden w-full max-w-4xl mx-auto">
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    width={Math.min(window.innerWidth - 32, 800)}
                  />
                </div>
              ) : (
                <div className="space-y-6 w-full max-w-4xl mx-auto">
                  {Array.from({ length: Math.min(numPages || 0, 10) }, (_, i) => currentPage + i).filter(p => p <= (numPages || 0)).map((pageNum) => (
                    <div key={pageNum} className="shadow-lg rounded overflow-hidden">
                      <Page
                        pageNumber={pageNum}
                        scale={scale}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        width={Math.min(window.innerWidth - 32, 800)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Document>

            {/* Page Navigation - only show in page mode */}
            {readingMode === "page" && (
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
    </div>
  );
};

export default Reader;
