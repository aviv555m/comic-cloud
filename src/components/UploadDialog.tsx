import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { originalSupabase } from "@/lib/local-supabase";
import { Loader2, Upload, Sparkles } from "lucide-react";
import { useExistingSeries } from "@/hooks/useExistingSeries";
import { SeriesCombobox } from "@/components/SeriesCombobox";
import Epub from "epubjs";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: () => void;
  userId: string;
}

export const UploadDialog = ({ open, onOpenChange, onUploadComplete, userId }: UploadDialogProps) => {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const { toast } = useToast();
  const { series: existingSeries } = useExistingSeries(userId);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      let newTitle = title;
      // Auto-fill title from filename if empty
      if (!title) {
        newTitle = selectedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(newTitle);
      }
      
      // Auto-extract EPUB metadata and cover
      if (selectedFile.name.toLowerCase().endsWith('.epub')) {
        toast({ title: "Parsing EPUB...", description: "Extracting metadata and cover" });
        try {
          const arrayBuffer = await selectedFile.arrayBuffer();
          const epub = Epub(arrayBuffer);
          await epub.ready;
          
          const metadata = await epub.loaded.metadata;
          if (metadata.title) {
            setTitle(metadata.title);
            newTitle = metadata.title;
          }
          if (metadata.creator && !author) {
            setAuthor(metadata.creator);
          }
          
          const coverUrl = await epub.coverUrl();
          if (coverUrl) {
            // fetch the blob URL to convert to a real File
            const res = await fetch(coverUrl);
            const blob = await res.blob();
            const extractedCover = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' });
            setCoverFile(extractedCover);
            setCoverUrl(URL.createObjectURL(blob));
            toast({ title: "Cover Extracted", description: "Successfully extracted cover from EPUB" });
          }
        } catch (err) {
          console.warn("Failed to parse EPUB metadata locally:", err);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide a title and select a file",
      });
      return;
    }

    setLoading(true);

    try {
      // Upload file
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("book-files")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get signed URL for private bucket (valid for 1 year)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("book-files")
        .createSignedUrl(fileName, 60 * 60 * 24 * 365);

      if (signedUrlError) throw signedUrlError;

      const fileUrl = signedUrlData.signedUrl;

      // Sync to remote Supabase Storage in background for signed URL fallback
      originalSupabase?.auth?.getSession?.().then((res: any) => {
        const session = res?.data?.session ?? null;
        if (session?.user) {
          originalSupabase?.storage?.from('book-files')?.upload(fileName, file, {
            cacheControl: '3600',
            upsert: true
          }).then((uploadRes: any) => {
            if (uploadRes?.error) {
              console.warn('[Upload] Failed to sync to remote Supabase:', uploadRes.error.message);
            }
          }).catch(() => {});
        }
      }).catch(() => {});

      // Upload custom cover if provided
      let finalCoverUrl = (coverUrl && !coverUrl.startsWith('blob:')) ? coverUrl : null;
      if (coverFile) {
        const coverExt = coverFile.name.split('.').pop();
        const coverPath = `${userId}/${Date.now()}-cover.${coverExt}`;
        
        const { error: coverUploadError, data: uploadData } = await supabase.storage
          .from('book-covers')
          .upload(coverPath, coverFile, { upsert: true });

        if (coverUploadError) {
          console.error('Cover upload error:', coverUploadError);
          toast({
            variant: "destructive",
            title: "Warning",
            description: "Failed to upload custom cover, will generate one instead",
          });
        } else if (uploadData) {
          const { data: coverData } = supabase.storage
            .from('book-covers')
            .getPublicUrl(coverPath);
          finalCoverUrl = coverData.publicUrl;
        }
      }

      // Insert book record
      const { data: insertData, error: insertError } = await supabase
        .from("books")
        .insert({
          user_id: userId,
          title,
          author: author || null,
          series: series || null,
          file_url: fileUrl,
          file_type: fileExt || "unknown",
          file_size: file.size,
          is_public: isPublic,
          cover_url: finalCoverUrl,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Trigger metadata extraction and cover generation in background
      if (insertData) {
        // Extract metadata
        supabase.functions.invoke('extract-metadata', {
          body: { bookId: insertData.id }
        }).catch(console.error);

        // Generate cover only if no custom cover was uploaded
        if (!finalCoverUrl) {
          supabase.functions.invoke('generate-cover', {
            body: { bookId: insertData.id }
          }).catch(console.error);
        }
      }

      toast({
        title: "Success!",
        description: "Your book has been uploaded",
      });

      // Reset form
      setTitle("");
      setAuthor("");
      setSeries("");
      setCoverUrl("");
      setIsPublic(false);
      setFile(null);
      setCoverFile(null);
      onOpenChange(false);
      onUploadComplete();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md glass-panel border border-white/10 shadow-strong animate-in zoom-in-95 duration-300">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gradient">Upload a Book</DialogTitle>
          <DialogDescription>
            Add a new book or manga to your library
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">File *</Label>
            <Input
              id="file"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.epub,.cbz,.cbr,.txt"
              required
            />
            <p className="text-xs text-muted-foreground">
              Supported: PDF, EPUB, CBZ, CBR, TXT
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter book title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name"
            />
          </div>

          <div className="space-y-2">
            <Label>Series</Label>
            <SeriesCombobox
              value={series}
              onChange={setSeries}
              existingSeries={existingSeries}
              placeholder="Select or enter series..."
            />
          </div>

          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label htmlFor="coverUrl">Cover Image URL</Label>
            <Input
              id="coverUrl"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://example.com/cover.jpg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cover">Custom Cover File (Optional)</Label>
            <Input
              id="cover"
              type="file"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              accept="image/*"
            />
            {coverFile && (
              <p className="text-xs text-muted-foreground">
                {coverFile.name}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="public">Make Public</Label>
            <Switch
              id="public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-11 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 border-0 transition-all hover:shadow-violet-500/40 hover:-translate-y-0.5 rounded-xl font-bold mt-2" 
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Book
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
