import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, Sparkles } from "lucide-react";
import { useExistingSeries } from "@/hooks/useExistingSeries";
import { SeriesCombobox } from "@/components/SeriesCombobox";

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Auto-fill title from filename if empty
      if (!title) {
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
        setTitle(nameWithoutExt);
      }
    }
  };

  const uploadCoverBlob = async (blob: Blob, extension = "jpg") => {
    const coverPath = `${userId}/${Date.now()}-cover.${extension.replace(/[^a-z0-9]/gi, "") || "jpg"}`;
    const coverFile = new File([blob], coverPath.split("/").pop() || "cover.jpg", {
      type: blob.type || "image/jpeg",
    });

    const { error } = await supabase.storage
      .from("book-covers")
      .upload(coverPath, coverFile, { upsert: true });

    if (error) throw error;

    const { data } = supabase.storage
      .from("book-covers")
      .getPublicUrl(coverPath);

    return data.publicUrl;
  };

  const fetchRemoteCover = async (url: string) => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: { url, responseType: "base64" },
    });

    if (error) throw error;

    const base64 = data?.body || data?.data || data;
    if (typeof base64 !== "string") {
      throw new Error("Cover proxy returned an invalid response");
    }

    const contentType = data?.contentType || "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: contentType });
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

      // Upload custom cover if provided
      let finalCoverUrl = coverUrl || null;
      if (coverFile) {
        const coverExt = coverFile.name.split(".").pop() || "jpg";
        finalCoverUrl = await uploadCoverBlob(coverFile, coverExt);
      } else if (coverUrl && /^https?:\/\//i.test(coverUrl)) {
        try {
          const remoteCover = await fetchRemoteCover(coverUrl);
          const coverExt = remoteCover.type.split("/").pop() || "jpg";
          finalCoverUrl = await uploadCoverBlob(remoteCover, coverExt);
        } catch (coverError) {
          console.warn("Failed to import remote cover, keeping original URL:", coverError);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a Book</DialogTitle>
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

          <Button type="submit" className="w-full" disabled={loading}>
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
