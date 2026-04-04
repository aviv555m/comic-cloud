import { useEffect, useRef, useState } from "react";
import ePub, { Book, Rendition, NavItem } from "epubjs";
import { ChapterNavigation, Chapter } from "./ChapterNavigation";
import { SwipeDirectionToggle } from "./SwipeDirectionToggle";
import { PageAnimationToggle } from "./PageAnimationToggle";
import { useIsMobile } from "@/hooks/use-mobile";

interface EpubReaderProps {
  url: string;
  onLocationChange?: (location: string) => void;
  initialLocation?: string;
  onTap?: () => void;
  uiVisible?: boolean;
}

export const EpubReader = ({ url, onLocationChange, initialLocation, onTap, uiVisible = false }: EpubReaderProps) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentCfi, setCurrentCfi] = useState<string>("");
  const [currentChapterLabel, setCurrentChapterLabel] = useState<string>("");
  const [swipeDirection, setSwipeDirection] = useState<"horizontal" | "vertical">(
    () => (localStorage.getItem("swipeDirection") as "horizontal" | "vertical") || "horizontal"
  );
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!viewerRef.current) return;

    const book = ePub(url);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width: "100%",
      height: "100%",
      spread: "none",
    });
    renditionRef.current = rendition;

    // Load table of contents
    book.loaded.navigation.then((navigation) => {
      const toc = navigation.toc;
      const extractedChapters: Chapter[] = toc.map((item: NavItem, index: number) => ({
        id: item.id || `chapter-${index}`,
        label: item.label.trim(),
        href: item.href,
        cfi: item.href,
      }));
      setChapters(extractedChapters);
    });

    // Display the book
    const displayed = initialLocation 
      ? rendition.display(initialLocation)
      : rendition.display();

    displayed.then(() => {
      rendition.on("relocated", (location: any) => {
        setCanGoBack(!location.atStart);
        setCanGoForward(!location.atEnd);
        
        const cfi = location.start?.cfi || "";
        setCurrentCfi(cfi);
        
        if (bookRef.current && location.start?.href) {
          const currentHref = location.start.href;
          bookRef.current.loaded.navigation.then((navigation) => {
            const currentItem = navigation.toc.find((item: NavItem) => 
              item.href === currentHref || currentHref.includes(item.href.split('#')[0])
            );
            if (currentItem) {
              setCurrentChapterLabel(currentItem.label.trim());
            }
          });
        }
        
        if (onLocationChange && location.start) {
          onLocationChange(location.start.cfi);
        }
      });

      // Swipe / touch handling inside epub iframe
      rendition.on("touchstart", (e: TouchEvent) => {
        // handled via tap
      });

      // Tap to toggle UI inside epub
      rendition.on("click", () => {
        onTap?.();
      });
    });

    return () => {
      rendition.destroy();
      book.destroy();
    };
  }, [url, initialLocation, onLocationChange, onTap]);

  const goToPreviousPage = () => {
    renditionRef.current?.prev();
  };

  const goToNextPage = () => {
    renditionRef.current?.next();
  };

  const handleChapterSelect = (chapter: Chapter) => {
    if (chapter.href && renditionRef.current) {
      renditionRef.current.display(chapter.href);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* EPUB viewer fills entire space */}
      <div 
        ref={viewerRef}
        className={`flex-1 w-full bg-card ${isMobile ? "" : "max-w-4xl mx-auto rounded-lg shadow-2xl"}`}
      />

      {/* Controls overlay — only when UI visible */}
      {uiVisible && (
        <div className="absolute bottom-0 left-0 right-0 bg-card/90 backdrop-blur-sm border-t p-2 z-40 safe-area-inset-bottom">
          <div className="flex items-center justify-center gap-2 mb-2">
            <SwipeDirectionToggle direction={swipeDirection} onChange={setSwipeDirection} />
            {currentChapterLabel && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                {currentChapterLabel}
              </span>
            )}
          </div>

          {chapters.length > 0 && (
            <ChapterNavigation
              chapters={chapters}
              currentCfi={currentCfi}
              onChapterSelect={handleChapterSelect}
              fileType="epub"
            />
          )}
        </div>
      )}
    </div>
  );
};
