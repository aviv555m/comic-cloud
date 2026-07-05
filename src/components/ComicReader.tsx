import { useEffect, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ChapterNavigation, Chapter } from "./ChapterNavigation";

interface ComicReaderProps {
  url: string | ArrayBuffer;
  onPageChange?: (page: number) => void;
  initialPage?: number;
  showControls?: boolean;
  onToggleControls?: () => void;
  chapterTitle?: string;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
}

interface ImageFile {
  name: string;
  data: string;
  folder: string;
}

export const ComicReader = ({ 
  url, 
  onPageChange, 
  initialPage = 0,
  showControls = true,
  onToggleControls,
  chapterTitle,
  onPrevChapter,
  onNextChapter
}: ComicReaderProps) => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showOverlayPage, setShowOverlayPage] = useState(false);
  const pageNumTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setShowOverlayPage(true);
    if (pageNumTimerRef.current) {
      clearTimeout(pageNumTimerRef.current);
    }
    pageNumTimerRef.current = setTimeout(() => {
      setShowOverlayPage(false);
    }, 2000);
    return () => {
      if (pageNumTimerRef.current) {
        clearTimeout(pageNumTimerRef.current);
      }
    };
  }, [currentPage]);

  useEffect(() => {
    loadComicArchive();
  }, [url]);

  const loadComicArchive = async () => {
    try {
      setLoading(true);
      
      // Check if file is CBR (RAR format)
      if (typeof url === 'string' && url.toLowerCase().includes('.cbr')) {
        toast({
          variant: "destructive",
          title: "CBR format not supported",
          description: "Please convert to CBZ format for reading",
        });
        setLoading(false);
        return;
      }

      let arrayBuffer: ArrayBuffer;
      if (url instanceof ArrayBuffer) {
        arrayBuffer = url;
      } else if (typeof url === 'string') {
        const response = await fetch(url);
        arrayBuffer = await response.arrayBuffer();
      } else {
        throw new Error('Invalid URL format');
      }
      
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Extract all image files with folder info
      const imageFiles: ImageFile[] = [];
      
      for (const filename of Object.keys(zip.files)) {
        const file = zip.files[filename];
        if (!file.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
          const blob = await file.async("blob");
          const url = URL.createObjectURL(blob);
          
          // Get folder path
          const parts = filename.split('/');
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
          
          imageFiles.push({ name: filename, data: url, folder });
        }
      }

      // Sort by filename
      imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setImages(imageFiles);

      // Extract chapters from folder structure
      const folderMap = new Map<string, number>();
      imageFiles.forEach((img, index) => {
        if (img.folder && !folderMap.has(img.folder)) {
          folderMap.set(img.folder, index);
        }
      });

      // Create chapters from folders
      const extractedChapters: Chapter[] = [];
      
      // If there are folders, use them as chapters
      if (folderMap.size > 1) {
        folderMap.forEach((pageIndex, folder) => {
          const folderName = folder.split('/').pop() || folder;
          extractedChapters.push({
            id: `chapter-${extractedChapters.length}`,
            label: folderName,
            page: pageIndex + 1, // 1-indexed for display
          });
        });
      } else {
        // If no folders, create chapters every N pages (e.g., every 20 pages)
        const chapterSize = 20;
        for (let i = 0; i < imageFiles.length; i += chapterSize) {
          const chapterNum = Math.floor(i / chapterSize) + 1;
          extractedChapters.push({
            id: `chapter-${chapterNum}`,
            label: `Part ${chapterNum}`,
            page: i + 1,
          });
        }
      }

      setChapters(extractedChapters);
      setLoading(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load comic archive",
      });
      setLoading(false);
    }
  };

  const [readingMode, setReadingMode] = useState<"page" | "scroll">(() => {
    try {
      return (localStorage.getItem("comic_reading_mode") as "page" | "scroll") || "scroll";
    } catch (e) {
      return "scroll";
    }
  });

  useEffect(() => {
    if (readingMode === "scroll" && !loading && images.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`comic-page-${currentPage}`);
        if (el) {
          el.scrollIntoView({ behavior: "auto" });
        }
      }, 150);
    }
  }, [readingMode, loading]);

  useEffect(() => {
    if (readingMode !== "scroll" || loading || images.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute("data-page") || "0");
            setCurrentPage(pageNum);
            onPageChange?.(pageNum);
          }
        });
      },
      {
        root: null,
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0.1,
      }
    );

    for (let i = 0; i < images.length; i++) {
      const el = document.getElementById(`comic-page-${i}`);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [readingMode, loading, images.length]);

  const goToPage = (page: number) => {
    if (page >= 0 && page < images.length) {
      setCurrentPage(page);
      onPageChange?.(page);
    }
  };

  const handleToggleReadingMode = (mode: "page" | "scroll") => {
    setReadingMode(mode);
    try {
      localStorage.setItem("comic_reading_mode", mode);
    } catch (e) {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading comic...</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">No images found in archive</p>
      </div>
    );
  }

  if (readingMode === "scroll") {
    return (
      <div className="flex flex-col items-center w-full">
        {/* Sticky Toolbar */}
        <div 
          className={`sticky z-40 bg-background/95 backdrop-blur-sm border rounded-full px-4 py-1.5 shadow-md flex items-center gap-3 pointer-events-auto transition-all duration-300 ${
            showControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
          }`} 
          style={{ top: "80px" }}
        >
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Scroll Mode
          </span>
          <span className="text-sm font-medium">
            Page {currentPage + 1} of {images.length}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => handleToggleReadingMode("page")}
          >
            Switch to Page Mode
          </Button>
        </div>

        {/* Seamless Webtoon Continuous list */}
        <div 
          className="flex flex-col gap-0 w-[90%] sm:w-full max-w-3xl px-0 mt-4 cursor-pointer mx-auto animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            onToggleControls?.();
          }}
        >
          {images.map((img, index) => (
            <div
              key={index}
              id={`comic-page-${index}`}
              data-page={index}
              className="w-full h-auto bg-card overflow-hidden"
            >
              <img
                src={img.data}
                alt={`Page ${index + 1}`}
                loading="lazy"
                className="w-full h-auto select-none"
              />
            </div>
          ))}

          {/* Sibling Chapter Buttons at the end of the scrolling list */}
          {(onPrevChapter || onNextChapter) && (
            <div className="flex justify-center gap-4 py-8 px-4 border-t mt-4">
              {onPrevChapter && (
                <Button 
                  variant="outline" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrevChapter();
                  }}
                  className="flex items-center gap-1 border-violet-500/20 text-violet-400 hover:bg-violet-500/10"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous Chapter
                </Button>
              )}
              {onNextChapter && (
                <Button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onNextChapter();
                  }}
                  className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  Next Chapter <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Floating progress overlay for Comic Reader */}
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm pointer-events-auto transition-all duration-300 ${showControls && currentPage < images.length - 1 ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 pointer-events-none"}`}>
          <div className="bg-background/90 backdrop-blur-md border border-violet-500/20 px-4 py-2.5 rounded-2xl shadow-xl flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="truncate text-violet-300 max-w-[70%]">
                {chapterTitle || "Reading"}
              </span>
              <span className="text-muted-foreground shrink-0">
                Page {currentPage + 1} of {images.length}
              </span>
            </div>
            {/* Visual progress bar */}
            <div className="w-full bg-violet-950/40 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full transition-all duration-200"
                style={{ width: `${((currentPage + 1) / images.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Floating Temporary Page Number Overlay */}
      {showOverlayPage && images.length > 0 && (
        <div className="fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-black/50 text-white text-xs font-semibold px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-sm z-50 transition-all duration-300 border border-white/10 animate-in fade-in slide-in-from-bottom-2">
          Page {currentPage + 1} of {images.length}
        </div>
      )}
      {/* Immersive Image Container with Navigation Overlays */}
      <div className="relative max-w-4xl w-[90%] sm:w-full select-none shadow-2xl rounded-lg overflow-hidden border border-border/40 mx-auto">
        <img
          src={images[currentPage]?.data}
          alt={`Page ${currentPage + 1}`}
          className="w-full h-auto"
        />
        
        {/* Navigation Tap Zones */}
        <div className="absolute inset-0 flex z-10">
          {/* Left 30%: Previous page */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (currentPage > 0) goToPage(currentPage - 1);
            }}
            className="w-[30%] h-full cursor-w-resize active:bg-white/5 transition-colors"
            title="Previous Page"
          />
          {/* Center 40%: Toggle Controls */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleControls?.();
            }}
            className="w-[40%] h-full cursor-pointer"
            title="Toggle Menu"
          />
          {/* Right 30%: Next page */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (currentPage < images.length - 1) goToPage(currentPage + 1);
            }}
            className="w-[30%] h-full cursor-e-resize active:bg-white/5 transition-colors"
            title="Next Page"
          />
        </div>
      </div>

      {currentPage === images.length - 1 && onNextChapter && (
        <div className="w-[90%] sm:w-full max-w-4xl bg-violet-950/20 border border-violet-500/20 backdrop-blur-sm rounded-xl p-6 text-center flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300 mt-2 mx-auto">
          <p className="text-sm text-violet-300 font-medium">You have completed this chapter!</p>
          <Button 
            onClick={onNextChapter}
            className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-1.5 shadow-lg shadow-violet-500/20"
          >
            Read Next Chapter <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Floating progress overlay at the bottom in Page Mode */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 transition-all duration-400 z-50 ${
        showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
      }`}>
        <div className="flex items-center gap-2 sm:gap-4 glass-panel px-4 py-2 rounded-full shadow-strong border border-white/10">
          <Button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            variant="ghost"
            size="sm"
            className="rounded-full hover:bg-white/10"
          >
            <ChevronLeft className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          
          <div className="text-sm font-medium px-2">
            {currentPage + 1} / {images.length}
          </div>

          <Button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= images.length - 1}
            variant="ghost"
            size="sm"
            className="rounded-full hover:bg-white/10"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4 ml-1 sm:ml-2" />
          </Button>

          <Button
            onClick={() => handleToggleReadingMode("scroll")}
            variant="ghost"
            size="sm"
            className="ml-1 sm:ml-2 text-xs rounded-full bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
          >
            Scroll Mode
          </Button>
        </div>

        {/* Chapter Navigation */}
        {chapters.length > 0 && (
          <ChapterNavigation
            chapters={chapters}
            currentPage={currentPage + 1}
            totalPages={images.length}
            onChapterSelect={(chapter) => {
              if (chapter.page) {
                goToPage(chapter.page - 1); // Convert to 0-indexed
              }
            }}
            fileType="cbz"
          />
        )}

        {/* Sibling Chapter Buttons in Page Mode */}
        {(onPrevChapter || onNextChapter) && (
          <div className="flex items-center gap-4 mt-2">
            {onPrevChapter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onPrevChapter}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous Chapter
              </Button>
            )}
            {onNextChapter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onNextChapter}
                className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                Next Chapter <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Floating progress overlay for Comic Reader (Page Mode) */}
      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm pointer-events-auto transition-all duration-400 ${showControls && currentPage < images.length - 1 ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 pointer-events-none"}`}>
        <div className="glass-panel border border-white/10 px-4 py-2.5 rounded-2xl shadow-strong flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="truncate text-violet-300 max-w-[70%]">
              {chapterTitle || "Reading"}
            </span>
            <span className="text-muted-foreground shrink-0">
              Page {currentPage + 1} of {images.length}
            </span>
          </div>
          {/* Visual progress bar */}
          <div className="w-full bg-violet-950/40 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full transition-all duration-200"
              style={{ width: `${((currentPage + 1) / images.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
