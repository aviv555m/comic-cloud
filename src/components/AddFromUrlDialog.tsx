import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GutenbergSearch } from "./GutenbergSearch";

interface AddFromUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const AddFromUrlDialog = ({ open, onOpenChange, onSuccess }: AddFromUrlDialogProps) => {
  const [urls, setUrls] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showManualHelp, setShowManualHelp] = useState(false);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!urls.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter at least one URL",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Parse URLs (one per line or comma-separated)
      const urlList = urls
        .split(/[\n,]/)
        .map(u => u.trim())
        .filter(u => u.length > 0);

      if (urlList.length === 0) {
        throw new Error("No valid URLs found");
      }

      setProgress({ current: 0, total: urlList.length });
      let successCount = 0;
      let failCount = 0;
      const failed: string[] = [];

      // Process each URL
      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        setProgress({ current: i + 1, total: urlList.length });

        try {
          // Download book via edge function
          const { data: downloadData, error: downloadError } = await supabase.functions.invoke(
            "download-book",
            {
              body: { url, userId: user.id },
            }
          );

          if (downloadError || !downloadData?.success) {
            const errorMsg = downloadData?.error || "Failed to download book";
            // Check if it's an authentication/access error
            if (errorMsg.includes("403") || errorMsg.includes("Forbidden") || errorMsg.includes("authentication")) {
              failed.push(url);
            }
            throw new Error(errorMsg);
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
          successCount++;
        } catch (error: any) {
          console.error(`Error adding book from ${url}:`, error);
          failCount++;
        }
      }

      // Show result
      if (successCount > 0) {
        toast({
          title: "Success",
          description: `Added ${successCount} book${successCount > 1 ? 's' : ''} successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        });
        
        if (failed.length > 0) {
          setFailedUrls(failed);
          setShowManualHelp(true);
        }
      } else {
        if (failed.length > 0) {
          setFailedUrls(failed);
          setShowManualHelp(true);
        }
        throw new Error("Failed to add any books");
      }

      // Reset form only if no failed URLs
      if (failed.length === 0) {
        setUrls("");
        setTitle("");
        setAuthor("");
        setSeries("");
        setProgress({ current: 0, total: 0 });
        onOpenChange(false);
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error adding books:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add books from URLs",
      });
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Add Book from URL
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="url" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url">Direct URL</TabsTrigger>
            <TabsTrigger value="gutenberg">Project Gutenberg</TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="urls">Book URLs *</Label>
            <textarea
              id="urls"
              placeholder="https://example.com/book1.pdf&#10;https://example.com/book2.epub&#10;https://example.com/book3.pdf"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              disabled={loading}
              required
              className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Enter one URL per line or comma-separated. Supports PDF, EPUB, CBZ, CBR, and TXT files.
            </p>
          </div>
          
          {loading && progress.total > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Processing {progress.current} of {progress.total}...
              </p>
              <div className="w-full bg-secondary rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

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
          </TabsContent>

          <TabsContent value="gutenberg">
            <GutenbergSearch onSuccess={onSuccess} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
