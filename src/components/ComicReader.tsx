import { useEffect, useState } from "react";
import JSZip from "jszip";
import { useToast } from "@/hooks/use-toast";
import { ChapterNavigation, Chapter } from "./ChapterNavigation";
import { SwipeablePageReader } from "./SwipeablePageReader";
import { SwipeDirectionToggle } from "./SwipeDirectionToggle";
import { PageAnimationToggle } from "./PageAnimationToggle";
import { useIsMobile } from "@/hooks/use-mobile";

interface ComicReaderProps {
  url: string;
  onPageChange?: (page: number) => void;
  initialPage?: number;
  onTap?: () => void;
  uiVisible?: boolean;
}

interface ImageFile {
  name: string;
  data: string;
  folder: string;
}

export const ComicReader = ({ url, onPageChange, initialPage = 0, onTap, uiVisible = false }: ComicReaderProps) => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [swipeDirection, setSwipeDirection] = useState<"horizontal" | "vertical">(
    () => (localStorage.getItem("swipeDirection") as "horizontal" | "vertical") || "horizontal"
  );
  const [animationMode, setAnimationMode] = useState<"slide" | "curl">(
    () => (localStorage.getItem("pageAnimation") as "slide" | "curl") || "slide"
  );
  const isMobile = useIsMobile();
  const { toast } = useToast();

  useEffect(() => {
    loadComicArchive();
  }, [url]);

  const loadComicArchive = async () => {
    try {
      setLoading(true);
      
      if (url.toLowerCase().includes('.cbr')) {
        toast({
          variant: "destructive",
          title: "CBR format not supported",
          description: "Please convert to CBZ format for reading",
        });
        setLoading(false);
        return;
      }

      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const imageFiles: ImageFile[] = [];
      
      for (const filename of Object.keys(zip.files)) {
        const file = zip.files[filename];
        if (!file.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
          const blob = await file.async("blob");
          const blobUrl = URL.createObjectURL(blob);
          
          const parts = filename.split('/');
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
          
          imageFiles.push({ name: filename, data: blobUrl, folder });
        }
      }

      imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setImages(imageFiles);

      // Extract chapters from folders
      const folderMap = new Map<string, number>();
      imageFiles.forEach((img, index) => {
        if (img.folder && !folderMap.has(img.folder)) {
          folderMap.set(img.folder, index);
        }
      });

      const extractedChapters: Chapter[] = [];
      if (folderMap.size > 1) {
        folderMap.forEach((pageIndex, folder) => {
          const folderName = folder.split('/').pop() || folder;
          extractedChapters.push({
            id: `chapter-${extractedChapters.length}`,
            label: folderName,
            page: pageIndex + 1,
          });
        });
      } else {
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

  const goToPage = (page: number) => {
    if (page >= 0 && page < images.length) {
      setCurrentPage(page);
      onPageChange?.(page);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading comic...</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No images found in archive</p>
      </div>
    );
  }

  // Compute chapter info for page popup
  const currentChapterIndex = chapters.length > 0
    ? (() => {
        for (let i = chapters.length - 1; i >= 0; i--) {
          if (chapters[i].page && (currentPage + 1) >= chapters[i].page!) return i;
        }
        return 0;
      })()
    : -1;
  const currentChapterLabel = currentChapterIndex >= 0 ? chapters[currentChapterIndex]?.label : undefined;
  const nextChapter = currentChapterIndex >= 0 ? chapters[currentChapterIndex + 1] : undefined;
  const pagesUntilNextChapter = nextChapter?.page ? nextChapter.page - (currentPage + 1) : null;

  const renderPage = (pageNum: number) => {
    const idx = pageNum - 1; // convert 1-indexed to 0-indexed
    if (idx < 0 || idx >= images.length) return <div className="w-full h-full bg-background" />;
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <img
          src={images[idx].data}
          alt={`Page ${pageNum}`}
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
      </div>
    );
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      <SwipeablePageReader
        renderPage={renderPage}
        onNext={() => goToPage(currentPage + 1)}
        onPrev={() => goToPage(currentPage - 1)}
        canGoNext={currentPage < images.length - 1}
        canGoPrev={currentPage > 0}
        currentPage={currentPage + 1}
        totalPages={images.length}
        swipeDirection={swipeDirection}
        animationMode={animationMode}
        onTap={onTap}
        pagesUntilNextChapter={pagesUntilNextChapter}
        currentChapterLabel={currentChapterLabel}
      />

      {/* Controls overlay — only when UI visible */}
      {uiVisible && (
        <div className="absolute bottom-0 left-0 right-0 bg-card/90 backdrop-blur-sm border-t p-2 z-40 safe-area-inset-bottom">
          <div className="flex items-center justify-center gap-2 mb-2">
            <SwipeDirectionToggle direction={swipeDirection} onChange={setSwipeDirection} />
            <PageAnimationToggle mode={animationMode} onChange={setAnimationMode} />
          </div>
          {chapters.length > 0 && (
            <ChapterNavigation
              chapters={chapters}
              currentPage={currentPage + 1}
              totalPages={images.length}
              onChapterSelect={(chapter) => {
                if (chapter.page) {
                  goToPage(chapter.page - 1);
                }
              }}
              fileType="cbz"
            />
          )}
        </div>
      )}
    </div>
  );
};
