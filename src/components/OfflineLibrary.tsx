import { useNavigate } from "react-router-dom";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CloudOff, 
  Trash2, 
  BookOpen, 
  HardDrive,
  WifiOff 
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const OfflineLibrary = () => {
  const navigate = useNavigate();
  const { 
    offlineBooks, 
    isOnline, 
    removeBookOffline, 
    getTotalStorageUsed,
    clearAllOfflineData 
  } = useOfflineBooks();

  const totalSize = getTotalStorageUsed();

  if (offlineBooks.length === 0) {
    return (
      <div className="text-center py-12">
        <CloudOff className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Offline Books</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Save books for offline reading by clicking the download icon on any book in your library.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with storage info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {offlineBooks.length} book{offlineBooks.length !== 1 ? 's' : ''} · {formatFileSize(totalSize)}
          </span>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear All Offline Data?</DialogTitle>
              <DialogDescription>
                This will remove all {offlineBooks.length} books from offline storage, 
                freeing up {formatFileSize(totalSize)} of space. 
                Your online library will not be affected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" onClick={clearAllOfflineData}>
                Clear All
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Offline status indicator */}
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <WifiOff className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-amber-500">
            You're offline. Only saved books are available.
          </span>
        </div>
      )}

      {/* Book grid */}
      <ScrollArea className="h-[400px]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {offlineBooks.map((book) => (
            <Card 
              key={book.id}
              className="group cursor-pointer hover:shadow-lg transition-all duration-300 overflow-hidden"
              onClick={() => navigate(`/reader/${book.id}`)}
            >
              <CardContent className="p-0 relative">
                {/* Cover */}
                <div className="aspect-[2/3] bg-muted relative">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Offline badge */}
                  <Badge 
                    className="absolute top-2 right-2 bg-green-500/90 text-white border-0"
                  >
                    <CloudOff className="w-3 h-3 mr-1" />
                    Offline
                  </Badge>
                  
                  {/* Remove button */}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookOffline(book.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                {/* Info */}
                <div className="p-3">
                  <h4 className="font-medium text-sm truncate">{book.title}</h4>
                  {book.author && (
                    <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <Badge variant="outline" className="text-xs">
                      {book.file_type.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(book.fileSize)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
