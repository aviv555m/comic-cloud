import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExistingSeries } from "@/hooks/useExistingSeries";
import { SeriesCombobox } from "@/components/SeriesCombobox";
import { Sparkles } from "lucide-react";

interface EditBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: {
    id: string;
    title: string;
    author: string | null;
    series: string | null;
    cover_url: string | null;
    user_id?: string;
  };
  onSuccess: () => void;
}

export const EditBookDialog = ({ open, onOpenChange, book, onSuccess }: EditBookDialogProps) => {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author || "");
  const [series, setSeries] = useState(book.series || "");
  const [coverUrl, setCoverUrl] = useState(book.cover_url || "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const { toast } = useToast();
  const { series: existingSeries } = useExistingSeries(book.user_id);

  // Reset form when book changes
  useEffect(() => {
    setTitle(book.title);
    setAuthor(book.author || "");
    setSeries(book.series || "");
    setCoverUrl(book.cover_url || "");
    setCoverFile(null);
  }, [book]);

  const handleAutoFill = async () => {
    const searchQuery = title || series;
    if (!searchQuery) {
      toast({
        variant: "destructive",
        title: "Search criteria needed",
        description: "Please enter a Title or Series name first to search for details.",
      });
      return;
    }
    
    setFetchingMetadata(true);
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("Metadata request failed");
      const data = await res.json();
      
      if (!data.items || data.items.length === 0) {
        toast({
          variant: "destructive",
          title: "Not found",
          description: "Could not find any matching books on Google Books.",
        });
        return;
      }
      
      const volumeInfo = data.items[0].volumeInfo;
      const authorsList = volumeInfo.authors || [];
      const imageLinks = volumeInfo.imageLinks || {};
      
      const scrapedAuthor = authorsList[0] || "";
      const scrapedCover = (imageLinks.thumbnail || imageLinks.smallThumbnail || "").replace("http://", "https://");
      
      if (scrapedAuthor && !author) {
        setAuthor(scrapedAuthor);
      }
      if (scrapedCover) {
        setCoverUrl(scrapedCover);
      }
      
      toast({
        title: "Metadata populated",
        description: `Found: "${volumeInfo.title}" by ${scrapedAuthor || "Unknown Author"}`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: err.message,
      });
    } finally {
      setFetchingMetadata(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      let finalCoverUrl = coverUrl;

      // Upload new cover if provided
      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const filePath = `${book.id}/cover.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('book-covers')
          .upload(filePath, coverFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('book-covers')
          .getPublicUrl(filePath);
        
        finalCoverUrl = urlData.publicUrl;
      }

      // Update book metadata
      const { error } = await supabase
        .from('books')
        .update({
          title,
          author: author || null,
          series: series || null,
          cover_url: finalCoverUrl || null,
        })
        .eq('id', book.id);

      if (error) throw error;

      toast({
        title: "Book updated",
        description: "Your changes have been saved",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Book</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <div>
            <Label>Series</Label>
            <SeriesCombobox
              value={series}
              onChange={setSeries}
              existingSeries={existingSeries}
              placeholder="Select or enter series..."
            />
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs font-bold gap-1.5 text-violet-400 hover:text-violet-300 border-violet-500/20"
              onClick={handleAutoFill}
              disabled={fetchingMetadata}
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              {fetchingMetadata ? "Searching web details..." : "Auto-fill cover & author"}
            </Button>
          </div>
          <div>
            <Label htmlFor="coverUrl">Cover Image URL</Label>
            <Input
              id="coverUrl"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://example.com/cover.jpg"
            />
          </div>
          <div>
            <Label htmlFor="cover">Custom Cover File</Label>
            <div className="mt-2">
              <Input
                id="cover"
                type="file"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              />
            </div>
            {coverFile && (
              <p className="text-sm text-muted-foreground mt-1">
                {coverFile.name}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
