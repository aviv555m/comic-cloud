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
  totalPages?: number;
  onChapterSelect: (chapter: Chapter) => void;
  fileType: string;
}

export const ChapterNavigation = ({
  chapters,
  currentPage = 1,
  currentCfi,
  totalPages,
  onChapterSelect,
  fileType,
}: ChapterNavigationProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Find current chapter based on page or cfi
  const getCurrentChapterIndex = () => {
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
      <div className="flex items-center justify-center gap-3 text-xs sm:text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 w-full max-w-md">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 gap-1.5"
            >
              <List className="w-3.5 h-3.5" />
              <span className="truncate max-w-[150px] sm:max-w-[200px]">
                {currentChapter?.label || "Table of Contents"}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[350px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <BookOpenText className="w-5 h-5" />
                Chapters
              </SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-4">
              <div className="space-y-1">
                {chapters.map((chapter, index) => (
                  <Button
                    key={chapter.id}
                    variant={index === currentChapterIndex ? "secondary" : "ghost"}
                    className="w-full justify-start text-left h-auto py-2 px-3"
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
          <span className="text-xs border-l pl-3 text-muted-foreground whitespace-nowrap">
            {pagesUntilNext} {pagesUntilNext === 1 ? "page" : "pages"} to next chapter
          </span>
        )}
      </div>
    </div>
  );
};
