import { Download, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface OfflineBookButtonProps {
  book: {
    id: string;
    title: string;
    author: string | null;
    file_url: string;
    file_type: string;
    cover_url: string | null;
    last_page_read: number | null;
  };
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  showLabel?: boolean;
}

export const OfflineBookButton = ({ 
  book, 
  size = "icon",
  variant = "ghost",
  showLabel = false 
}: OfflineBookButtonProps) => {
  const { 
    saveBookOffline, 
    removeBookOffline, 
    isBookOffline, 
    isBookDownloading 
  } = useOfflineBooks();

  const isOffline = isBookOffline(book.id);
  const isDownloading = isBookDownloading(book.id);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isDownloading) return;
    
    if (isOffline) {
      await removeBookOffline(book.id);
    } else {
      await saveBookOffline(book);
    }
  };

  const label = isDownloading 
    ? "Saving..." 
    : isOffline 
      ? "Remove offline" 
      : "Save offline";

  const Icon = isDownloading 
    ? Loader2 
    : isOffline 
      ? Check 
      : Download;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isOffline ? "secondary" : variant}
          size={size}
          onClick={handleClick}
          disabled={isDownloading}
          className={isOffline ? "bg-green-500/20 text-green-500 hover:bg-green-500/30" : ""}
        >
          <Icon className={`w-4 h-4 ${isDownloading ? "animate-spin" : ""} ${showLabel ? "mr-2" : ""}`} />
          {showLabel && label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
};
