import { useEffect, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ChapterNavigation, Chapter } from "./ChapterNavigation";

interface ComicReaderProps {
  url: string;
  onPageChange?: (page: number) => void;
  initialPage?: number;
}

interface ImageFile {
  name: string;
  data: string;
  folder: string;
}

export const ComicReader = ({ url, onPageChange, initialPage = 0 }: ComicReaderProps) => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadComicArchive();
  }, [url]);

  const loadComicArchive = async () => {
    try {
      setLoading(true);
      
      // Check if file is CBR (RAR format)
      if (url.toLowerCase().includes('.cbr')) {
        toast({
          variant: "destructive",
          title: "CBR format not supported",
          description: "Please convert to CBZ format for reading",
        });
        setLoading(false);
        return;
      }

      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Extract all image files with folder info
      const imageFiles: ImageFile[] = [];
      
      for (const filename of Object.keys(zip.files)) {
        const file = zip.files[filename];
        if (!file.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
          const blob = await file.async("blob");
          const url = URL.createObjectURL(blob);
          
          // Get folder path
          const parts = filename.split('/');
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
          
          imageFiles.push({ name: filename, data: url, folder });
        }
      }

      // Sort by filename
      imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setImages(imageFiles);

      // Extract chapters from folder structure
      const folderMap = new Map<string, number>();
      imageFiles.forEach((img, index) => {
        if (img.folder && !folderMap.has(img.folder)) {
          folderMap.set(img.folder, index);
        }
      });

      // Create chapters from folders
      const extractedChapters: Chapter[] = [];
      
      // If there are folders, use them as chapters
      if (folderMap.size > 1) {
        folderMap.forEach((pageIndex, folder) => {
          const folderName = folder.split('/').pop() || folder;
          extractedChapters.push({
            id: `chapter-${extractedChapters.length}`,
            label: folderName,
            page: pageIndex + 1, // 1-indexed for display
          });
        });
      } else {
        // If no folders, create chapters every N pages (e.g., every 20 pages)
        const chapterSize = 20;
        for (let i = 0; i < imageFiles.length; i += chapterSize) {
          const chapterNum = Math.floor(i / chapterSize) + 1;
          extractedChapters.push({
            id: `chapter-${chapterNum}`,
            label: `Part ${chapterNum}`,
            page: i + 1,
          });
        }
      }

      setChapters(extractedChapters);
      setLoading(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load comic archive",
      });
      setLoading(false);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 0 && page < images.length) {
      setCurrentPage(page);
      onPageChange?.(page);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading comic...</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">No images found in archive</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative max-w-4xl w-full">
        <img
          src={images[currentPage]?.data}
          alt={`Page ${currentPage + 1}`}
          className="w-full h-auto rounded-lg shadow-2xl"
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            variant="outline"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <div className="text-sm font-medium">
            Page {currentPage + 1} of {images.length}
          </div>

          <Button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= images.length - 1}
            variant="outline"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        {/* Chapter Navigation */}
        {chapters.length > 0 && (
          <ChapterNavigation
            chapters={chapters}
            currentPage={currentPage + 1}
            totalPages={images.length}
            onChapterSelect={(chapter) => {
              if (chapter.page) {
                goToPage(chapter.page - 1); // Convert to 0-indexed
              }
            }}
            fileType="cbz"
          />
        )}
      </div>
    </div>
  );
};
