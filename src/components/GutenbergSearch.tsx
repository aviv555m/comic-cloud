import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Book, Loader2, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GutenbergBook {
  id: number;
  title: string;
  authors: { name: string }[];
  formats: { [key: string]: string };
  subjects: string[];
}

interface GutenbergSearchProps {
  onSuccess: () => void;
}

export const GutenbergSearch = ({ onSuccess }: GutenbergSearchProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<GutenbergBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const { toast } = useToast();

  const searchGutenberg = async () => {
    if (!searchQuery.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a search term",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://gutendex.com/books?search=${encodeURIComponent(searchQuery)}`
      );
      const data = await response.json();
      setResults(data.results || []);
      
      if (data.results?.length === 0) {
        toast({
          title: "No results",
          description: "Try a different search term",
        });
      }
    } catch (error) {
      console.error("Error searching Gutenberg:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to search Project Gutenberg",
      });
    } finally {
      setLoading(false);
    }
  };

  const addBook = async (book: GutenbergBook) => {
    setDownloading(book.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Prefer EPUB, then PDF
      const epubUrl = book.formats["application/epub+zip"];
      const pdfUrl = book.formats["application/pdf"];
      const url = epubUrl || pdfUrl;

      if (!url) {
        throw new Error("No supported format available");
      }

      const fileType = epubUrl ? "epub" : "pdf";

      // Download via edge function
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
        title: book.title,
        author: book.authors.map(a => a.name).join(", ") || "Unknown",
        series: null,
        file_url: downloadData.fileUrl,
        file_type: fileType,
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
        description: `Added "${book.title}" to your library`,
      });

      onSuccess();
    } catch (error: any) {
      console.error("Error adding book:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add book",
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gutenberg-search">Search Project Gutenberg</Label>
        <div className="flex gap-2">
          <Input
            id="gutenberg-search"
            placeholder="Enter book title, author, or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchGutenberg()}
          />
          <Button onClick={searchGutenberg} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Search 70,000+ free public domain books from Project Gutenberg
        </p>
      </div>

      {results.length > 0 && (
        <ScrollArea className="h-[400px] rounded-md border p-4">
          <div className="space-y-3">
            {results.map((book) => (
              <div
                key={book.id}
                className="flex gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Book className="w-8 h-8 text-muted-foreground shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate">{book.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {book.authors.map(a => a.name).join(", ") || "Unknown Author"}
                  </p>
                  {book.subjects.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {book.subjects.slice(0, 2).join(" • ")}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2 text-xs">
                    {book.formats["application/epub+zip"] && (
                      <span className="px-2 py-1 bg-primary/10 text-primary rounded">EPUB</span>
                    )}
                    {book.formats["application/pdf"] && (
                      <span className="px-2 py-1 bg-primary/10 text-primary rounded">PDF</span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => addBook(book)}
                  disabled={downloading === book.id}
                  className="shrink-0"
                >
                  {downloading === book.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
