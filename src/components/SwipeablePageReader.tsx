import { useRef, useState, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

interface SwipeablePageReaderProps {
  children: React.ReactNode;
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  currentPage: number;
  totalPages: number | null;
  swipeDirection: "horizontal" | "vertical";
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
}: SwipeablePageReaderProps) => {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastOffsetRef = useRef(0);

  const isHorizontal = swipeDirection === "horizontal";

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setIsDragging(true);
    lastOffsetRef.current = 0;
  }, [isAnimating]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || isAnimating) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    const primaryDelta = isHorizontal ? dx : dy;
    const secondaryDelta = isHorizontal ? dy : dx;

    // Only track swipe if primary axis dominates
    if (Math.abs(primaryDelta) > Math.abs(secondaryDelta) * 0.8) {
      e.preventDefault();
      // Clamp with resistance at edges
      let offset = primaryDelta;
      if ((offset > 0 && !canGoPrev) || (offset < 0 && !canGoNext)) {
        offset *= 0.3; // rubber-band effect
      }
      setDragOffset(offset);
      lastOffsetRef.current = offset;
    }
  }, [isAnimating, isHorizontal, canGoNext, canGoPrev]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || isAnimating) return;

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
  }, [isAnimating, canGoNext, canGoPrev]);

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
    }, 250);
  }, [isHorizontal, onNext, onPrev]);

  const snapBack = useCallback(() => {
    setIsAnimating(true);
    setDragOffset(0);
    setTimeout(() => setIsAnimating(false), 250);
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (canGoNext) onNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (canGoPrev) onPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGoNext, canGoPrev, onNext, onPrev]);

  const transform = isHorizontal
    ? `translateX(${dragOffset}px)`
    : `translateY(${dragOffset}px)`;

  const PrevIcon = isHorizontal ? ChevronLeft : ChevronUp;
  const NextIcon = isHorizontal ? ChevronRight : ChevronDown;

  return (
    <div className="relative w-full select-none" ref={containerRef}>
      {/* Swipe hint indicators (mobile only) */}
      {isMobile && isDragging && (
        <>
          {dragOffset > 20 && canGoPrev && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-primary/80 text-primary-foreground rounded-full p-2 animate-pulse">
              <PrevIcon className="w-5 h-5" />
            </div>
          )}
          {dragOffset < -20 && canGoNext && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-primary/80 text-primary-foreground rounded-full p-2 animate-pulse">
              <NextIcon className="w-5 h-5" />
            </div>
          )}
        </>
      )}

      {/* Content with swipe transform */}
      <div
        className="w-full overflow-hidden"
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        style={{
          transform,
          transition: isDragging ? "none" : "transform 0.25s ease-out",
          touchAction: isHorizontal ? "pan-y" : "pan-x",
        }}
      >
        {children}
      </div>

      {/* Desktop buttons (hidden on mobile) */}
      {!isMobile && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={canGoPrev ? onPrev : undefined}
            disabled={!canGoPrev}
            className="flex items-center gap-1 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium disabled:opacity-40 hover:bg-accent/10 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {currentPage} / {totalPages || "..."}
          </span>
          <button
            onClick={canGoNext ? onNext : undefined}
            disabled={!canGoNext}
            className="flex items-center gap-1 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium disabled:opacity-40 hover:bg-accent/10 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mobile page indicator */}
      {isMobile && (
        <div className="flex justify-center mt-3">
          <span className="text-xs font-medium text-muted-foreground bg-muted/80 px-3 py-1 rounded-full">
            {currentPage} / {totalPages || "..."}
          </span>
        </div>
      )}
    </div>
  );
};
