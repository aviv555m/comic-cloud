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
    const response = await fetch(
      `https://gutendex.com/books?search=${encodeURIComponent(query)}`
    );
    const data = await response.json();
    return (data.results || []).map((book: any) => ({
      id: `gutenberg-${book.id}`,
      title: book.title,
      author: book.authors.map((a: any) => a.name).join(", ") || "Unknown",
      source: "Project Gutenberg",
      formats: book.formats,
    }));
  };

  const searchInternetArchive = async (query: string): Promise<BookResult[]> => {
    const response = await fetch(
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl=identifier,title,creator&rows=20&page=1&output=json&and[]=(mediatype:texts%20AND%20format:epub)`
    );
    const data = await response.json();
    return (data.response?.docs || []).map((doc: any) => ({
      id: `archive-${doc.identifier}`,
      title: doc.title,
      author: doc.creator || "Unknown",
      source: "Internet Archive",
      downloadUrl: `https://archive.org/download/${doc.identifier}/${doc.identifier}.epub`,
    }));
  };

  const searchOpenLibrary = async (query: string): Promise<BookResult[]> => {
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20`
    );
    const data = await response.json();
    return (data.docs || [])
      .filter((doc: any) => doc.has_fulltext)
      .map((doc: any) => ({
        id: `openlibrary-${doc.key}`,
        title: doc.title,
        author: doc.author_name?.join(", ") || "Unknown",
        source: "Open Library",
        downloadUrl: doc.lending_edition ? 
          `https://archive.org/download/${doc.lending_edition}/${doc.lending_edition}.epub` : undefined,
      }))
      .filter((book: BookResult) => book.downloadUrl);
  };

  const searchStandardEbooks = async (query: string): Promise<BookResult[]> => {
    // Standard Ebooks doesn't have a search API, so we'll fetch their catalog
    const response = await fetch(`https://standardebooks.org/opds/all`);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    const entries = xml.querySelectorAll("entry");
    
    const books: BookResult[] = [];
    entries.forEach((entry) => {
      const title = entry.querySelector("title")?.textContent || "";
      const author = entry.querySelector("author name")?.textContent || "Unknown";
      
      if (title.toLowerCase().includes(query.toLowerCase()) || 
          author.toLowerCase().includes(query.toLowerCase())) {
        const links = entry.querySelectorAll("link");
        let epubUrl = "";
        links.forEach((link) => {
          if (link.getAttribute("type") === "application/epub+zip") {
            epubUrl = link.getAttribute("href") || "";
          }
        });
        
        if (epubUrl) {
          books.push({
            id: `standardebooks-${title}`,
            title,
            author,
            source: "Standard Ebooks",
            downloadUrl: epubUrl,
          });
        }
      }
    });
    
    return books.slice(0, 20);
  };

  const searchRoyalRoad = async (query: string): Promise<BookResult[]> => {
    // RoyalRoad doesn't have an official API, but we can search their fiction list
    try {
      const response = await fetch(
        `https://www.royalroad.com/fictions/search?title=${encodeURIComponent(query)}`
      );
      // Note: This would need CORS proxy in production
      // For now, return empty to avoid CORS issues
      return [];
    } catch (error) {
      console.error("RoyalRoad search error:", error);
      return [];
    }
  };

  const searchWattpad = async (query: string): Promise<BookResult[]> => {
    // Wattpad API requires authentication, so we'll use their public search
    // This is a simplified version - in production you'd need a backend proxy
    try {
      const response = await fetch(
        `https://www.wattpad.com/api/v3/stories?query=${encodeURIComponent(query)}&limit=20&fields=stories(id,title,user,description,completed)&filter=free`
      );
      const data = await response.json();
      return (data.stories || []).map((story: any) => ({
        id: `wattpad-${story.id}`,
        title: story.title,
        author: story.user?.name || "Unknown",
        source: "Wattpad",
        description: story.description,
      }));
    } catch (error) {
      console.error("Wattpad search error:", error);
      return [];
    }
  };

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
        case "standardebooks":
          searchResults = await searchStandardEbooks(searchQuery);
          break;
        case "royalroad":
          searchResults = await searchRoyalRoad(searchQuery);
          break;
        case "wattpad":
          searchResults = await searchWattpad(searchQuery);
          break;
        case "all":
          const [gut, arch, open, std] = await Promise.all([
            searchGutenberg(searchQuery),
            searchInternetArchive(searchQuery),
            searchOpenLibrary(searchQuery),
            searchStandardEbooks(searchQuery),
          ]);
          searchResults = [...gut, ...arch, ...open, ...std];
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
      let fileType = "epub";

      // Handle Gutenberg formats
      if (book.formats) {
        const epubUrl = book.formats["application/epub+zip"];
        const pdfUrl = book.formats["application/pdf"];
        url = epubUrl || pdfUrl;
        fileType = epubUrl ? "epub" : "pdf";
      }

      if (!url) {
        throw new Error("No download URL available for this book");
      }

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
        author: book.author,
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
        <Label>Select Source</Label>
        <Select value={selectedSource} onValueChange={setSelectedSource}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="gutenberg">Project Gutenberg (70K+ books)</SelectItem>
            <SelectItem value="archive">Internet Archive</SelectItem>
            <SelectItem value="openlibrary">Open Library</SelectItem>
            <SelectItem value="standardebooks">Standard Ebooks</SelectItem>
            <SelectItem value="royalroad">RoyalRoad (Web Novels)</SelectItem>
            <SelectItem value="wattpad">Wattpad (Free Stories)</SelectItem>
          </SelectContent>
        </Select>
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
                className="flex gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Book className="w-8 h-8 text-muted-foreground shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate">{book.title}</h4>
                  <p className="text-sm text-muted-foreground">{book.author}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Source: {book.source}
                  </p>
                  {book.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {book.description}
                    </p>
                  )}
                  {book.formats && (
                    <div className="flex gap-2 mt-2 text-xs">
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
