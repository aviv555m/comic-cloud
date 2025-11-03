import { useEffect, useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ComicReaderProps {
  url: string;
  onPageChange?: (page: number) => void;
  initialPage?: number;
}

export const ComicReader = ({ url, onPageChange, initialPage = 0 }: ComicReaderProps) => {
  const [images, setImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
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

      // Extract all image files
      const imageFiles: { name: string; data: string }[] = [];
      
      for (const filename of Object.keys(zip.files)) {
        const file = zip.files[filename];
        if (!file.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
          const blob = await file.async("blob");
          const url = URL.createObjectURL(blob);
          imageFiles.push({ name: filename, data: url });
        }
      }

      // Sort by filename
      imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setImages(imageFiles.map(f => f.data));
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
    <div className="flex flex-col items-center gap-6">
      <div className="relative max-w-4xl w-full">
        <img
          src={images[currentPage]}
          alt={`Page ${currentPage + 1}`}
          className="w-full h-auto rounded-lg shadow-2xl"
        />
      </div>

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
    </div>
  );
};
