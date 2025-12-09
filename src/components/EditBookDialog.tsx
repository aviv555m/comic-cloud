import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExistingSeries } from "@/hooks/useExistingSeries";
import { SeriesCombobox } from "@/components/SeriesCombobox";

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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { series: existingSeries } = useExistingSeries(book.user_id);

  // Reset form when book changes
  useEffect(() => {
    setTitle(book.title);
    setAuthor(book.author || "");
    setSeries(book.series || "");
    setCoverFile(null);
  }, [book]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      let coverUrl = book.cover_url;

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
        
        coverUrl = urlData.publicUrl;
      }

      // Update book metadata
      const { error } = await supabase
        .from('books')
        .update({
          title,
          author: author || null,
          series: series || null,
          cover_url: coverUrl,
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
            <Label htmlFor="cover">Custom Cover</Label>
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
