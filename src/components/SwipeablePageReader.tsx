import { useRef, useState, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface SwipeablePageReaderProps {
  children: React.ReactNode;
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  currentPage: number;
  totalPages: number | null;
  swipeDirection: "horizontal" | "vertical";
  onTap?: () => void;
  pagesUntilNextChapter?: number | null;
  currentChapterLabel?: string;
}

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

export const SwipeablePageReader = ({
  children,
  onNext,
  onPrev,
  canGoNext,
  canGoPrev,
  currentPage,
  totalPages,
  swipeDirection,
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
  const pageInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastOffsetRef = useRef(0);
  const hasMoved = useRef(false);

  const isHorizontal = swipeDirection === "horizontal";

  // Show page info popup on page change
  useEffect(() => {
    if (pageInfoTimerRef.current) clearTimeout(pageInfoTimerRef.current);
    setShowPageInfo(true);
    pageInfoTimerRef.current = setTimeout(() => setShowPageInfo(false), 2000);
    return () => {
      if (pageInfoTimerRef.current) clearTimeout(pageInfoTimerRef.current);
    };
  }, [currentPage]);

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

    if (Math.abs(primaryDelta) > 10) hasMoved.current = true;

    if (Math.abs(primaryDelta) > Math.abs(secondaryDelta) * 0.8) {
      e.preventDefault();
      let offset = primaryDelta;
      if ((offset > 0 && !canGoPrev) || (offset < 0 && !canGoNext)) {
        offset *= 0.3;
      }
      setDragOffset(offset);
      lastOffsetRef.current = offset;
    }
  }, [isAnimating, isHorizontal, canGoNext, canGoPrev]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || isAnimating) return;

    // Detect tap (no significant movement)
    if (!hasMoved.current) {
      onTap?.();
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
  }, [isAnimating, canGoNext, canGoPrev, onTap]);

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
    }, 300);
  }, [isHorizontal, onNext, onPrev]);

  const snapBack = useCallback(() => {
    setIsAnimating(true);
    setDragOffset(0);
    setTimeout(() => setIsAnimating(false), 300);
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

  const transform = isHorizontal
    ? `translateX(${dragOffset}px)`
    : `translateY(${dragOffset}px)`;

  // Calculate opacity for page turn effect
  const dragProgress = containerRef.current
    ? Math.abs(dragOffset) / (isHorizontal ? containerRef.current.offsetWidth : containerRef.current.offsetHeight)
    : 0;
  const contentOpacity = Math.max(0.4, 1 - dragProgress * 0.6);

  return (
    <div className="relative w-full h-full select-none overflow-hidden" ref={containerRef}>
      {/* Page turn content with transform */}
      <div
        className="w-full h-full"
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        onClick={!isMobile ? () => onTap?.() : undefined}
        style={{
          transform,
          opacity: isDragging ? contentOpacity : 1,
          transition: isDragging ? "none" : "transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.3s ease",
          touchAction: isHorizontal ? "pan-y" : "pan-x",
        }}
      >
        {children}
      </div>

      {/* Edge shadow during swipe for depth effect */}
      {isDragging && Math.abs(dragOffset) > 10 && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: isHorizontal
              ? dragOffset < 0
                ? "linear-gradient(to left, rgba(0,0,0,0.15) 0%, transparent 30%)"
                : "linear-gradient(to right, rgba(0,0,0,0.15) 0%, transparent 30%)"
              : dragOffset < 0
                ? "linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 30%)"
                : "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 30%)",
          }}
        />
      )}

      {/* Page info popup */}
      {showPageInfo && totalPages && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
          <div className="bg-foreground/85 text-background px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm shadow-lg flex flex-col items-center gap-0.5">
            <span>Page {currentPage} of {totalPages}</span>
            {pagesUntilNextChapter != null && pagesUntilNextChapter > 0 && (
              <span className="text-xs opacity-80">
                {pagesUntilNextChapter} {pagesUntilNextChapter === 1 ? "page" : "pages"} left in chapter
              </span>
            )}
            {currentChapterLabel && (
              <span className="text-xs opacity-70 truncate max-w-[200px]">{currentChapterLabel}</span>
            )}
          </div>
        </div>
      )}

      {/* Desktop navigation buttons */}
      {!isMobile && (
        <>
          {canGoPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); triggerPageTransition("prev"); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-foreground/10 hover:bg-foreground/20 text-foreground rounded-full p-2 transition-all opacity-0 hover:opacity-100 group-hover:opacity-100"
              style={{ opacity: undefined }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          )}
          {canGoNext && (
            <button
              onClick={(e) => { e.stopPropagation(); triggerPageTransition("next"); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-foreground/10 hover:bg-foreground/20 text-foreground rounded-full p-2 transition-all opacity-0"
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          )}
        </>
      )}
    </div>
  );
};
