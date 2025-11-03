import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
      
      // If it's a text file, fetch and display content
      if (data.file_type === 'txt') {
        const response = await fetch(data.file_url);
        const text = await response.text();
        setTextContent(text);
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

  const updateProgress = async (page: number) => {
    if (!book) return;
    
    await supabase
      .from("books")
      .update({ last_page_read: page })
      .eq("id", book.id);
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
      updateProgress(newPage);
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
  const isTXT = book.file_type === 'txt';
  const isUnsupported = !isPDF && !isTXT;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Library
              </Button>
              <div className="border-l h-6 mx-2" />
              <div>
                <h1 className="font-semibold truncate max-w-md">{book.title}</h1>
                {book.author && (
                  <p className="text-sm text-muted-foreground">{book.author}</p>
                )}
              </div>
            </div>

            {isPDF && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changeScale(-0.1)}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium min-w-[60px] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => changeScale(0.1)}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <div className="border-l h-6 mx-2" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reader Content */}
      <div className="container mx-auto px-4 py-8">
        {isPDF && (
          <div className="flex flex-col items-center gap-6">
            <Document
              file={book.file_url}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex items-center justify-center py-20">
                  <p className="text-muted-foreground">Loading PDF...</p>
                </div>
              }
              error={
                <div className="flex items-center justify-center py-20">
                  <p className="text-destructive">Failed to load PDF</p>
                </div>
              }
            >
              <div className="shadow-2xl rounded-lg overflow-hidden">
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              </div>
            </Document>

            {/* Page Navigation */}
            <div className="flex items-center gap-4">
              <Button
                onClick={() => changePage(-1)}
                disabled={currentPage <= 1}
                variant="outline"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>
              
              <div className="text-sm font-medium">
                Page {currentPage} of {numPages || "..."}
              </div>

              <Button
                onClick={() => changePage(1)}
                disabled={!numPages || currentPage >= numPages}
                variant="outline"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
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
                Currently supported: PDF, TXT
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
