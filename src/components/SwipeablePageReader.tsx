import { useRef, useState, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Progress } from "@/components/ui/progress";

interface SwipeablePageReaderProps {
  renderPage: (pageNum: number) => React.ReactNode;
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  currentPage: number;
  totalPages: number | null;
  swipeDirection: "horizontal" | "vertical";
  animationMode: "slide" | "curl";
  onTap?: () => void;
  pagesUntilNextChapter?: number | null;
  currentChapterLabel?: string;
}

const SWIPE_THRESHOLD = 40;
const SWIPE_VELOCITY_THRESHOLD = 0.25;

export const SwipeablePageReader = ({
  renderPage,
  onNext,
  onPrev,
  canGoNext,
  canGoPrev,
  currentPage,
  totalPages,
  swipeDirection,
  animationMode,
  onTap,
  pagesUntilNextChapter,
  currentChapterLabel,
}: SwipeablePageReaderProps) => {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPageInfo, setShowPageInfo] = useState(false);
  const [pageInfoFading, setPageInfoFading] = useState(false);
  const pageInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastOffsetRef = useRef(0);
  const hasMoved = useRef(false);

  const isHorizontal = swipeDirection === "horizontal";
  const isCurl = animationMode === "curl";

  // Show page info popup on page change
  useEffect(() => {
    if (pageInfoTimerRef.current) clearTimeout(pageInfoTimerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setShowPageInfo(true);
    setPageInfoFading(false);
    fadeTimerRef.current = setTimeout(() => setPageInfoFading(true), 1200);
    pageInfoTimerRef.current = setTimeout(() => setShowPageInfo(false), 1700);
    return () => {
      if (pageInfoTimerRef.current) clearTimeout(pageInfoTimerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [currentPage]);

  // --- Touch handling ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setIsDragging(true);
    lastOffsetRef.current = 0;
    hasMoved.current = false;
  }, [isAnimating]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isAnimating) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    const primaryDelta = isHorizontal ? dx : dy;
    const secondaryDelta = isHorizontal ? dy : dx;

    if (Math.abs(primaryDelta) > 8) hasMoved.current = true;

    if (Math.abs(primaryDelta) > Math.abs(secondaryDelta) * 0.7) {
      e.preventDefault();
      let offset = primaryDelta;
      // Dampen if can't go in that direction
      if ((offset > 0 && !canGoPrev) || (offset < 0 && !canGoNext)) {
        offset *= 0.2;
      }
      setDragOffset(offset);
      lastOffsetRef.current = offset;
    }
  }, [isAnimating, isHorizontal, canGoNext, canGoPrev]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || isAnimating) return;

    // Detect tap (no significant movement) — use tap zones
    if (!hasMoved.current) {
      const touch = touchStartRef.current;
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const relX = (touch.x - rect.left) / rect.width;
        const relY = (touch.y - rect.top) / rect.height;

        // Center 40% = toggle UI, left 30% = prev, right 30% = next
        if (isHorizontal) {
          if (relX < 0.3 && canGoPrev) {
            triggerPageTransition("prev");
          } else if (relX > 0.7 && canGoNext) {
            triggerPageTransition("next");
          } else {
            onTap?.();
          }
        } else {
          if (relY < 0.3 && canGoPrev) {
            triggerPageTransition("prev");
          } else if (relY > 0.7 && canGoNext) {
            triggerPageTransition("next");
          } else {
            onTap?.();
          }
        }
      } else {
        onTap?.();
      }

      touchStartRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    const offset = lastOffsetRef.current;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = Math.abs(offset) / elapsed;

    const shouldNavigate = Math.abs(offset) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;

    if (shouldNavigate) {
      if (offset > 0 && canGoPrev) {
        triggerPageTransition("prev");
      } else if (offset < 0 && canGoNext) {
        triggerPageTransition("next");
      } else {
        snapBack();
      }
    } else {
      snapBack();
    }

    touchStartRef.current = null;
    setIsDragging(false);
  }, [isAnimating, canGoNext, canGoPrev, onTap, isHorizontal]);

  const triggerPageTransition = useCallback((direction: "next" | "prev") => {
    setIsAnimating(true);
    const containerSize = isHorizontal
      ? containerRef.current?.offsetWidth || 400
      : containerRef.current?.offsetHeight || 600;
    setDragOffset(direction === "next" ? -containerSize : containerSize);

    setTimeout(() => {
      if (direction === "next") onNext();
      else onPrev();
      setDragOffset(0);
      setIsAnimating(false);
    }, 320);
  }, [isHorizontal, onNext, onPrev]);

  const snapBack = useCallback(() => {
    setIsAnimating(true);
    setDragOffset(0);
    setTimeout(() => setIsAnimating(false), 320);
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (canGoNext) triggerPageTransition("next");
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (canGoPrev) triggerPageTransition("prev");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGoNext, canGoPrev, triggerPageTransition]);

  // --- Determine which adjacent page to show ---
  const showingNext = dragOffset < 0;
  const showingPrev = dragOffset > 0;
  const adjacentPage = showingNext ? currentPage + 1 : showingPrev ? currentPage - 1 : null;

  // --- Slide animation transforms ---
  const containerSize = containerRef.current
    ? (isHorizontal ? containerRef.current.offsetWidth : containerRef.current.offsetHeight)
    : 0;
  const dragProgress = containerSize ? Math.abs(dragOffset) / containerSize : 0;

  const currentTransform = isHorizontal
    ? `translateX(${dragOffset}px)`
    : `translateY(${dragOffset}px)`;

  // Adjacent page starts off-screen and slides in
  const adjacentTransform = isHorizontal
    ? showingNext
      ? `translateX(${containerSize + dragOffset}px)`
      : `translateX(${-containerSize + dragOffset}px)`
    : showingNext
      ? `translateY(${containerSize + dragOffset}px)`
      : `translateY(${-containerSize + dragOffset}px)`;

  // --- Curl animation ---
  const curlAngle = Math.min(180, dragProgress * 180);
  const curlClipPercent = Math.max(0, 100 - dragProgress * 100);

  const transitionStyle = isDragging
    ? "none"
    : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), clip-path 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease";

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden"
      ref={containerRef}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* === SLIDE MODE === */}
      {!isCurl && (
        <>
          {/* Adjacent (incoming) page — rendered behind current */}
          {adjacentPage != null && adjacentPage >= 1 && (!totalPages || adjacentPage <= totalPages) && (
            <div
              className="absolute inset-0 w-full h-full z-0"
              style={{
                transform: adjacentTransform,
                transition: transitionStyle,
              }}
            >
              {renderPage(adjacentPage)}
            </div>
          )}

          {/* Current page */}
          <div
            className="absolute inset-0 w-full h-full z-10"
            style={{
              transform: currentTransform,
              transition: transitionStyle,
              boxShadow: isDragging && Math.abs(dragOffset) > 5
                ? (showingNext
                  ? "-6px 0 20px rgba(0,0,0,0.15)"
                  : "6px 0 20px rgba(0,0,0,0.15)")
                : "none",
            }}
            onClick={!isMobile ? () => onTap?.() : undefined}
          >
            {renderPage(currentPage)}
          </div>
        </>
      )}

      {/* === CURL MODE === */}
      {isCurl && (
        <>
          {/* Next page underneath */}
          {adjacentPage != null && adjacentPage >= 1 && (!totalPages || adjacentPage <= totalPages) && (
            <div className="absolute inset-0 w-full h-full z-0">
              {renderPage(adjacentPage)}
              {/* Darkened overlay that lightens as curl progresses */}
              <div
                className="absolute inset-0 bg-black pointer-events-none"
                style={{
                  opacity: Math.max(0, 0.3 - dragProgress * 0.3),
                  transition: isDragging ? "none" : "opacity 0.32s ease",
                }}
              />
            </div>
          )}

          {/* Current page with curl clip */}
          <div
            className="absolute inset-0 w-full h-full z-10"
            style={{
              clipPath: isHorizontal
                ? showingNext
                  ? `inset(0 ${100 - curlClipPercent}% 0 0)`
                  : `inset(0 0 0 ${100 - curlClipPercent}%)`
                : showingNext
                  ? `inset(0 0 ${100 - curlClipPercent}% 0)`
                  : `inset(${100 - curlClipPercent}% 0 0 0)`,
              transition: transitionStyle,
            }}
            onClick={!isMobile ? () => onTap?.() : undefined}
          >
            {renderPage(currentPage)}
          </div>

          {/* Curl shadow line — the edge where the page folds */}
          {isDragging && Math.abs(dragOffset) > 10 && (
            <div
              className="absolute z-20 pointer-events-none"
              style={isHorizontal ? {
                top: 0,
                bottom: 0,
                width: "20px",
                [showingNext ? "right" : "left"]: `${curlClipPercent}%`,
                transform: "translateX(-50%)",
                background: "linear-gradient(to right, rgba(0,0,0,0.12), transparent)",
              } : {
                left: 0,
                right: 0,
                height: "20px",
                [showingNext ? "bottom" : "top"]: `${curlClipPercent}%`,
                transform: "translateY(-50%)",
                background: "linear-gradient(to bottom, rgba(0,0,0,0.12), transparent)",
              }}
            />
          )}
        </>
      )}

      {/* No adjacent page and not dragging: just show current page (fallback) */}
      {!isDragging && !isAnimating && !isCurl && (
        <div
          className="absolute inset-0 w-full h-full z-10"
          style={{ transform: "none" }}
          onClick={!isMobile ? () => onTap?.() : undefined}
        >
          {renderPage(currentPage)}
        </div>
      )}

      {/* Page info popup */}
      {showPageInfo && totalPages && (
        <div
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 transition-opacity duration-500 ${
            pageInfoFading ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="bg-foreground/85 text-background px-4 py-2.5 rounded-2xl text-sm font-medium backdrop-blur-md shadow-lg flex flex-col items-center gap-1">
            <span>Page {currentPage} of {totalPages}</span>
            {pagesUntilNextChapter != null && pagesUntilNextChapter > 0 && (
              <span className="text-xs opacity-80">
                {pagesUntilNextChapter} {pagesUntilNextChapter === 1 ? "page" : "pages"} left in chapter
              </span>
            )}
            {currentChapterLabel && (
              <span className="text-xs opacity-70 truncate max-w-[220px]">{currentChapterLabel}</span>
            )}
            {/* Thin progress bar */}
            <div className="w-32 mt-1">
              <Progress value={(currentPage / totalPages) * 100} className="h-1" />
            </div>
          </div>
        </div>
      )}

      {/* Desktop navigation buttons (invisible until hover) */}
      {!isMobile && (
        <>
          {canGoPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); triggerPageTransition("prev"); }}
              className="absolute left-0 top-0 bottom-0 w-16 z-20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200"
            >
              <div className="bg-foreground/10 hover:bg-foreground/20 text-foreground rounded-full p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </div>
            </button>
          )}
          {canGoNext && (
            <button
              onClick={(e) => { e.stopPropagation(); triggerPageTransition("next"); }}
              className="absolute right-0 top-0 bottom-0 w-16 z-20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200"
            >
              <div className="bg-foreground/10 hover:bg-foreground/20 text-foreground rounded-full p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </div>
            </button>
          )}
        </>
      )}
    </div>
  );
};
