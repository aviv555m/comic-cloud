import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Book, Loader2, Download, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface BookResult {
  id: string;
  title: string;
  author: string;
  source: string;
  downloadUrl?: string;
  formats?: { [key: string]: string };
  description?: string;
  externalUrl?: string;
  coverUrl?: string;
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
    return (api.results || []).map((book: any) => {
      // Get the best available format
      const formats: { [key: string]: string } = {};
      if (book.formats?.["application/epub+zip"]) {
        formats["application/epub+zip"] = book.formats["application/epub+zip"];
      }
      if (book.formats?.["application/pdf"]) {
        formats["application/pdf"] = book.formats["application/pdf"];
      }
      if (book.formats?.["text/plain; charset=utf-8"]) {
        formats["text/plain"] = book.formats["text/plain; charset=utf-8"];
      }
      if (book.formats?.["text/plain"]) {
        formats["text/plain"] = book.formats["text/plain"];
      }
      
      return {
        id: `gutenberg-${book.id}`,
        title: book.title,
        author: book.authors.map((a: any) => a.name).join(", ") || "Unknown",
        source: "Project Gutenberg",
        formats,
        downloadUrl: formats["application/epub+zip"] || formats["application/pdf"] || formats["text/plain"],
        coverUrl: book.formats?.["image/jpeg"],
        externalUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
      };
    });
  };

  const searchInternetArchive = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:texts&fl=identifier,title,creator,format&rows=30&page=1&output=json`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    const api = data.data;
    
    return (api.response?.docs || [])
      .map((doc: any) => {
        const formats = Array.isArray(doc.format) ? doc.format : [doc.format].filter(Boolean);
        const formatStr = formats.join(" ").toLowerCase();
        
        const hasEpub = formatStr.includes("epub");
        const hasPdf = formatStr.includes("pdf");
        const hasCbz = formatStr.includes("cbz") || formatStr.includes("comic book archive");
        
        if (!hasEpub && !hasPdf && !hasCbz) return null;
        
        const formatUrls: { [key: string]: string } = {};
        
        // Internet Archive uses the identifier as part of the download URL
        // We'll let the download function find the actual file
        if (hasEpub) {
          formatUrls["application/epub+zip"] = `https://archive.org/download/${doc.identifier}/${doc.identifier}.epub`;
        }
        if (hasPdf) {
          formatUrls["application/pdf"] = `https://archive.org/download/${doc.identifier}/${doc.identifier}.pdf`;
        }
        if (hasCbz) {
          formatUrls["application/x-cbz"] = `https://archive.org/download/${doc.identifier}/${doc.identifier}.cbz`;
        }
        
        return {
          id: `archive-${doc.identifier}`,
          title: doc.title || "Unknown Title",
          author: doc.creator || "Unknown",
          source: "Internet Archive",
          formats: formatUrls,
          downloadUrl: formatUrls["application/epub+zip"] || formatUrls["application/pdf"] || formatUrls["application/x-cbz"],
          externalUrl: `https://archive.org/details/${doc.identifier}`,
        };
      })
      .filter(Boolean) as BookResult[];
  };

  const searchInternetArchiveManga = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+(subject:manga+OR+subject:comic+OR+subject:manhwa+OR+subject:manhua+OR+subject:webtoon)&fl=identifier,title,creator,format&rows=30&page=1&output=json`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    const api = data.data;
    
    return (api.response?.docs || [])
      .map((doc: any) => {
        const formats = Array.isArray(doc.format) ? doc.format : [doc.format].filter(Boolean);
        const formatStr = formats.join(" ").toLowerCase();
        
        const hasCbz = formatStr.includes("cbz") || formatStr.includes("zip") || formatStr.includes("comic");
        const hasPdf = formatStr.includes("pdf");
        
        if (!hasCbz && !hasPdf) return null;
        
        const formatUrls: { [key: string]: string } = {};
        if (hasCbz) {
          formatUrls["application/x-cbz"] = `https://archive.org/download/${doc.identifier}/${doc.identifier}.cbz`;
        }
        if (hasPdf) {
          formatUrls["application/pdf"] = `https://archive.org/download/${doc.identifier}/${doc.identifier}.pdf`;
        }
        
        return {
          id: `archive-manga-${doc.identifier}`,
          title: doc.title || "Unknown Title",
          author: doc.creator || "Unknown",
          source: "Internet Archive (Manga)",
          formats: formatUrls,
          downloadUrl: formatUrls["application/x-cbz"] || formatUrls["application/pdf"],
          externalUrl: `https://archive.org/details/${doc.identifier}`,
        };
      })
      .filter(Boolean) as BookResult[];
  };

  const searchOpenLibrary = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&has_fulltext=true`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    const api = data.data;
    
    return (api.docs || [])
      .filter((doc: any) => doc.has_fulltext && doc.ia)
      .slice(0, 15)
      .map((doc: any) => {
        const iaId = Array.isArray(doc.ia) ? doc.ia[0] : doc.ia;
        
        return {
          id: `openlibrary-${doc.key}`,
          title: doc.title,
          author: doc.author_name?.join(", ") || "Unknown",
          source: "Open Library",
          downloadUrl: iaId ? `https://archive.org/download/${iaId}/${iaId}.epub` : undefined,
          formats: iaId ? {
            "application/epub+zip": `https://archive.org/download/${iaId}/${iaId}.epub`,
            "application/pdf": `https://archive.org/download/${iaId}/${iaId}.pdf`,
          } : undefined,
          externalUrl: `https://openlibrary.org${doc.key}`,
          coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
        };
      });
  };

  const searchStandardEbooks = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://standardebooks.org/opds/all`,
        responseType: "text",
      },
    });
    if (error || !data?.success) return [];
    
    const xmlText = data.data;
    const results: BookResult[] = [];
    const lowerQuery = query.toLowerCase();
    
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    
    while ((match = entryRegex.exec(xmlText)) !== null && results.length < 20) {
      const entry = match[1];
      
      const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
      const authorMatch = entry.match(/<name>([^<]+)<\/name>/);
      const idMatch = entry.match(/<id>([^<]+)<\/id>/);
      
      const title = titleMatch?.[1] || "";
      const author = authorMatch?.[1] || "Unknown";
      
      if (!title.toLowerCase().includes(lowerQuery) && 
          !author.toLowerCase().includes(lowerQuery)) {
        continue;
      }
      
      // Find all epub links and prefer the non-advanced one
      const epubMatches = [...entry.matchAll(/href="([^"]+\.epub[^"]*)"/g)];
      let epubUrl = "";
      
      for (const m of epubMatches) {
        const url = m[1];
        if (!url.includes("advanced")) {
          epubUrl = url;
          break;
        }
      }
      if (!epubUrl && epubMatches.length > 0) {
        epubUrl = epubMatches[0][1];
      }
      
      if (epubUrl && title) {
        const fullUrl = epubUrl.startsWith("http") ? epubUrl : `https://standardebooks.org${epubUrl}`;
        results.push({
          id: `standardebooks-${idMatch?.[1] || title}`,
          title: title,
          author: author,
          source: "Standard Ebooks",
          downloadUrl: fullUrl,
          formats: {
            "application/epub+zip": fullUrl,
          },
          externalUrl: `https://standardebooks.org`,
        });
      }
    }
    
    return results;
  };

  // Search for light novels on Internet Archive
  const searchLightNovels = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+(subject:"light novel"+OR+subject:lightnovel+OR+title:"light novel")&fl=identifier,title,creator,format&rows=30&page=1&output=json`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    const api = data.data;
    
    return (api.response?.docs || [])
      .map((doc: any) => {
        const formats = Array.isArray(doc.format) ? doc.format : [doc.format].filter(Boolean);
        const formatStr = formats.join(" ").toLowerCase();
        
        const hasEpub = formatStr.includes("epub");
        const hasPdf = formatStr.includes("pdf");
        
        if (!hasEpub && !hasPdf) return null;
        
        const formatUrls: { [key: string]: string } = {};
        if (hasEpub) {
          formatUrls["application/epub+zip"] = `https://archive.org/download/${doc.identifier}/${doc.identifier}.epub`;
        }
        if (hasPdf) {
          formatUrls["application/pdf"] = `https://archive.org/download/${doc.identifier}/${doc.identifier}.pdf`;
        }
        
        return {
          id: `archive-ln-${doc.identifier}`,
          title: doc.title || "Unknown Title",
          author: doc.creator || "Unknown",
          source: "Internet Archive (Light Novels)",
          formats: formatUrls,
          downloadUrl: formatUrls["application/epub+zip"] || formatUrls["application/pdf"],
          externalUrl: `https://archive.org/details/${doc.identifier}`,
        };
      })
      .filter(Boolean) as BookResult[];
  };

  // Search for audiobooks on Internet Archive
  const searchAudiobooks = async (query: string): Promise<BookResult[]> => {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: {
        url: `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:audio+AND+(subject:audiobook+OR+subject:"audio book"+OR+collection:librivoxaudio)&fl=identifier,title,creator,format&rows=20&page=1&output=json`,
        responseType: "json",
      },
    });
    if (error || !data?.success) return [];
    
    toast({
      title: "Audiobooks",
      description: "Audiobooks can be listened to on Internet Archive. Click to open.",
    });
    
    const api = data.data;
    return (api.response?.docs || []).slice(0, 10).map((doc: any) => ({
      id: `archive-audio-${doc.identifier}`,
      title: doc.title || "Unknown Title",
      author: doc.creator || "Unknown",
      source: "LibriVox / Internet Archive",
      externalUrl: `https://archive.org/details/${doc.identifier}`,
    }));
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
        case "manga":
          searchResults = await searchInternetArchiveManga(searchQuery);
          break;
        case "lightnovels":
          searchResults = await searchLightNovels(searchQuery);
          break;
        case "audiobooks":
          searchResults = await searchAudiobooks(searchQuery);
          break;
        case "all":
          const [gut, arch, openLib, standard] = await Promise.allSettled([
            searchGutenberg(searchQuery),
            searchInternetArchive(searchQuery),
            searchOpenLibrary(searchQuery),
            searchStandardEbooks(searchQuery),
          ]);
          searchResults = [gut, arch, openLib, standard]
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
      let preferredType = "epub";

      if (book.formats) {
        const epubUrl = book.formats["application/epub+zip"];
        const pdfUrl = book.formats["application/pdf"];
        const cbzUrl = book.formats["application/x-cbz"];
        const txtUrl = book.formats["text/plain"];
        
        if (epubUrl) {
          url = epubUrl;
          preferredType = "epub";
        } else if (pdfUrl) {
          url = pdfUrl;
          preferredType = "pdf";
        } else if (cbzUrl) {
          url = cbzUrl;
          preferredType = "cbz";
        } else if (txtUrl) {
          url = txtUrl;
          preferredType = "txt";
        }
      }

      if (!url) {
        if (book.externalUrl) {
          window.open(book.externalUrl, "_blank");
          toast({
            title: "External link opened",
            description: "Download the file manually and upload it to your library.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "No download available",
            description: "This source doesn't provide direct downloads.",
          });
        }
        return;
      }

      console.log("Downloading from URL:", url);

      const { data: downloadData, error: downloadError } = await supabase.functions.invoke(
        "download-book",
        {
          body: { url, userId: user.id },
        }
      );

      if (downloadError) {
        console.error("Download error:", downloadError);
        throw new Error(downloadError.message || "Failed to download book");
      }
      
      if (!downloadData?.success) {
        console.error("Download failed:", downloadData);
        throw new Error(downloadData?.error || "Failed to download book");
      }

      const resolvedType = String(downloadData.fileType || preferredType).toLowerCase();
      
      const validTypes = ["epub", "pdf", "cbz", "cbr", "txt"];
      if (!validTypes.includes(resolvedType)) {
        throw new Error(`Unsupported file type: ${resolvedType}. Only EPUB, PDF, CBZ, CBR, and TXT are supported.`);
      }

      const bookData = {
        user_id: user.id,
        title: book.title,
        author: book.author,
        series: null,
        file_url: downloadData.fileUrl,
        file_type: resolvedType,
        file_size: downloadData.fileSize,
        cover_url: book.coverUrl || null,
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
        description: error.message || "Failed to add book. Try a different source or format.",
      });
    } finally {
      setDownloading(null);
    }
  };

  const getFormatBadges = (book: BookResult) => {
    if (!book.formats) return null;
    
    const badges = [];
    if (book.formats["application/epub+zip"]) badges.push("EPUB");
    if (book.formats["application/pdf"]) badges.push("PDF");
    if (book.formats["application/x-cbz"]) badges.push("CBZ");
    if (book.formats["text/plain; charset=utf-8"] || book.formats["text/plain"]) badges.push("TXT");
    
    return badges;
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
            <SelectItem value="gutenberg">Project Gutenberg (70K+ classics)</SelectItem>
            <SelectItem value="archive">Internet Archive (Millions of books)</SelectItem>
            <SelectItem value="openlibrary">Open Library (With downloads)</SelectItem>
            <SelectItem value="standardebooks">Standard Ebooks (High quality)</SelectItem>
            <SelectItem value="manga">Manga / Comics</SelectItem>
            <SelectItem value="lightnovels">Light Novels</SelectItem>
            <SelectItem value="audiobooks">Audiobooks (LibriVox)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          All sources provide free, legal downloads of public domain content
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
      </div>

      {results.length > 0 && (
        <ScrollArea className="h-[400px] rounded-md border p-4">
          <div className="space-y-3">
            {results.map((book) => {
              const badges = getFormatBadges(book);
              const hasDownload = book.downloadUrl || (book.formats && Object.keys(book.formats).length > 0);
              
              return (
                <div
                  key={book.id}
                  className="flex flex-col sm:flex-row gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  {book.coverUrl ? (
                    <img 
                      src={book.coverUrl} 
                      alt={book.title}
                      className="w-12 h-16 object-cover rounded shrink-0"
                    />
                  ) : (
                    <Book className="w-8 h-8 text-muted-foreground shrink-0" />
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{book.title}</h4>
                    <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {book.source}
                      </Badge>
                      {badges?.map((badge) => (
                        <Badge key={badge} variant="secondary" className="text-xs">
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 shrink-0">
                    {hasDownload ? (
                      <Button
                        size="sm"
                        onClick={() => addBook(book)}
                        disabled={downloading === book.id}
                      >
                        {downloading === book.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    ) : null}
                    
                    {book.externalUrl && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(book.externalUrl, "_blank")}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
