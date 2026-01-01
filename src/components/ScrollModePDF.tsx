import { useEffect, useRef, useState, useCallback } from "react";
import { Page } from "react-pdf";

interface ScrollModePDFProps {
  numPages: number;
  scale: number;
  onPageChange: (page: number) => void;
}

export const ScrollModePDF = ({ numPages, scale, onPageChange }: ScrollModePDFProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [visiblePage, setVisiblePage] = useState(1);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Set up intersection observer to detect which page is most visible
  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the page with highest intersection ratio
        let maxRatio = 0;
        let maxPage = 1;

        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute("data-page") || "1");
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxPage = pageNum;
          }
        });

        if (maxRatio > 0.3) {
          setVisiblePage(maxPage);
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
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
      className="space-y-4 w-full max-w-4xl mx-auto pb-20"
    >
      {/* Current page indicator - sticky */}
      <div className="sticky top-16 z-40 flex justify-center">
        <div className="bg-background/95 backdrop-blur-sm border rounded-full px-4 py-1.5 shadow-sm">
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
          className="shadow-lg rounded overflow-hidden bg-white"
        >
          <Page
            pageNumber={pageNum}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            className="mx-auto"
            loading={
              <div className="flex items-center justify-center h-[800px] bg-muted/30">
                <span className="text-muted-foreground text-sm">Loading page {pageNum}...</span>
              </div>
            }
          />
        </div>
      ))}
    </div>
  );
};
