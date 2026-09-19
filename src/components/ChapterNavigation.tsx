import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronUp, ChevronDown, BookOpenText, List } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface Chapter {
  id: string;
  label: string;
  href?: string;
  page?: number;
  cfi?: string;
}

interface ChapterNavigationProps {
  chapters: Chapter[];
  currentPage?: number;
  currentCfi?: string;
  activeChapterLabel?: string;
  totalPages?: number;
  onChapterSelect: (chapter: Chapter) => void;
  fileType: string;
}

export const ChapterNavigation = ({
  chapters,
  currentPage = 1,
  currentCfi,
  activeChapterLabel,
  totalPages,
  onChapterSelect,
  fileType,
}: ChapterNavigationProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Find current chapter based on label, page, or cfi
  const getCurrentChapterIndex = () => {
    if (fileType === "epub" && activeChapterLabel) {
      const idx = chapters.findIndex(c => c.label.trim().toLowerCase() === activeChapterLabel.trim().toLowerCase());
      if (idx !== -1) return idx;
    }

    if (fileType === "epub" && currentCfi) {
      // For EPUB, use CFI comparison (simplified)
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (chapters[i].cfi && currentCfi >= chapters[i].cfi!) {
          return i;
        }
      }
      return 0;
    }
    
    // For PDF/CBZ, use page numbers
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (chapters[i].page && currentPage >= chapters[i].page!) {
        return i;
      }
    }
    return 0;
  };

  const currentChapterIndex = getCurrentChapterIndex();
  const currentChapter = chapters[currentChapterIndex];
  const nextChapter = chapters[currentChapterIndex + 1];

  // Calculate pages until next chapter
  const pagesUntilNext = (() => {
    if (!nextChapter?.page || !currentPage) return null;
    return nextChapter.page - currentPage;
  })();

  if (chapters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Chapter info bar */}
      {/* min-w-0 + overflow-hidden let the pill shrink into whatever space the reader's
          action row leaves. It used to be centred with content that could not shrink,
          so on phones it overflowed both sides and the chapter title was cut off. */}
      <div className="flex min-w-0 items-center justify-center gap-2 overflow-hidden text-xs sm:text-sm text-muted-foreground w-full max-w-md rounded-full border border-border/60 bg-background/90 px-1.5 py-1 shadow-sm backdrop-blur-md">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 min-w-0 shrink px-3 gap-1.5 rounded-full"
            >
              <List className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[150px] sm:max-w-[200px]">
                {currentChapter?.label || "Table of Contents"}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[300px] sm:w-[350px] border-border/60 bg-background/95 backdrop-blur-md rounded-r-2xl pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <BookOpenText className="w-5 h-5" />
                Chapters
              </SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-8rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] mt-4 pr-4">
              <div className="space-y-1">
                {chapters.map((chapter, index) => (
                  <Button
                    key={chapter.id}
                    variant={index === currentChapterIndex ? "secondary" : "ghost"}
                    className="w-full justify-start text-left h-auto min-h-11 py-2.5 px-3 rounded-xl"
                    onClick={() => {
                      onChapterSelect(chapter);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate text-sm">{chapter.label}</span>
                      {chapter.page && (
                        <span className="text-xs text-muted-foreground">
                          Page {chapter.page}
                        </span>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {pagesUntilNext !== null && pagesUntilNext > 0 && (
          <span
            className="shrink-0 text-xs border-l border-border/60 pl-3 pr-2 text-muted-foreground whitespace-nowrap"
            title={`${pagesUntilNext} ${pagesUntilNext === 1 ? "page" : "pages"} to next chapter`}
          >
            {/* Short form on phones, where the full sentence does not fit beside the reader's tool buttons. */}
            <span className="sm:hidden">{pagesUntilNext} left</span>
            <span className="hidden sm:inline">
              {pagesUntilNext} {pagesUntilNext === 1 ? "page" : "pages"} to next chapter
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
