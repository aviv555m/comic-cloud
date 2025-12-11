import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Share2, Twitter, Facebook, Link2, Check, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareProgressCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: {
    title: string;
    author: string | null;
    cover_url: string | null;
    reading_progress: number;
    is_completed: boolean;
  };
}

export const ShareProgressCard = ({
  open,
  onOpenChange,
  book,
}: ShareProgressCardProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareText = book.is_completed
    ? `I just finished reading "${book.title}"${book.author ? ` by ${book.author}` : ""}! 📚`
    : `I'm ${book.reading_progress}% through "${book.title}"${book.author ? ` by ${book.author}` : ""} 📖`;

  const shareUrl = window.location.origin;

  const shareToTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      "_blank",
      "width=550,height=420"
    );
  };

  const shareToFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`,
      "_blank",
      "width=550,height=420"
    );
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      toast({ title: "Copied to clipboard!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to copy",
        description: "Please copy manually",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Your Progress
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview Card */}
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex gap-4">
                {book.cover_url ? (
                  <img
                    src={book.cover_url}
                    alt={book.title}
                    className="w-16 h-24 object-cover rounded-lg shadow-md"
                  />
                ) : (
                  <div className="w-16 h-24 bg-muted rounded-lg flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold line-clamp-2">{book.title}</p>
                  {book.author && (
                    <p className="text-sm text-muted-foreground">{book.author}</p>
                  )}
                  <div className="mt-3">
                    {book.is_completed ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                        <Check className="w-4 h-4" />
                        Completed!
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <Progress value={book.reading_progress} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          {book.reading_progress}% complete
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Share message preview */}
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p>{shareText}</p>
          </div>

          {/* Share buttons */}
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant="outline"
              className="flex flex-col gap-1 h-auto py-3"
              onClick={shareToTwitter}
            >
              <Twitter className="w-5 h-5" />
              <span className="text-xs">Twitter</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col gap-1 h-auto py-3"
              onClick={shareToFacebook}
            >
              <Facebook className="w-5 h-5" />
              <span className="text-xs">Facebook</span>
            </Button>
            <Button
              variant="outline"
              className="flex flex-col gap-1 h-auto py-3"
              onClick={copyToClipboard}
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Link2 className="w-5 h-5" />
              )}
              <span className="text-xs">{copied ? "Copied!" : "Copy Link"}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
