import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Page } from "react-pdf";
import { Progress } from "@/components/ui/progress";

interface ScrollModePDFProps {
  numPages: number;
  scale: number;
  initialPage?: number;
  /** Pixels to offset for sticky headers (mobile/desktop) */
  topOffset?: number;
  onPageChange: (page: number) => void;
}

type IntersectionState = {
  ratio: number;
  top: number;
};

export interface ScrollModePDFHandle {
  scrollToPage: (page: number) => void;
}

export const ScrollModePDF = forwardRef<ScrollModePDFHandle, ScrollModePDFProps>(({
  numPages,
  scale,
  initialPage = 1,
  topOffset = 96,
  onPageChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // IMPORTANT: capture the initial page only once per mount.
  const initialPageRef = useRef<number>(initialPage);
  const hasScrolledToInitial = useRef(false);
  const isInitializingRef = useRef<boolean>(initialPageRef.current > 1);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const intersectionStateRef = useRef<Map<number, IntersectionState>>(new Map());

  const [visiblePage, setVisiblePage] = useState(initialPageRef.current);

  const scrollToPageWithOffset = useCallback((page: number, behavior: ScrollBehavior = "auto") => {
    const el = pageRefs.current.get(page);
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    const targetTop = rect.top + window.scrollY - Math.max(0, topOffset) - 8;
    window.scrollTo({ top: Math.max(0, targetTop), behavior });
    return true;
  }, [topOffset]);

  // Expose scrollToPage method for parent to use
  useImperativeHandle(ref, () => ({
    scrollToPage: (page: number) => {
      const clampedPage = Math.min(Math.max(1, page), numPages);
      
      // Try to scroll immediately if page is rendered
      const didScroll = scrollToPageWithOffset(clampedPage, "smooth");
      
      if (!didScroll) {
        // Page not yet in DOM, retry a few times
        let attempts = 0;
        const tryScroll = () => {
          if (scrollToPageWithOffset(clampedPage, "smooth")) return;
          attempts++;
          if (attempts < 20) setTimeout(tryScroll, 100);
        };
        setTimeout(tryScroll, 50);
      }
    }
  }), [numPages, scrollToPageWithOffset]);

  // Scroll to initial page on mount / after pages appear
  useEffect(() => {
    if (hasScrolledToInitial.current) return;

    const targetPage = Math.min(
      Math.max(1, initialPageRef.current),
      Math.max(1, numPages || 1)
    );

    // Page 1 doesn't need a jump; still allow observer immediately.
    if (targetPage <= 1) {
      hasScrolledToInitial.current = true;
      isInitializingRef.current = false;
      return;
    }

    isInitializingRef.current = true;
    setVisiblePage(targetPage);

    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;

      const didScroll = scrollToPageWithOffset(targetPage);
      if (didScroll) {
        hasScrolledToInitial.current = true;
        // Let layout/scroll settle before enabling observer updates
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isInitializingRef.current = false;
          });
        });
        return;
      }

      attempts += 1;
      if (attempts < 40) {
        setTimeout(tryScroll, 100);
      } else {
        // Give up gracefully
        isInitializingRef.current = false;
      }
    };

    // Try soon, but allow first paint
    setTimeout(tryScroll, 0);

    return () => {
      cancelled = true;
    };
  }, [numPages, scrollToPageWithOffset]);

  // Set up intersection observer to detect which page is currently "active"
  useEffect(() => {
    if (!containerRef.current) return;

    // Reset stored intersection state on rebuild
    intersectionStateRef.current = new Map();

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // During initialization (switching from page -> scroll) we ignore observer updates,
        // otherwise it will immediately snap to page 1 before we scroll to the target.
        if (isInitializingRef.current) return;

        for (const entry of entries) {
          const pageNum = parseInt(entry.target.getAttribute("data-page") || "1");
          intersectionStateRef.current.set(pageNum, {
            ratio: entry.isIntersecting ? entry.intersectionRatio : 0,
            top: entry.boundingClientRect.top,
          });
        }

        // Pick the best candidate:
        // 1) highest intersection ratio
        // 2) tie-breaker: closest to the header offset line
        let bestPage = 1;
        let bestRatio = -1;
        let bestDistance = Number.POSITIVE_INFINITY;

        intersectionStateRef.current.forEach((state, pageNum) => {
          if (state.ratio <= 0) return;

          const distance = Math.abs(state.top - Math.max(0, topOffset));
          if (state.ratio > bestRatio || (state.ratio === bestRatio && distance < bestDistance)) {
            bestRatio = state.ratio;
            bestDistance = distance;
            bestPage = pageNum;
          }
        });

        if (bestRatio > 0) {
          setVisiblePage((prev) => (prev === bestPage ? prev : bestPage));
        }
      },
      {
        root: null,
        // Compensate for the sticky reader header (especially on mobile)
        rootMargin: `-${Math.max(0, Math.round(topOffset))}px 0px -60% 0px`,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );

    // Observe all page elements
    pageRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [numPages, topOffset]);

  // Notify parent of page change (but not during initialization)
  useEffect(() => {
    if (isInitializingRef.current) return;
    onPageChange(visiblePage);
  }, [visiblePage, onPageChange]);

  const setPageRef = useCallback((page: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(page, element);
      observerRef.current?.observe(element);
    } else {
      const existingElement = pageRefs.current.get(page);
      if (existingElement) {
        observerRef.current?.unobserve(existingElement);
      }
      pageRefs.current.delete(page);
      intersectionStateRef.current.delete(page);
    }
  }, []);

  const progressPercent = numPages > 0 ? (visiblePage / numPages) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="space-y-4 w-full max-w-4xl mx-auto pb-20 px-2 sm:px-0"
    >
      {/* Fixed progress bar at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-sm border-t px-4 py-2">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Progress value={progressPercent} className="flex-1 h-2" />
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {visiblePage} / {numPages}
          </span>
        </div>
      </div>

      {/* Current page indicator - sticky */}
      <div className="sticky z-40 flex justify-center pointer-events-none" style={{ top: topOffset }}>
        <div className="bg-background/95 backdrop-blur-sm border rounded-full px-4 py-1.5 shadow-sm pointer-events-auto">
          <span className="text-sm font-medium">
            Page {visiblePage} of {numPages}
          </span>
        </div>
      </div>

      {/* Render all pages */}
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
        <div
          key={pageNum}
          ref={(el) => setPageRef(pageNum, el)}
          data-page={pageNum}
          className="shadow-lg rounded overflow-hidden bg-card border border-border/50 mx-auto"
          style={{ maxWidth: "100%" }}
        >
          <Page
            pageNumber={pageNum}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            className="mx-auto [&_.react-pdf__Page__canvas]:!max-w-full [&_.react-pdf__Page__canvas]:!h-auto"
            loading={
              <div className="flex items-center justify-center h-[400px] sm:h-[600px] bg-muted/30">
                <span className="text-muted-foreground text-sm">Loading page {pageNum}...</span>
              </div>
            }
          />
        </div>
      ))}
    </div>
  );
});

