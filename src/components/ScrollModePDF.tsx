import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, CSSProperties } from "react";
import { Page } from "react-pdf";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReaderPagePill } from "@/components/reader/ReaderPagePill";
import { ReaderProgressBar } from "@/components/reader/ReaderProgressBar";
import { ReaderSettingsSheet } from "@/components/reader/ReaderSettingsSheet";

interface ScrollModePDFProps {
  numPages: number;
  scale: number;
  width: number;
  initialPage?: number;
  /** Pixels to offset for sticky headers (mobile/desktop) */
  topOffset?: number;
  onPageChange: (page: number) => void;
  /** When provided, a zoom slider is offered in the reader settings sheet. */
  onScaleChange?: (scale: number) => void;
  showControls?: boolean;
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
  width,
  initialPage = 1,
  topOffset = 96,
  onPageChange,
  onScaleChange,
  showControls = true,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Where we still owe the reader a jump to. Seeded from the prop, but allowed to
  // move forward while the parent is still resolving the saved page (see below).
  const [resumeTarget, setResumeTarget] = useState(initialPage);
  const hasScrolledToInitial = useRef(false);
  const isInitializingRef = useRef<boolean>(initialPage > 1);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const intersectionStateRef = useRef<Map<number, IntersectionState>>(new Map());

  const [visiblePage, setVisiblePage] = useState(initialPage);
  const lastNotifiedRef = useRef<number>(initialPage);
  const hasReportedRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // The parent loads last_page_read asynchronously, so it can still be 1 when this
  // child mounts. Adopt a later, larger initialPage - but never yank a reader who
  // has already scrolled away from the target on their own.
  useEffect(() => {
    if (hasScrolledToInitial.current) return;
    // Once we have reported a page, initialPage is only an echo of our own position,
    // so adopting it would yank a reader who scrolled back to the top.
    if (hasReportedRef.current) return;
    if (initialPage <= resumeTarget || visiblePage !== resumeTarget) return;
    // Set synchronously so the notify effect below cannot report page 1 back to
    // the parent in this same commit and overwrite the saved position.
    isInitializingRef.current = true;
    setResumeTarget(initialPage);
  }, [initialPage, resumeTarget, visiblePage]);

  // Scroll to initial page on mount / after pages appear
  useEffect(() => {
    if (hasScrolledToInitial.current) return;
    // The page count arrives after this child mounts, so wait for it before
    // clamping - otherwise the target collapses to page 1 and latches.
    if (!numPages) return;

    const targetPage = Math.min(
      Math.max(1, resumeTarget),
      Math.max(1, numPages)
    );

    // Page 1 doesn't need a jump; still allow observer immediately. Deliberately
    // not latched: a real saved page may still be on its way from the parent.
    if (targetPage <= 1) {
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
  }, [numPages, resumeTarget, scrollToPageWithOffset]);

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

  // Notify parent of page change (but not during initialization). The parent passes
  // an inline callback, so guard against re-reporting the same page every render.
  useEffect(() => {
    if (isInitializingRef.current) return;
    if (lastNotifiedRef.current === visiblePage) return;
    lastNotifiedRef.current = visiblePage;
    hasReportedRef.current = true;
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

  // Scrubbing the progress bar: every page keeps a real-height placeholder, so the
  // target element exists even when it hasn't rendered yet.
  const seekToPercent = useCallback((percent: number) => {
    if (!numPages) return;
    const target = Math.min(Math.max(1, Math.round((percent / 100) * numPages)), numPages);
    setVisiblePage(target);
    scrollToPageWithOffset(target);
  }, [numPages, scrollToPageWithOffset]);

  return (
    <div
      ref={containerRef}
      className="space-y-4 w-full max-w-4xl mx-auto pb-[calc(6rem+env(safe-area-inset-bottom))] px-2 sm:px-0"
      style={{ "--reader-pill-top": `${Math.max(0, topOffset)}px` } as CSSProperties}
    >
      <ReaderProgressBar
        percent={progressPercent}
        caption={numPages > 0 ? `${visiblePage} / ${numPages}` : undefined}
        visible={showControls}
        onSeek={numPages > 0 ? seekToPercent : undefined}
        trailing={
          onScaleChange ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSettingsOpen(true)}
              aria-label="Reading settings"
            >
              <Settings2 className="w-4 h-4" />
            </Button>
          ) : undefined
        }
      />

      {/* Rides under the sticky reader header via --reader-pill-top */}
      <ReaderPagePill
        current={visiblePage}
        total={numPages || null}
        variant="sticky"
        visible={showControls}
        className="top-[var(--reader-pill-top)]"
      />

      {onScaleChange && (
        <ReaderSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          zoom={{
            value: scale,
            onChange: onScaleChange,
            min: 0.5,
            max: 5,
            step: 0.1,
            format: (v) => `${Math.round(v * 100)}%`,
          }}
        />
      )}

      {/* Render all pages */}
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
        const isNear = Math.abs(pageNum - visiblePage) <= 2;
        return (
          <div
            key={pageNum}
            ref={(el) => setPageRef(pageNum, el)}
            data-page={pageNum}
            className="shadow-lg rounded bg-card border border-border/50 mx-auto overflow-x-auto overflow-y-hidden w-full"
            style={{ maxWidth: `${width * scale}px` }}
          >
            {isNear ? (
              <div style={{ width: `${width * scale}px`, minWidth: `${width * scale}px` }} className="mx-auto">
                <Page
                  pageNumber={pageNum}
                  scale={scale}
                  width={width}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                  className="mx-auto"
                  loading={
                    <div className="flex items-center justify-center bg-muted/10" style={{ height: `${width * scale * 1.414}px` }}>
                      <span className="text-muted-foreground text-sm animate-pulse">Loading page {pageNum}...</span>
                    </div>
                  }
                />
              </div>
            ) : (
              <div 
                className="flex items-center justify-center bg-muted/5 mx-auto" 
                style={{ width: `${width * scale}px`, height: `${width * scale * 1.414}px` }}
              >
                <span className="text-muted-foreground/30 text-xs">Page {pageNum}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

