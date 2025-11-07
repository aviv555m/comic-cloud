import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";

interface AddFromUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const AddFromUrlDialog = ({ open, onOpenChange, onSuccess }: AddFromUrlDialogProps) => {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a valid URL",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Download book via edge function
      toast({
        title: "Downloading",
        description: "Downloading book from URL...",
      });

      const { data: downloadData, error: downloadError } = await supabase.functions.invoke(
        "download-book",
        {
          body: { url, userId: user.id },
        }
      );

      if (downloadError || !downloadData?.success) {
        throw new Error(downloadData?.error || "Failed to download book");
      }

      // Create book entry
      const bookData = {
        user_id: user.id,
        title: title.trim() || downloadData.title || "Untitled Book",
        author: author.trim() || null,
        series: series.trim() || null,
        file_url: downloadData.fileUrl,
        file_type: downloadData.fileType,
        file_size: downloadData.fileSize,
        last_page_read: 0,
        reading_progress: 0,
        is_completed: false,
      };

      const { error: insertError } = await supabase
        .from("books")
        .insert(bookData);

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: "Book added successfully!",
      });

      // Reset form
      setUrl("");
      setTitle("");
      setAuthor("");
      setSeries("");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error adding book:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add book from URL",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Add Book from URL
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">Book URL *</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/book.pdf"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              required
            />
            <p className="text-xs text-muted-foreground">
              Direct link to PDF, EPUB, CBZ, CBR, or TXT file
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title (Optional)</Label>
            <Input
              id="title"
              placeholder="Book title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to extract from URL
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Author (Optional)</Label>
            <Input
              id="author"
              placeholder="Author name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="series">Series (Optional)</Label>
            <Input
              id="series"
              placeholder="Series name"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : (
                "Add Book"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
