import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseStorageReference } from "@/lib/storage-paths";
import { Capacitor } from "@capacitor/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BookOpen, 
  Edit, 
  Trash2, 
  Globe, 
  Lock, 
  Play, 
  Sparkles,
  Clock,
  FileText,
  CheckCircle2,
  Share2,
  List,
  Tag
} from "lucide-react";
import { EditBookDialog } from "./EditBookDialog";
import { OfflineBookButton } from "./OfflineBookButton";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import { TagPicker } from "./TagPicker";
import { BookReviewSection } from "./BookReviewSection";
import { AddToListDialog } from "./AddToListDialog";
import { ShareProgressCard } from "./ShareProgressCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BookDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: {
    id: string;
    title: string;
    author: string | null;
    series: string | null;
    cover_url: string | null;
    file_url: string;
    file_type: string;
    is_public: boolean;
    is_completed: boolean;
    reading_progress: number;
    last_page_read: number | null;
    total_pages: number | null;
    file_size: number | null;
    created_at: string;
    user_id: string;
  };
  canEdit?: boolean;
  onUpdate?: () => void;
  onDelete?: () => void;
}

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const BookDetailsDialog = ({
  open,
  onOpenChange,
  book,
  canEdit = false,
  onUpdate,
  onDelete,
}: BookDetailsDialogProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { removeBookOffline } = useOfflineBooks();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolvedCover, setResolvedCover] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!book?.cover_url) {
      setResolvedCover(undefined);
      return;
    }
    
    if (book.cover_url.startsWith("data:")) {
      setResolvedCover(book.cover_url);
      return;
    }
    
    const isNative = Capacitor.isNativePlatform();
    const isProdOrNative = isNative || !import.meta.env.DEV;
    
    if (isProdOrNative && book.cover_url.startsWith("/api-image-proxy?url=")) {
      const targetUrl = decodeURIComponent(book.cover_url.split("/api-image-proxy?url=")[1]);
      
      let active = true;
      const fetchCover = async () => {
        try {
          const { data, error } = await supabase.functions.invoke("public-library-proxy", {
            body: { url: targetUrl, responseType: "text" },
          });
          if (active && !error && data?.success && data.data) {
            setResolvedCover(`data:image/jpeg;base64,${data.data}`);
          }
        } catch (e) {
          console.warn("Failed to load native cover via edge proxy:", e);
        }
      };
      
      fetchCover();
      return () => {
        active = false;
      };
    } else {
      setResolvedCover(book.cover_url);
    }
  }, [book?.cover_url]);

  const handleRead = () => {
    onOpenChange(false);
    navigate(`/reader/${book.id}`);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete from local IndexedDB offline storage
      try {
        await removeBookOffline(book.id);
      } catch (offlineErr) {
        console.warn("Failed to remove offline copy:", offlineErr);
      }

      // Delete from storage
      const fileRef = parseStorageReference(book.file_url, 'book-files');
      if (fileRef) {
        await supabase.storage.from('book-files').remove([fileRef.relativePath]);
      }

      // Delete cover if exists
      const coverRef = parseStorageReference(book.cover_url, 'book-covers');
      if (coverRef) {
        await supabase.storage.from('book-covers').remove([coverRef.relativePath]);
      }

      // Delete book record
      const { error } = await supabase
        .from('books')
        .delete()
        .eq('id', book.id);

      if (error) throw error;

      toast({
        title: "Book deleted",
        description: `"${book.title}" has been removed from your library`,
      });

      onOpenChange(false);
      onDelete?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete book",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateCover = async () => {
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('generate-cover', {
        body: { bookId: book.id }
      });

      if (error) throw error;

      toast({
        title: "Cover generated!",
        description: "Your book cover has been created",
      });
      
      onUpdate?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate cover",
      });
    } finally {
      setGenerating(false);
    }
  };

  const togglePublic = async () => {
    try {
      const { error } = await supabase
        .from('books')
        .update({ is_public: !book.is_public })
        .eq('id', book.id);

      if (error) throw error;

      toast({
        title: book.is_public ? "Book is now private" : "Book is now public",
        description: book.is_public 
          ? "Only you can see this book" 
          : "Anyone can now see this book",
      });

      onUpdate?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update visibility",
      });
    }
  };

  const markAsCompleted = async () => {
    try {
      const { error } = await supabase
        .from('books')
        .update({ 
          is_completed: !book.is_completed,
          reading_progress: !book.is_completed ? 100 : book.reading_progress,
          finished_reading_at: !book.is_completed ? new Date().toISOString() : null
        })
        .eq('id', book.id);

      if (error) throw error;

      toast({
        title: book.is_completed ? "Marked as unfinished" : "Marked as completed",
      });

      onUpdate?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update status",
      });
    }
  };

  return (
    <>
      <EditBookDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        book={book}
        onSuccess={() => {
          onUpdate?.();
        }}
      />

      <AddToListDialog
        open={listDialogOpen}
        onOpenChange={setListDialogOpen}
        bookId={book.id}
        userId={book.user_id}
      />

      <ShareProgressCard
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        book={book}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] bg-neutral-950/95 backdrop-blur-xl border border-violet-500/20 rounded-3xl p-6 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <ScrollArea className="max-h-[calc(90vh-3rem)] pr-2">
            <DialogHeader className="space-y-4">
              <div className="flex gap-4 items-start">
                {/* Cover Card with Premium shadow/glow */}
                <div className="w-24 h-36 shrink-0 rounded-xl overflow-hidden bg-neutral-900 border border-white/5 shadow-xl shadow-black/40 relative group">
                  {resolvedCover ? (
                    <img
                      src={resolvedCover}
                      alt={book.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <BookOpen className="w-8 h-8 text-neutral-600" />
                    </div>
                  )}
                </div>

                {/* Info block */}
                <div className="flex-1 min-w-0 space-y-2">
                  <DialogTitle className="text-lg font-bold text-white tracking-tight leading-snug line-clamp-2">
                    {book.title}
                  </DialogTitle>
                  
                  {book.author && (
                    <DialogDescription className="text-sm text-neutral-400 font-medium">
                      by {book.author}
                    </DialogDescription>
                  )}
                  
                  {book.series && (
                    <p className="text-xs text-violet-400 font-semibold bg-violet-500/10 px-2 py-0.5 rounded-md inline-block">
                      {book.series}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Badge variant="outline" className="text-[10px] text-neutral-400 border-neutral-800 uppercase px-1.5 py-0">
                      {book.file_type}
                    </Badge>
                    {book.is_public ? (
                      <Badge variant="secondary" className="text-[10px] bg-white/5 hover:bg-white/10 text-neutral-300 border-0 px-1.5 py-0">
                        <Globe className="w-2.5 h-2.5 mr-1 text-violet-400" />
                        Public
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] bg-white/5 hover:bg-white/10 text-neutral-300 border-0 px-1.5 py-0">
                        <Lock className="w-2.5 h-2.5 mr-1 text-amber-500" />
                        Private
                      </Badge>
                    )}
                    {book.is_completed && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] px-1.5 py-0 font-medium">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        Completed
                      </Badge>
                    )}
                  </div>

                  {/* Reading Progress */}
                  {book.reading_progress > 0 && (
                    <div className="space-y-1 pt-1.5">
                      <div className="flex justify-between text-[11px] font-medium text-neutral-400">
                        <span>Progress</span>
                        <span className="text-violet-400">{book.reading_progress}%</span>
                      </div>
                      <Progress value={book.reading_progress} className="h-1 bg-neutral-900" style={{'--progress-background': 'linear-gradient(to right, var(--violet-500), var(--indigo-500))'} as any} />
                      {book.last_page_read && book.total_pages && (
                        <p className="text-[10px] text-neutral-500 font-medium">
                          Page {book.last_page_read} of {book.total_pages}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DialogHeader>

            {/* Tags Section */}
            {canEdit && (
              <div className="py-3 mt-4 border-t border-neutral-900">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-neutral-500" />
                  <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Tags</span>
                </div>
                <TagPicker bookId={book.id} userId={book.user_id} />
              </div>
            )}

            {/* Book Details Grid */}
            <div className="grid grid-cols-2 gap-3 py-4 border-t border-b border-neutral-900 my-2">
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
                <FileText className="w-4 h-4 text-neutral-600" />
                <span>Size: {formatFileSize(book.file_size)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
                <Clock className="w-4 h-4 text-neutral-600" />
                <span>Added: {new Date(book.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Review Section */}
            {canEdit && (
              <div className="py-3 border-b border-neutral-900">
                <BookReviewSection bookId={book.id} userId={book.user_id} />
              </div>
            )}

            {/* Action Buttons Panel */}
            <div className="space-y-3 pt-4">
              {/* Main Call to Action */}
              <Button 
                onClick={handleRead} 
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold transition-all duration-300 shadow-md shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-[0.98] py-6 rounded-2xl text-base"
              >
                <Play className="w-5 h-5 mr-2 fill-white" />
                {book.reading_progress > 0 ? "Continue Reading" : "Start Reading"}
              </Button>

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-neutral-900 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white rounded-xl active:scale-95 transition-transform"
                    onClick={() => setEditDialogOpen(true)}
                  >
                    <Edit className="w-4 h-4 mr-1 text-violet-400" />
                    Edit
                  </Button>
                )}

                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-neutral-900 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white rounded-xl active:scale-95 transition-transform"
                    onClick={() => setListDialogOpen(true)}
                  >
                    <List className="w-4 h-4 mr-1 text-indigo-400" />
                    Lists
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="border-neutral-900 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white rounded-xl active:scale-95 transition-transform"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <Share2 className="w-4 h-4 mr-1 text-sky-400" />
                  Share
                </Button>

                <OfflineBookButton
                  book={{
                    id: book.id,
                    title: book.title,
                    author: book.author,
                    file_url: book.file_url,
                    file_type: book.file_type,
                    cover_url: book.cover_url,
                    last_page_read: book.last_page_read,
                  }}
                  size="sm"
                  variant="outline"
                  className="border-neutral-900 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white rounded-xl active:scale-95 transition-transform w-full"
                  showLabel
                />
              </div>

              {/* Utility settings list */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-neutral-900 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white rounded-xl active:scale-95 transition-transform py-5"
                    onClick={togglePublic}
                  >
                    {book.is_public ? (
                      <>
                        <Lock className="w-4 h-4 mr-1.5 text-amber-500" />
                        Make Private
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 mr-1.5 text-violet-400" />
                        Make Public
                      </>
                    )}
                  </Button>
                )}

                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-neutral-900 bg-neutral-950 hover:bg-neutral-900 text-neutral-300 hover:text-white rounded-xl active:scale-95 transition-transform py-5"
                    onClick={markAsCompleted}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-400" />
                    {book.is_completed ? "Unfinish" : "Complete"}
                  </Button>
                )}
              </div>

              {/* AI helper features */}
              {canEdit && !book.cover_url && (
                <Button
                  variant="secondary"
                  className="w-full bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-white rounded-xl py-5"
                  onClick={handleGenerateCover}
                  disabled={generating}
                >
                  <Sparkles className="w-4 h-4 mr-2 text-violet-400 animate-pulse" />
                  {generating ? "Generating..." : "Generate AI Cover"}
                </Button>
              )}

              {/* Delete action */}
              {canEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full text-neutral-500 hover:text-red-400 hover:bg-red-950/20 rounded-xl py-4 mt-2"
                      disabled={deleting}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Book
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-neutral-950 border border-neutral-900 rounded-3xl p-6 shadow-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white font-bold text-lg">Delete "{book.title}"?</AlertDialogTitle>
                      <AlertDialogDescription className="text-neutral-400 text-sm">
                        This will permanently delete this book from your library. 
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                      <AlertDialogCancel className="bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
