import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleRead = () => {
    onOpenChange(false);
    navigate(`/reader/${book.id}`);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete from storage
      const filePath = book.file_url.split('/book-files/')[1];
      if (filePath) {
        await supabase.storage.from('book-files').remove([filePath]);
      }

      // Delete cover if exists
      if (book.cover_url) {
        const coverPath = book.cover_url.split('/book-covers/')[1];
        if (coverPath) {
          await supabase.storage.from('book-covers').remove([coverPath]);
        }
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
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <ScrollArea className="max-h-[calc(90vh-2rem)]">
            <DialogHeader>
              <div className="flex gap-4">
                {/* Cover */}
                <div className="w-24 h-36 shrink-0 rounded-lg overflow-hidden bg-muted">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-lg line-clamp-2 mb-1">
                    {book.title}
                  </DialogTitle>
                  {book.author && (
                    <DialogDescription className="text-sm mb-2">
                      by {book.author}
                    </DialogDescription>
                  )}
                  {book.series && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Series: {book.series}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mb-3">
                    <Badge variant="outline" className="text-xs">
                      {book.file_type.toUpperCase()}
                    </Badge>
                    {book.is_public ? (
                      <Badge variant="secondary" className="text-xs">
                        <Globe className="w-3 h-3 mr-1" />
                        Public
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="w-3 h-3 mr-1" />
                        Private
                      </Badge>
                    )}
                    {book.is_completed && (
                      <Badge className="bg-green-500 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Completed
                      </Badge>
                    )}
                  </div>

                  {/* Progress */}
                  {book.reading_progress > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Progress</span>
                        <span>{book.reading_progress}%</span>
                      </div>
                      <Progress value={book.reading_progress} className="h-2" />
                      {book.last_page_read && book.total_pages && (
                        <p className="text-xs text-muted-foreground">
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
              <div className="py-3 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Tags</span>
                </div>
                <TagPicker bookId={book.id} userId={book.user_id} />
              </div>
            )}

            {/* Details */}
            <div className="grid grid-cols-2 gap-3 py-4 border-t border-b">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>{formatFileSize(book.file_size)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Added {new Date(book.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Review Section */}
            {canEdit && (
              <div className="py-4 border-b">
                <BookReviewSection bookId={book.id} userId={book.user_id} />
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-4">
              {/* Primary Action */}
              <Button onClick={handleRead} className="w-full" size="lg">
                <Play className="w-4 h-4 mr-2" />
                {book.reading_progress > 0 ? "Continue Reading" : "Start Reading"}
              </Button>

              {/* Secondary Actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditDialogOpen(true)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                )}

                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setListDialogOpen(true)}
                  >
                    <List className="w-4 h-4 mr-1" />
                    Lists
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <Share2 className="w-4 h-4 mr-1" />
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
                  showLabel
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePublic}
                  >
                    {book.is_public ? (
                      <>
                        <Lock className="w-4 h-4 mr-1" />
                        Make Private
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 mr-1" />
                        Make Public
                      </>
                    )}
                  </Button>
                )}

                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={markAsCompleted}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {book.is_completed ? "Unfinish" : "Complete"}
                  </Button>
                )}
              </div>

              {/* Generate Cover */}
              {canEdit && !book.cover_url && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleGenerateCover}
                  disabled={generating}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {generating ? "Generating..." : "Generate AI Cover"}
                </Button>
              )}

              {/* Delete */}
              {canEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deleting}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Book
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{book.title}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this book from your library. 
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
