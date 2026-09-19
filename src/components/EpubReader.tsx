import { useEffect, useRef, useState } from "react";
import ePub, { Book, Rendition, NavItem, Location as EpubLocation } from "epubjs";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, Settings } from "lucide-react";
import { ChapterNavigation, Chapter } from "./ChapterNavigation";
import { ReaderPagePill } from "./reader/ReaderPagePill";
import { ReaderProgressBar } from "./reader/ReaderProgressBar";
import { ReaderSettingsSheet } from "./reader/ReaderSettingsSheet";
import { Separator } from "@/components/ui/separator";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

interface EpubReaderProps {
  url: string | ArrayBuffer;
  onLocationChange?: (location: string, progressPercent: number) => void;
  onThemeChange?: (theme: string) => void;
  onToggleControls?: () => void;
  initialLocation?: string;
  showControls?: boolean;
}

// epub.js ships an incorrect signature here: locationFromCfi() returns the index of
// the location (-1 until locations are generated), not the DOM `Location`.
const locationIndexFromCfi = (locations: Book["locations"], cfi: string): number =>
  locations.locationFromCfi(cfi) as unknown as number;

const THEME_OPTIONS = [
  { id: "light", label: "Light", swatchClass: "bg-white" },
  { id: "sepia", label: "Sepia", swatchClass: "bg-[#f7f1e3]" },
  { id: "dark", label: "Dark", swatchClass: "bg-[#0b0f19]" },
  { id: "black", label: "Black", swatchClass: "bg-black" },
];

const FONT_OPTIONS = [
  { id: "Merriweather", label: "Merriweather" },
  { id: "Lora", label: "Lora" },
  { id: "Inter", label: "Inter" },
  { id: "System", label: "System" },
];

export const EpubReader = ({ url, onLocationChange, onThemeChange, onToggleControls, initialLocation, showControls = true }: EpubReaderProps) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const initialRenderCompletedRef = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentCfi, setCurrentCfi] = useState<string>("");
  const [currentChapterLabel, setCurrentChapterLabel] = useState<string>("");
  const [currentPageNum, setCurrentPageNum] = useState<number | null>(null);
  const [totalPagesCount, setTotalPagesCount] = useState<number | null>(null);
  const [showOverlayPage, setShowOverlayPage] = useState(false);
  const pageNumTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (currentPageNum !== null) {
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
  }, [currentPageNum]);

  const cleanEpubPath = (path: string): string => {
    if (!path) return "";
    let clean = path.split('#')[0];
    clean = clean.split('/').pop() || clean;
    try {
      clean = decodeURIComponent(clean);
    } catch (e) {}
    return clean.trim().toLowerCase();
  };
  const [theme, setTheme] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("epub_theme");
      if (stored) return stored;
    } catch (e) {}
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("epub_font_size");
      if (stored) return parseInt(stored, 10);
    } catch (e) {}
    return 18;
  });
  const [fontFamily, setFontFamily] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("epub_font_family");
      if (stored) return stored;
    } catch (e) {}
    return "Merriweather";
  });
  const [lineHeight, setLineHeight] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("epub_line_height");
      if (stored) return stored;
    } catch (e) {}
    return "1.6";
  });
  const [marginSize, setMarginSize] = useState<string>(() => {
    try {
      const stored = localStorage.getItem("epub_margin_size");
      if (stored) return stored;
    } catch (e) {}
    return "32px";
  });
  const [showUi, setShowUi] = useState<boolean>(showControls);
  const [progress, setProgress] = useState<number>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShowUi(showControls);
  }, [showControls]);

  useEffect(() => {
    try {
      localStorage.setItem("epub_theme", theme);
      localStorage.setItem("epub_font_size", fontSize.toString());
      localStorage.setItem("epub_font_family", fontFamily);
      localStorage.setItem("epub_line_height", lineHeight);
      localStorage.setItem("epub_margin_size", marginSize);
    } catch (e) {}
  }, [theme, fontSize, fontFamily, lineHeight, marginSize]);

  useEffect(() => {
    if (!viewerRef.current || !url) return;

    initialRenderCompletedRef.current = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;
    let active = true;

    const initBook = async () => {
      try {
        setLoading(true);
        setError(null);

        let inputData: ArrayBuffer;

        if (url instanceof ArrayBuffer) {
          inputData = url;
        } else if (typeof url === 'string') {
          // Fetch the EPUB file as an ArrayBuffer to bypass CORS and sandboxing completely
          if (url.startsWith('blob:')) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Blob fetch failed (Status ${res.status})`);
            inputData = await res.arrayBuffer();
          } else if (url.startsWith('data:')) {
            const base64 = url.split(',')[1];
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            inputData = bytes.buffer;
          } else if (url.includes('/local-file-route/')) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Local file not found on device (Status ${res.status})`);
            inputData = await res.arrayBuffer();
          } else {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`File fetch failed (Status ${res.status})`);
            inputData = await res.arrayBuffer();
          }
        } else {
          throw new Error('Invalid URL format');
        }

        if (!active) return;

        book = ePub(inputData, { openAs: "binary" });
        bookRef.current = book;

        // Await the book opened promise to catch zip parsing/corruption errors
        await book.opened;

        if (!active) return;

        rendition = book.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          spread: "none",
        });
        renditionRef.current = rendition;

        // Hook to inject serif and sans-serif Google Fonts inside the sandboxed iframe
        rendition.hooks.content.register((contents: any) => {
          const doc = contents.document;
          const link = doc.createElement("link");
          link.href = "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,700;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap";
          link.rel = "stylesheet";
          doc.head.appendChild(link);
        });

        // Initialize themes and styles
        const activeFont = fontFamily === "System" ? "system-ui, -apple-system, sans-serif" : fontFamily;
        const styles = {
          body: {
            "font-family": `${activeFont} !important`,
            "font-size": `${fontSize}px !important`,
            "line-height": `${lineHeight} !important`,
            "padding": `0 ${marginSize} !important`,
          },
          "p, span, div, h1, h2, h3, h4, h5, h6, li, ul, ol, section": {
            "background": "transparent !important",
            "background-color": "transparent !important",
            "color": "inherit !important",
          },
          p: {
            "font-family": `${activeFont} !important`,
            "font-size": `${fontSize}px !important`,
            "line-height": `${lineHeight} !important`,
            "margin-bottom": "1.2em !important",
          }
        };

        rendition.themes.register("light", {
          ...styles,
          body: { ...styles.body, "background-color": "#ffffff", "color": "#111827" }
        });

        rendition.themes.register("sepia", {
          ...styles,
          body: { ...styles.body, "background-color": "#f7f1e3", "color": "#5d4037" }
        });

        rendition.themes.register("dark", {
          ...styles,
          body: { ...styles.body, "background-color": "#0b0f19", "color": "#e5e7eb" }
        });

        rendition.themes.register("black", {
          ...styles,
          body: { ...styles.body, "background-color": "#000000", "color": "#e5e7eb" }
        });

        // Select the active theme (either loaded from localStorage or default)
        rendition.themes.select(theme);
        if (onThemeChange) {
          onThemeChange(theme);
        }
        rendition.themes.fontSize(`${fontSize}px`);

        // Gesture and interaction hooks inside Epub iframe document
        rendition.on("rendered", (section: any, iframe: any) => {
          const doc = iframe.document;
          let touchStartX = 0;
          let touchEndX = 0;

          // Click / Tap handler for hotspots and menu toggle
          doc.addEventListener("click", (e: MouseEvent) => {
            if ((e.target as HTMLElement).tagName === 'A') return;

            const clickX = e.clientX;
            const screenWidth = doc.documentElement.clientWidth;
            const leftZone = screenWidth * 0.3;
            const rightZone = screenWidth * 0.7;

            if (clickX < leftZone) {
              goToPreviousPage();
            } else if (clickX > rightZone) {
              goToNextPage();
            } else {
              onToggleControls?.();
            }
          });

          doc.addEventListener("touchstart", (e: TouchEvent) => {
            touchStartX = e.changedTouches[0].screenX;
          }, { passive: true });

          doc.addEventListener("touchend", (e: TouchEvent) => {
            if (touchStartX === 0) return;
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            touchStartX = 0; // Reset
            
            if (Math.abs(diff) > 60) {
              if (diff > 0) goToNextPage();
              else goToPreviousPage();
            }
          }, { passive: true });
        });

        // Load TOC Table of Contents
        book.loaded.navigation.then((navigation) => {
          if (!active) return;
          const toc = navigation.toc;
          const extractedChapters: Chapter[] = toc.map((item: NavItem, index: number) => ({
            id: item.id || `chapter-${index}`,
            label: item.label.trim(),
            href: item.href,
            cfi: item.href,
          }));
          setChapters(extractedChapters);
        });

        // Wait for book to be fully parsed and ready
        await book.ready;

        // Render target page
        try {
          if (initialLocation) {
            await rendition.display(initialLocation);
          } else {
            await rendition.display();
          }
        } catch (displayErr) {
          console.warn("Failed to render EPUB initial location, falling back to default:", displayErr);
          try {
            await rendition.display();
          } catch (fallbackErr) {
            console.error("Failed to render EPUB fallback:", fallbackErr);
            throw fallbackErr;
          }
        }

        if (!active) return;
        setLoading(false);
        initialRenderCompletedRef.current = true;

        book.ready.then(() => {
          if (!active) return;
          book.locations.generate(1024).then(() => {
            if (!active || !rendition) return;
            // currentLocation() resolves to a { start, end, atStart, atEnd } Location at
            // runtime; the bundled types declare the narrower DisplayedLocation.
            const currentLocation = rendition.currentLocation() as unknown as EpubLocation;
            if (currentLocation && currentLocation.start) {
              const progressPercent = Math.max(0, Math.min(100, Math.round(book.locations.percentageFromCfi(currentLocation.start.cfi) * 100)));
              setProgress(progressPercent);
              
              const locIndex = locationIndexFromCfi(book.locations, currentLocation.start.cfi);
              if (locIndex !== -1) {
                setCurrentPageNum(locIndex + 1);
                setTotalPagesCount(book.locations.length());
              }
              
              if (initialRenderCompletedRef.current && onLocationChange) {
                onLocationChange(currentLocation.start.cfi, progressPercent);
              }
            }
          }).catch(() => {});
        });

        rendition.on("relocated", (location: any) => {
          if (!active) return;
          setCanGoBack(!location.atStart);
          setCanGoForward(!location.atEnd);

          const cfi = location.start?.cfi || "";
          setCurrentCfi(cfi);

          // Match active chapter title
          if (book && location.start?.href) {
            const currentHref = location.start.href;
            book.loaded.navigation.then((navigation) => {
              if (!active) return;
              const currentHrefClean = cleanEpubPath(currentHref);
              const currentItem = navigation.toc.find((item: NavItem) => {
                if (!item.href) return false;
                const itemHrefClean = cleanEpubPath(item.href);
                return itemHrefClean === currentHrefClean || currentHrefClean.includes(itemHrefClean) || itemHrefClean.includes(currentHrefClean);
              });
              if (currentItem) {
                setCurrentChapterLabel(currentItem.label.trim());
              }
            });
          }

          if (location.start) {
            let progressPercent = 0;
            if (location.start.percentage !== undefined && location.start.percentage !== null && location.start.percentage !== 0) {
              progressPercent = Math.max(0, Math.min(100, Math.round(location.start.percentage * 100)));
            } else if (bookRef.current && bookRef.current.locations && bookRef.current.locations.length() > 0) {
              progressPercent = Math.max(0, Math.min(100, Math.round(bookRef.current.locations.percentageFromCfi(location.start.cfi) * 100)));
            }
            setProgress(progressPercent);
            
            // Update page numbers if locations are generated
            if (bookRef.current && bookRef.current.locations && bookRef.current.locations.length() > 0) {
              const locIndex = locationIndexFromCfi(bookRef.current.locations, location.start.cfi);
              if (locIndex !== -1) {
                setCurrentPageNum(locIndex + 1);
                setTotalPagesCount(bookRef.current.locations.length());
              }
            }
            
            if (initialRenderCompletedRef.current && onLocationChange) {
              onLocationChange(location.start.cfi, progressPercent);
            }
          }
        });

      } catch (err: any) {
        console.error("Failed to load EPUB:", err);
        if (active) {
          setError(err.message || "Could not render EPUB container.");
          setLoading(false);
        }
      }
    };

    const safetyTimeout = setTimeout(() => {
      if (active) {
        console.warn("EPUB loading safety timeout triggered. Hiding loader.");
        setLoading(false);
      }
    }, 6000);

    initBook();

    return () => {
      active = false;
      clearTimeout(safetyTimeout);
      if (rendition) rendition.destroy();
      if (book) book.destroy();
    };
  }, [url]);

  const applyStyles = () => {
    if (!renditionRef.current) return;
    
    const activeFont = fontFamily === "System" ? "system-ui, -apple-system, sans-serif" : fontFamily;
    const styles = {
      body: {
        "font-family": `${activeFont} !important`,
        "font-size": `${fontSize}px !important`,
        "line-height": `${lineHeight} !important`,
        "padding": `0 ${marginSize} !important`,
      },
      "p, span, div, h1, h2, h3, h4, h5, h6, li, ul, ol, section": {
        "background": "transparent !important",
        "background-color": "transparent !important",
        "color": "inherit !important",
      },
      p: {
        "font-family": `${activeFont} !important`,
        "font-size": `${fontSize}px !important`,
        "line-height": `${lineHeight} !important`,
        "margin-bottom": "1.2em !important",
      }
    };

    renditionRef.current.themes.register("light", {
      ...styles,
      body: { ...styles.body, "background-color": "#ffffff", "color": "#111827" }
    });

    renditionRef.current.themes.register("sepia", {
      ...styles,
      body: { ...styles.body, "background-color": "#f7f1e3", "color": "#5d4037" }
    });

    renditionRef.current.themes.register("dark", {
      ...styles,
      body: { ...styles.body, "background-color": "#0b0f19", "color": "#e5e7eb" }
    });

    renditionRef.current.themes.register("black", {
      ...styles,
      body: { ...styles.body, "background-color": "#000000", "color": "#e5e7eb" }
    });

    renditionRef.current.themes.select(theme);
    renditionRef.current.themes.fontSize(`${fontSize}px`);
  };

  useEffect(() => {
    applyStyles();
  }, [theme, fontSize, fontFamily, lineHeight, marginSize]);

  // Adjust theme on theme changes
  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
  };

  // Scrub the shared progress bar: map a percentage back to a cfi.
  const handleSeek = (percent: number) => {
    const locations = bookRef.current?.locations;
    if (!locations || locations.length() === 0 || !renditionRef.current) return;
    const cfi = locations.cfiFromPercentage(Math.max(0, Math.min(100, percent)) / 100);
    if (cfi) renditionRef.current.display(cfi);
  };

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

  const getThemeBgClass = () => {
    if (theme === "black") return "bg-black text-gray-200";
    if (theme === "dark") return "bg-[#0b0f19] text-gray-200";
    if (theme === "sepia") return "bg-[#f7f1e3] text-[#5d4037]";
    return "bg-white text-gray-900";
  };

  return (
    <div className={`flex flex-col w-full max-w-4xl mx-auto h-[86vh] border border-border/40 rounded-2xl overflow-hidden shadow-2xl relative transition-colors duration-300 ${getThemeBgClass()}`}>
      
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium text-muted-foreground animate-pulse">Preparing publication container...</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center z-45 text-center px-6">
          <p className="text-destructive font-semibold mb-2">Failed to render book</p>
          <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        </div>
      )}

      {/* Appearance settings, shared with the other readers */}
      <ReaderSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Appearance"
        theme={{ value: theme, onChange: handleThemeChange, options: THEME_OPTIONS }}
        fontFamily={{ value: fontFamily, onChange: setFontFamily, options: FONT_OPTIONS }}
        fontSize={{
          value: fontSize,
          onChange: setFontSize,
          min: 12,
          max: 32,
          format: (v) => `${v}px`,
        }}
        lineHeight={{
          // Persisted as a string so the stored epub_line_height value keeps its shape.
          value: parseFloat(lineHeight) || 1.6,
          onChange: (v) => setLineHeight(v.toFixed(1)),
          min: 1.2,
          max: 2.2,
          step: 0.1,
          format: (v) => v.toFixed(1),
        }}
        margin={{
          value: parseInt(marginSize, 10) || 32,
          onChange: (v) => setMarginSize(`${v}px`),
          min: 8,
          max: 64,
          step: 4,
          format: (v) => `${v}px`,
        }}
      />

      {/* Reader Top Toolbar */}
      <div className={`flex items-center justify-between px-3 sm:px-4 py-2 border-b bg-muted/20 absolute top-0 left-0 right-0 z-30 transition-all duration-300 transform ${
        showUi ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
      }`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {chapters.length > 0 && (
            <ChapterNavigation
              chapters={chapters}
              currentCfi={currentCfi}
              activeChapterLabel={currentChapterLabel}
              onChapterSelect={handleChapterSelect}
              fileType="epub"
            />
          )}
          {/* The chapter pill already names the chapter; on phones repeating it here
              only squeezed both into truncation. Shown alone when there is no pill. */}
          <span className={`text-xs font-bold truncate max-w-[150px] sm:max-w-xs opacity-90 ${chapters.length > 0 ? "hidden sm:inline" : ""}`}>
            {currentChapterLabel || "Reading..."}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            aria-label="Appearance settings"
            onClick={() => setSettingsOpen(prev => !prev)}
            title="Appearance Settings (Aa)"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Reader Page Content & Side Controls */}
      <div className="relative flex-1 min-h-0 bg-inherit w-full pt-12 pb-10">
        
        {/* Left click margin navigation hotspots */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToPreviousPage();
          }}
          disabled={!canGoBack}
          className="absolute left-0 top-12 bottom-10 w-[30%] cursor-w-resize z-10 disabled:pointer-events-none opacity-0"
        />

        {/* Center click margin to toggle menu */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleControls?.();
          }}
          className="absolute left-[30%] right-[30%] top-12 bottom-10 cursor-pointer z-10 opacity-0"
        />

        {/* epub.js target iframe mount */}
        <div ref={viewerRef} className="w-full h-full px-2 sm:px-6 py-2" />

        {/* Right click margin navigation hotspots */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            goToNextPage();
          }}
          disabled={!canGoForward}
          className="absolute right-0 top-12 bottom-10 w-[30%] cursor-e-resize z-10 disabled:pointer-events-none opacity-0"
        />
      </div>

      {/* Transient location indicator */}
      {currentPageNum !== null && (
        <ReaderPagePill
          current={currentPageNum}
          total={totalPagesCount}
          visible={showOverlayPage}
        />
      )}

      {/* Reader progress, shared with the other readers */}
      <ReaderProgressBar
        percent={progress}
        visible={showUi}
        onSeek={handleSeek}
        caption={
          currentPageNum && totalPagesCount
            ? `${currentPageNum} / ${totalPagesCount} · ${progress}%`
            : `${progress}%`
        }
        leading={
          <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
            Tap margins to turn pages
          </span>
        }
      />
    </div>
  );
};
