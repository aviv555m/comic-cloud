import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, BookOpen, AlertCircle, Check } from "lucide-react";

interface ImportBooksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (books: ImportedBook[]) => void;
}

interface ImportedBook {
  title: string;
  author: string;
  rating?: number;
  dateRead?: string;
  status?: "read" | "currently-reading" | "to-read";
}

export const ImportBooksDialog = ({
  open,
  onOpenChange,
  onImport,
}: ImportBooksDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedBooks, setParsedBooks] = useState<ImportedBook[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (
        !selectedFile.name.endsWith(".csv") &&
        !selectedFile.name.endsWith(".json")
      ) {
        toast({
          variant: "destructive",
          title: "Invalid file",
          description: "Please upload a CSV or JSON file",
        });
        return;
      }
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    try {
      const text = await file.text();

      if (file.name.endsWith(".csv")) {
        // Parse Goodreads CSV format
        const lines = text.split("\n");
        const headers = lines[0]?.split(",").map((h) => h.trim().toLowerCase());

        if (!headers) {
          throw new Error("Empty CSV file");
        }

        const titleIndex = headers.findIndex(
          (h) => h.includes("title") && !h.includes("original")
        );
        const authorIndex = headers.findIndex((h) => h.includes("author"));
        const ratingIndex = headers.findIndex(
          (h) => h.includes("my rating") || h === "rating"
        );
        const dateIndex = headers.findIndex((h) => h.includes("date read"));
        const statusIndex = headers.findIndex(
          (h) => h.includes("exclusive shelf") || h.includes("bookshelves")
        );

        const books: ImportedBook[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;

          // Handle CSV with quoted fields
          const values: string[] = [];
          let current = "";
          let inQuotes = false;

          for (const char of line) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
              values.push(current.trim());
              current = "";
            } else {
              current += char;
            }
          }
          values.push(current.trim());

          const title = titleIndex >= 0 ? values[titleIndex] : "";
          const author = authorIndex >= 0 ? values[authorIndex] : "";

          if (title) {
            books.push({
              title: title.replace(/^"|"$/g, ""),
              author: author?.replace(/^"|"$/g, "") || "Unknown",
              rating: ratingIndex >= 0 ? parseInt(values[ratingIndex]) || undefined : undefined,
              dateRead: dateIndex >= 0 ? values[dateIndex] : undefined,
              status:
                statusIndex >= 0
                  ? (values[statusIndex]?.includes("read")
                      ? "read"
                      : values[statusIndex]?.includes("currently")
                      ? "currently-reading"
                      : "to-read")
                  : undefined,
            });
          }
        }

        setParsedBooks(books);
      } else if (file.name.endsWith(".json")) {
        // Parse Calibre or custom JSON format
        const data = JSON.parse(text);
        const books: ImportedBook[] = Array.isArray(data)
          ? data.map((item: any) => ({
              title: item.title || item.Title || "",
              author:
                item.author ||
                item.Author ||
                item.authors?.join(", ") ||
                "Unknown",
              rating: item.rating || item.Rating,
            }))
          : [];
        setParsedBooks(books.filter((b) => b.title));
      }
    } catch (error) {
      console.error("Parse error:", error);
      toast({
        variant: "destructive",
        title: "Parse error",
        description: "Failed to parse the file. Please check the format.",
      });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = () => {
    onImport(parsedBooks);
    toast({
      title: "Import started",
      description: `Importing ${parsedBooks.length} books...`,
    });
    onOpenChange(false);
    setParsedBooks([]);
    setFile(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Books</DialogTitle>
          <DialogDescription>
            Import your reading history from Goodreads, Calibre, or other services
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="goodreads" className="space-y-4">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="goodreads">Goodreads CSV</TabsTrigger>
            <TabsTrigger value="calibre">Calibre / JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="goodreads" className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                How to export from Goodreads:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Go to Goodreads → My Books</li>
                <li>Click "Import and Export" on the left sidebar</li>
                <li>Click "Export Library"</li>
                <li>Upload the downloaded CSV file here</li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="calibre" className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Calibre / JSON format:
              </h4>
              <p className="text-muted-foreground">
                Upload a JSON file with an array of books. Each book should have
                "title" and optionally "author", "rating" fields.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-file">Select file</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,.json"
              onChange={handleFileChange}
            />
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
              Parsing file...
            </div>
          )}

          {parsedBooks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Found {parsedBooks.length} books
                </p>
              </div>

              <ScrollArea className="h-[200px] border rounded-lg">
                <div className="p-3 space-y-2">
                  {parsedBooks.slice(0, 50).map((book, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted"
                    >
                      <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{book.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {book.author}
                        </p>
                      </div>
                      {book.rating && book.rating > 0 && (
                        <span className="ml-auto text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                          {book.rating}★
                        </span>
                      )}
                    </div>
                  ))}
                  {parsedBooks.length > 50 && (
                    <p className="text-center text-sm text-muted-foreground py-2">
                      ...and {parsedBooks.length - 50} more
                    </p>
                  )}
                </div>
              </ScrollArea>

              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-amber-800 dark:text-amber-200">
                  This will add these books to your library as metadata only. You'll
                  still need to upload the actual book files separately.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={parsedBooks.length === 0 || parsing}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import {parsedBooks.length} Books
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
