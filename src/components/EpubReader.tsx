import { useEffect, useRef, useState } from "react";
import ePub, { Book, Rendition, NavItem } from "epubjs";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChapterNavigation, Chapter } from "./ChapterNavigation";

interface EpubReaderProps {
  url: string;
  onLocationChange?: (location: string) => void;
  initialLocation?: string;
  showControls?: boolean;
}

export const EpubReader = ({ url, onLocationChange, initialLocation, showControls = true }: EpubReaderProps) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentCfi, setCurrentCfi] = useState<string>("");
  const [currentChapterLabel, setCurrentChapterLabel] = useState<string>("");

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

    // Define themes with large readable fonts (20px) and standard line heights (1.6)
    rendition.themes.register("light", {
      body: {
        "background-color": "#ffffff",
        "color": "#111827",
        "font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
        "font-size": "20px !important",
        "line-height": "1.6 !important",
        "padding": "0 16px !important",
      },
      p: {
        "font-size": "20px !important",
        "line-height": "1.6 !important",
      }
    });

    rendition.themes.register("dark", {
      body: {
        "background-color": "#111827",
        "color": "#f3f4f6",
        "font-family": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
        "font-size": "20px !important",
        "line-height": "1.6 !important",
        "padding": "0 16px !important",
      },
      p: {
        "font-size": "20px !important",
        "line-height": "1.6 !important",
      }
    });

    const isDark = document.documentElement.classList.contains("dark");
    rendition.themes.select(isDark ? "dark" : "light");

    const observer = new MutationObserver(() => {
      const currentDark = document.documentElement.classList.contains("dark");
      rendition.themes.select(currentDark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

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
      // Track location changes
      rendition.on("relocated", (location: any) => {
        setCanGoBack(!location.atStart);
        setCanGoForward(!location.atEnd);
        
        const cfi = location.start?.cfi || "";
        setCurrentCfi(cfi);
        
        // Find current chapter
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
    });

    return () => {
      observer.disconnect();
      rendition.destroy();
      book.destroy();
    };
  }, [url, initialLocation, onLocationChange]);

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
    <div className="flex flex-col items-center gap-4 w-full">
      <div 
        ref={viewerRef}
        className="w-[90%] sm:w-full max-w-4xl bg-white dark:bg-gray-900 rounded-lg shadow-2xl mx-auto"
        style={{ height: "70vh" }}
      />
      
      <div className={`flex flex-col items-center gap-3 w-full transition-all duration-300 ${
        showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}>
        <div className="flex items-center gap-4">
          <Button
            onClick={goToPreviousPage}
            disabled={!canGoBack}
            variant="outline"
            size="sm"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <Button
            onClick={goToNextPage}
            disabled={!canGoForward}
            variant="outline"
            size="sm"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Chapter Navigation */}
        {chapters.length > 0 && (
          <ChapterNavigation
            chapters={chapters}
            currentCfi={currentCfi}
            onChapterSelect={handleChapterSelect}
            fileType="epub"
          />
        )}
      </div>
    </div>
  );
};
