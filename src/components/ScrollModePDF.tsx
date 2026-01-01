import { useEffect, useRef, useState, useCallback } from "react";
import { Page } from "react-pdf";

interface ScrollModePDFProps {
  numPages: number;
  scale: number;
  initialPage?: number;
  onPageChange: (page: number) => void;
}

export const ScrollModePDF = ({ 
  numPages, 
  scale, 
  initialPage = 1,
  onPageChange 
}: ScrollModePDFProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [visiblePage, setVisiblePage] = useState(initialPage);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasScrolledToInitial = useRef(false);

  // Scroll to initial page on mount
  useEffect(() => {
    if (hasScrolledToInitial.current || initialPage <= 1) return;
    
    // Wait for pages to render, then scroll
    const scrollToPage = () => {
      const pageElement = pageRefs.current.get(initialPage);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: "auto", block: "start" });
        hasScrolledToInitial.current = true;
      }
    };

    // Try immediately, then retry after a short delay
    const timeout = setTimeout(scrollToPage, 100);
    const timeout2 = setTimeout(scrollToPage, 500);
    
    return () => {
      clearTimeout(timeout);
      clearTimeout(timeout2);
    };
  }, [initialPage, numPages]);

  // Set up intersection observer to detect which page is most visible
  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the page with highest intersection ratio
        let maxRatio = 0;
        let maxPage = visiblePage;

        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute("data-page") || "1");
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxPage = pageNum;
          }
        });

        if (maxRatio > 0.2) {
          setVisiblePage(maxPage);
        }
      },
      {
        root: null,
        rootMargin: "-10% 0px -70% 0px",
        threshold: [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1],
      }
    );

    // Observe all page elements
    pageRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [numPages]);

  // Notify parent of page change
  useEffect(() => {
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
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className="space-y-4 w-full max-w-4xl mx-auto pb-20 px-2 sm:px-0"
    >
      {/* Current page indicator - sticky */}
      <div className="sticky top-16 z-40 flex justify-center pointer-events-none">
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
          className="shadow-lg rounded overflow-hidden bg-white mx-auto"
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
};
