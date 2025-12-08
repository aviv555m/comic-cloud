import { useNavigate } from "react-router-dom";
import { BookOpen, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Book {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  reading_progress: number;
  last_page_read: number | null;
  total_pages: number | null;
}

interface ContinueReadingProps {
  book: Book | null;
}

export const ContinueReading = ({ book }: ContinueReadingProps) => {
  const navigate = useNavigate();

  if (!book || book.reading_progress === 0) return null;

  return (
    <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="w-16 h-24 object-cover rounded-md shadow-md"
            />
          ) : (
            <div className="w-16 h-24 bg-muted rounded-md flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Continue reading</p>
            <h3 className="font-semibold truncate">{book.title}</h3>
            {book.author && (
              <p className="text-sm text-muted-foreground truncate">{book.author}</p>
            )}
            
            <div className="mt-2 flex items-center gap-2">
              <Progress value={book.reading_progress} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {book.reading_progress}%
              </span>
            </div>
            
            {book.last_page_read && book.total_pages && (
              <p className="text-xs text-muted-foreground mt-1">
                Page {book.last_page_read} of {book.total_pages}
              </p>
            )}
          </div>

          <Button
            size="icon"
            onClick={() => navigate(`/reader/${book.id}`)}
            className="shrink-0 h-12 w-12 rounded-full"
          >
            <Play className="w-5 h-5 ml-0.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
