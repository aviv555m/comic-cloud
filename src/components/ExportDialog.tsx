import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, FileJson, FileText, FileSpreadsheet } from "lucide-react";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = "json" | "markdown" | "csv";

export const ExportDialog = ({ open, onOpenChange }: ExportDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("json");
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [includeProgress, setIncludeProgress] = useState(true);
  const [includeReviews, setIncludeReviews] = useState(true);
  const [includeSessions, setIncludeSessions] = useState(false);
  const { toast } = useToast();

  const exportData = async () => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch all user data
      const [booksRes, annotationsRes, reviewsRes, sessionsRes, listsRes, challengesRes] = await Promise.all([
        supabase.from("books").select("*").eq("user_id", user.id),
        includeAnnotations 
          ? supabase.from("annotations").select("*").eq("user_id", user.id)
          : { data: [] },
        includeReviews
          ? supabase.from("book_reviews").select("*").eq("user_id", user.id)
          : { data: [] },
        includeSessions
          ? supabase.from("reading_sessions").select("*").eq("user_id", user.id)
          : { data: [] },
        supabase.from("reading_lists").select("*, reading_list_books(*)").eq("user_id", user.id),
        supabase.from("reading_challenges").select("*").eq("user_id", user.id),
      ]);

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        books: booksRes.data || [],
        annotations: annotationsRes.data || [],
        reviews: reviewsRes.data || [],
        sessions: sessionsRes.data || [],
        readingLists: listsRes.data || [],
        challenges: challengesRes.data || [],
      };

      let content: string;
      let filename: string;
      let mimeType: string;

      switch (format) {
        case "markdown":
          content = generateMarkdown(exportPayload);
          filename = `bookshelf-export-${new Date().toISOString().split('T')[0]}.md`;
          mimeType = "text/markdown";
          break;
        case "csv":
          content = generateCSV(exportPayload);
          filename = `bookshelf-export-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = "text/csv";
          break;
        default:
          content = JSON.stringify(exportPayload, null, 2);
          filename = `bookshelf-export-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = "application/json";
      }

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export complete",
        description: `Your library has been exported to ${filename}`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const generateMarkdown = (data: any): string => {
    let md = `# Bookshelf Export\n\nExported on ${new Date().toLocaleDateString()}\n\n`;
    
    md += `## Books (${data.books.length})\n\n`;
    data.books.forEach((book: any) => {
      md += `### ${book.title}\n`;
      md += `- Author: ${book.author || "Unknown"}\n`;
      md += `- Progress: ${book.reading_progress || 0}%\n`;
      md += `- Status: ${book.is_completed ? "Completed" : "In Progress"}\n\n`;
    });

    if (data.annotations.length > 0) {
      md += `## Annotations (${data.annotations.length})\n\n`;
      data.annotations.forEach((ann: any) => {
        md += `> "${ann.selected_text}"\n`;
        if (ann.note) md += `\n*Note: ${ann.note}*\n`;
        md += `\n---\n\n`;
      });
    }

    if (data.reviews.length > 0) {
      md += `## Reviews (${data.reviews.length})\n\n`;
      data.reviews.forEach((review: any) => {
        md += `**Rating:** ${"⭐".repeat(review.rating || 0)}\n`;
        if (review.review) md += `${review.review}\n`;
        md += `\n---\n\n`;
      });
    }

    return md;
  };

  const generateCSV = (data: any): string => {
    const rows = [["Title", "Author", "Progress", "Completed", "Added"]];
    
    data.books.forEach((book: any) => {
      rows.push([
        book.title,
        book.author || "",
        `${book.reading_progress || 0}%`,
        book.is_completed ? "Yes" : "No",
        new Date(book.created_at).toLocaleDateString(),
      ]);
    });

    return rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Library</DialogTitle>
          <DialogDescription>
            Download your books, annotations, and reading data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format selection */}
          <div className="space-y-3">
            <Label>Export Format</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={format === "json" ? "default" : "outline"}
                className="flex flex-col gap-1 h-auto py-3"
                onClick={() => setFormat("json")}
              >
                <FileJson className="w-5 h-5" />
                <span className="text-xs">JSON</span>
              </Button>
              <Button
                variant={format === "markdown" ? "default" : "outline"}
                className="flex flex-col gap-1 h-auto py-3"
                onClick={() => setFormat("markdown")}
              >
                <FileText className="w-5 h-5" />
                <span className="text-xs">Markdown</span>
              </Button>
              <Button
                variant={format === "csv" ? "default" : "outline"}
                className="flex flex-col gap-1 h-auto py-3"
                onClick={() => setFormat("csv")}
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span className="text-xs">CSV</span>
              </Button>
            </div>
          </div>

          {/* Include options */}
          <div className="space-y-3">
            <Label>Include in Export</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="annotations"
                  checked={includeAnnotations}
                  onCheckedChange={(c) => setIncludeAnnotations(!!c)}
                />
                <label htmlFor="annotations" className="text-sm cursor-pointer">
                  Annotations & Highlights
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="progress"
                  checked={includeProgress}
                  onCheckedChange={(c) => setIncludeProgress(!!c)}
                />
                <label htmlFor="progress" className="text-sm cursor-pointer">
                  Reading Progress
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="reviews"
                  checked={includeReviews}
                  onCheckedChange={(c) => setIncludeReviews(!!c)}
                />
                <label htmlFor="reviews" className="text-sm cursor-pointer">
                  Reviews & Ratings
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sessions"
                  checked={includeSessions}
                  onCheckedChange={(c) => setIncludeSessions(!!c)}
                />
                <label htmlFor="sessions" className="text-sm cursor-pointer">
                  Reading Sessions (large file)
                </label>
              </div>
            </div>
          </div>
        </div>

        <Button onClick={exportData} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export Library
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
