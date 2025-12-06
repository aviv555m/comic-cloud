import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Book, Loader2, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BookResult {
  id: string;
  title: string;
  author: string;
  source: string;
  downloadUrl?: string;
  formats?: { [key: string]: string };
  description?: string;
}

interface PublicLibrarySearchProps {
  onSuccess: () => void;
}

export const PublicLibrarySearch = ({ onSuccess }: PublicLibrarySearchProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState("gutenberg");
  const { toast } = useToast();

  const searchGutenberg = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://gutendex.com/books?search=${encodeURIComponent(query)}`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    const api = data.data;
    return (api.results || []).map((book: any) => ({
      id: `gutenberg-${book.id}`,
      title: book.title,
      author: book.authors.map((a: any) => a.name).join(", ") || "Unknown",
      source: "Project Gutenberg",
      formats: book.formats,
    }));
  };

  const searchInternetArchive = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:texts&fl=identifier,title,creator,format&rows=20&page=1&output=json`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    const api = data.data;
    return (api.response?.docs || [])
      .filter((doc: any) => {
        // Only include if it has epub or pdf format
        const formats = Array.isArray(doc.format) ? doc.format : [doc.format];
        return formats.some((f: string) => 
          f?.toLowerCase().includes('epub') || f?.toLowerCase().includes('pdf')
        );
      })
      .map((doc: any) => {
        const formats = Array.isArray(doc.format) ? doc.format : [doc.format];
        const hasEpub = formats.some((f: string) => f?.toLowerCase().includes('epub'));
        const hasPdf = formats.some((f: string) => f?.toLowerCase().includes('pdf'));
        
        // Prefer epub over pdf
        const extension = hasEpub ? 'epub' : 'pdf';
        
        return {
          id: `archive-${doc.identifier}`,
          title: doc.title || "Unknown Title",
          author: doc.creator || "Unknown",
          source: "Internet Archive",
          downloadUrl: `https://archive.org/download/${doc.identifier}/${doc.identifier}.${extension}`,
          formats: {
            ...(hasEpub && { "application/epub+zip": `https://archive.org/download/${doc.identifier}/${doc.identifier}.epub` }),
            ...(hasPdf && { "application/pdf": `https://archive.org/download/${doc.identifier}/${doc.identifier}.pdf` }),
          },
        };
      });
  };

  const searchOpenLibrary = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    const api = data.data;
    return (api.docs || [])
      .filter((doc: any) => doc.has_fulltext)
      .map((doc: any) => ({
        id: `openlibrary-${doc.key}`,
        title: doc.title,
        author: doc.author_name?.join(", ") || "Unknown",
        source: "Open Library",
        downloadUrl: undefined,
      }));
  };

  // Note: RoyalRoad, Wattpad, MangaDex don't provide direct downloads

  const searchBooks = async () => {
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
      let searchResults: BookResult[] = [];
      
      switch (selectedSource) {
        case "gutenberg":
          searchResults = await searchGutenberg(searchQuery);
          break;
        case "archive":
          searchResults = await searchInternetArchive(searchQuery);
          break;
        case "openlibrary":
          searchResults = await searchOpenLibrary(searchQuery);
          break;
        case "all":
          const [gut, arch] = await Promise.allSettled([
            searchGutenberg(searchQuery),
            searchInternetArchive(searchQuery),
          ]);
          searchResults = [gut, arch]
            .filter((r): r is PromiseFulfilledResult<BookResult[]> => r.status === "fulfilled")
            .flatMap((r) => r.value);
          break;
      }
      
      setResults(searchResults);
      
      if (searchResults.length === 0) {
        toast({
          title: "No results",
          description: "Try a different search term or source",
        });
      }
    } catch (error) {
      console.error("Error searching:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to search. Some sources may not be available.",
      });
    } finally {
      setLoading(false);
    }
  };

  const addBook = async (book: BookResult) => {
    setDownloading(book.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let url = book.downloadUrl;

      // Handle sources that provide multiple formats (e.g., Gutenberg)
      if (book.formats) {
        const epubUrl = book.formats["application/epub+zip"];
        const pdfUrl = book.formats["application/pdf"];
        url = epubUrl || pdfUrl || url;
      }

      if (!url) {
        // For sources without direct download (MangaDex, Wattpad, etc.)
        toast({
          variant: "destructive",
          title: "No direct download available",
          description: "This source doesn't provide direct downloads. Try Project Gutenberg or Internet Archive.",
        });
        return;
      }

      // Download via backend function
      const { data: downloadData, error: downloadError } = await supabase.functions.invoke(
        "download-book",
        {
          body: { url, userId: user.id },
        }
      );

      if (downloadError) {
        throw new Error(downloadError.message || "Failed to download book");
      }
      
      if (!downloadData?.success) {
        throw new Error(downloadData?.error || "Failed to download book");
      }

      const resolvedType = String(downloadData.fileType || "epub").toLowerCase();
      
      // Validate the file type
      const validTypes = ["epub", "pdf", "cbz", "cbr"];
      if (!validTypes.includes(resolvedType)) {
        throw new Error(`Unsupported file type: ${resolvedType}. Only EPUB, PDF, CBZ, and CBR are supported.`);
      }

      // Create book entry using the actual downloaded file type
      const bookData = {
        user_id: user.id,
        title: book.title,
        author: book.author,
        series: null,
        file_url: downloadData.fileUrl,
        file_type: resolvedType,
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
        title: "Download failed",
        description: error.message || "Failed to add book. Try a different source.",
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Select Source</Label>
        <Select value={selectedSource} onValueChange={setSelectedSource}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources (Recommended)</SelectItem>
            <SelectItem value="gutenberg">Project Gutenberg (70K+ free books)</SelectItem>
            <SelectItem value="archive">Internet Archive (Millions of books)</SelectItem>
            <SelectItem value="openlibrary">Open Library (Browse only)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Project Gutenberg and Internet Archive provide direct downloads
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="search">Search Books</Label>
        <div className="flex gap-2">
          <Input
            id="search"
            placeholder="Enter book title or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchBooks()}
          />
          <Button onClick={searchBooks} disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Search free public domain books and web novels
        </p>
      </div>

      {results.length > 0 && (
        <ScrollArea className="h-[400px] rounded-md border p-4">
          <div className="space-y-3">
            {results.map((book) => (
              <div
                key={book.id}
                className="flex flex-col sm:flex-row gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Book className="w-8 h-8 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm sm:text-base break-words">{book.title}</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground">{book.author}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Source: {book.source}
                  </p>
                  {book.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {book.description}
                    </p>
                  )}
                  {book.formats && (
                    <div className="flex gap-2 mt-2 text-xs flex-wrap">
                      {book.formats["application/epub+zip"] && (
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded">EPUB</span>
                      )}
                      {book.formats["application/pdf"] && (
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded">PDF</span>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => addBook(book)}
                  disabled={downloading === book.id || (!book.downloadUrl && !book.formats)}
                  className="shrink-0 w-full sm:w-auto"
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
