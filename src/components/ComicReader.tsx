import { useEffect, useState, useRef } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ChapterNavigation, Chapter } from "./ChapterNavigation";
import { ReaderPagePill } from "./reader/ReaderPagePill";
import { ReaderProgressBar } from "./reader/ReaderProgressBar";

interface ComicReaderProps {
  url: string | ArrayBuffer;
  onPageChange?: (page: number) => void;
  onTotalPages?: (n: number) => void;
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

// One archive load; flipped inactive when the [url] effect is torn down or re-run
interface LoadRun {
  active: boolean;
  controller: AbortController;
}

export const ComicReader = ({ 
  url, 
  onPageChange, 
  onTotalPages,
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
  const blobUrlsRef = useRef<string[]>([]);
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
    const run: LoadRun = { active: true, controller: new AbortController() };
    loadComicArchive(run);
    return () => {
      run.active = false;
      run.controller.abort();
    };
  }, [url]);

  // Revoke object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      blobUrlsRef.current = [];
    };
  }, []);

  const loadComicArchive = async (run: LoadRun) => {
    // Object URLs this run created; revoked wholesale if the run is superseded mid-flight
    const createdUrls: string[] = [];
    let handedOff = false;
    const abandon = () => {
      if (handedOff) return;
      createdUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };

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
        const response = await fetch(url, { signal: run.controller.signal });
        arrayBuffer = await response.arrayBuffer();
      } else {
        throw new Error('Invalid URL format');
      }

      if (!run.active) return;

      const zip = await JSZip.loadAsync(arrayBuffer);

      if (!run.active) return;

      // Natural sort ("page2" before "page10") on the entry names, before any decoding
      const entryNames = Object.keys(zip.files)
        .filter((filename) => !zip.files[filename].dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(filename))
        .filter((filename) => !filename.startsWith('__MACOSX/') && !(filename.split('/').pop() || '').startsWith('.'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      // Extract all image files with folder info
      const imageFiles: ImageFile[] = [];

      for (const filename of entryNames) {
        const blob = await zip.files[filename].async("blob");
        if (!run.active) {
          abandon();
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        createdUrls.push(objectUrl);

        // Get folder path
        const parts = filename.split('/');
        const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

        imageFiles.push({ name: filename, data: objectUrl, folder });
      }

      if (!run.active) {
        abandon();
        return;
      }

      // Swap the registry before revoking so the outgoing chapter is only freed once the new one is in
      const previousBlobUrls = blobUrlsRef.current;
      blobUrlsRef.current = createdUrls;
      handedOff = true;
      previousBlobUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      setImages(imageFiles);
      onTotalPages?.(imageFiles.length);

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
      abandon();
      if (!run.active) return;

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

  const progressPercent = ((currentPage + 1) / images.length) * 100;
  const pageCaption = `${currentPage + 1} / ${images.length}`;

  const seekToPercent = (percent: number) => {
    const target = Math.min(images.length - 1, Math.max(0, Math.round((percent / 100) * images.length) - 1));
    if (readingMode === "scroll") {
      // Instant, like the restore-scroll effect: a smooth jump drags the observer through every
      // page in between, firing one onPageChange (and one progress write) per page crossed
      document.getElementById(`comic-page-${target}`)?.scrollIntoView({ behavior: "auto" });
    }
    goToPage(target);
  };

  const prevChapterButton = onPrevChapter ? (
    <Button
      variant="ghost"
      size="icon"
      onClick={onPrevChapter}
      title="Previous chapter"
      aria-label="Previous chapter"
      className="h-11 w-11 shrink-0 rounded-full"
    >
      <ChevronLeft className="w-4 h-4" />
    </Button>
  ) : undefined;

  const trailingControls = (
    <div className="flex shrink-0 items-center gap-1">
      {onNextChapter && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onNextChapter}
          title="Next chapter"
          aria-label="Next chapter"
          className="h-11 w-11 rounded-full"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleToggleReadingMode(readingMode === "scroll" ? "page" : "scroll")}
        title={readingMode === "scroll" ? "Switch to page mode" : "Switch to scroll mode"}
        aria-label={readingMode === "scroll" ? "Switch to page mode" : "Switch to scroll mode"}
        className="h-11 w-11 rounded-full"
      >
        {readingMode === "scroll" ? <BookOpen className="w-4 h-4" /> : <ScrollText className="w-4 h-4" />}
      </Button>
    </div>
  );

  const progressBar = (
    // The reader shell toggles the chrome on any content click; scrubbing must not also hide the bar
    <div className="contents" onClick={(e) => e.stopPropagation()}>
      <ReaderProgressBar
        percent={progressPercent}
        caption={pageCaption}
        leading={prevChapterButton}
        trailing={trailingControls}
        visible={showControls}
        onSeek={seekToPercent}
      />
    </div>
  );

  if (readingMode === "scroll") {
    return (
      <div className="flex flex-col items-center w-full">
        {/* Only while the controls are hidden: with them shown the bottom bar already
            has the page count, and a sticky pill slid under the reader's header. */}
        <ReaderPagePill
          current={currentPage + 1}
          total={images.length}
          visible={!showControls}
        />

        {/* Seamless Webtoon Continuous list */}
        {/* Full width on phones: comics were held to 90%, leaving black bars on
            both sides of an already narrow screen. */}
        <div 
          className="flex flex-col gap-0 w-full max-w-3xl px-0 mt-4 pb-28 cursor-pointer mx-auto animate-fade-in"
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
                  className="flex min-h-11 items-center gap-1"
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
                  className="flex min-h-11 items-center gap-1"
                >
                  Next Chapter <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {progressBar}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full pb-40">
      {/* Transient page number, only while the chrome is hidden */}
      <ReaderPagePill
        current={currentPage + 1}
        total={images.length}
        visible={showOverlayPage && !showControls}
      />
      {/* Immersive Image Container with Navigation Overlays */}
      <div className="relative max-w-4xl w-full select-none overflow-hidden mx-auto sm:rounded-lg sm:border sm:border-border/40 sm:shadow-2xl">
        <img
          src={images[currentPage]?.data}
          alt={`Page ${currentPage + 1}`}
          className="w-full h-auto"
        />
        
        {/* Navigation Tap Zones */}
        <div className="absolute inset-0 flex z-10 touch-manipulation">
          {/* Left 35%: Previous page */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (currentPage > 0) goToPage(currentPage - 1);
            }}
            className="w-[35%] h-full cursor-w-resize active:bg-foreground/5 transition-colors"
            title="Previous Page"
          />
          {/* Center 30%: Toggle Controls */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleControls?.();
            }}
            className="w-[30%] h-full cursor-pointer"
            title="Toggle Menu"
          />
          {/* Right 35%: Next page */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              if (currentPage < images.length - 1) goToPage(currentPage + 1);
            }}
            className="w-[35%] h-full cursor-e-resize active:bg-foreground/5 transition-colors"
            title="Next Page"
          />
        </div>
      </div>

      {currentPage === images.length - 1 && onNextChapter && (
        <div className="w-[90%] sm:w-full max-w-4xl bg-primary/10 border border-primary/20 backdrop-blur-sm rounded-xl p-6 text-center flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-300 mt-2 mx-auto">
          <p className="text-sm text-primary font-medium">You have completed this chapter!</p>
          <Button 
            onClick={onNextChapter}
            className="flex min-h-11 items-center gap-1.5 shadow-lg shadow-primary/20"
          >
            Read Next Chapter <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Page controls, parked just above the shared progress bar */}
      <div className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 transition-all duration-300 z-50 ${
        showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
      }`}>
        <div className="flex items-center gap-1 glass-panel px-2 py-1.5 rounded-full shadow-strong border border-border/60">
          <Button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            variant="ghost"
            size="icon"
            title="Previous page"
            aria-label="Previous page"
            className="h-11 w-11 rounded-full"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="px-2 text-sm font-medium tabular-nums">
            {pageCaption}
          </div>

          <Button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= images.length - 1}
            variant="ghost"
            size="icon"
            title="Next page"
            aria-label="Next page"
            className="h-11 w-11 rounded-full"
          >
            <ChevronRight className="w-4 h-4" />
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
      </div>

      {progressBar}
    </div>
  );
};
