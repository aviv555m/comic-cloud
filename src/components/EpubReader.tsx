import { useEffect, useRef, useState } from "react";
import ePub, { Book, Rendition } from "epubjs";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface EpubReaderProps {
  url: string;
  onLocationChange?: (location: string) => void;
  initialLocation?: string;
}

export const EpubReader = ({ url, onLocationChange, initialLocation }: EpubReaderProps) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(true);

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

    // Display the book
    const displayed = initialLocation 
      ? rendition.display(initialLocation)
      : rendition.display();

    displayed.then(() => {
      // Track location changes
      rendition.on("relocated", (location: any) => {
        setCanGoBack(!location.atStart);
        setCanGoForward(!location.atEnd);
        
        if (onLocationChange && location.start) {
          onLocationChange(location.start.cfi);
        }
      });
    });

    return () => {
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

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div 
        ref={viewerRef}
        className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-lg shadow-2xl"
        style={{ height: "70vh" }}
      />
      
      <div className="flex items-center gap-4">
        <Button
          onClick={goToPreviousPage}
          disabled={!canGoBack}
          variant="outline"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>

        <Button
          onClick={goToNextPage}
          disabled={!canGoForward}
          variant="outline"
        >
          Next
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};
