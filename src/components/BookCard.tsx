import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookCardProps {
  title: string;
  author?: string;
  series?: string;
  coverUrl?: string;
  fileType: string;
  isPublic: boolean;
  onClick?: () => void;
}

export const BookCard = ({
  title,
  author,
  series,
  coverUrl,
  fileType,
  isPublic,
  onClick,
}: BookCardProps) => {
  return (
    <Card
      className={cn(
        "group cursor-pointer overflow-hidden border-0 transition-smooth hover:shadow-lg hover:-translate-y-1",
        "glass-card"
      )}
      onClick={onClick}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[2/3] bg-gradient-to-br from-muted to-secondary/50">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <BookOpen className="w-16 h-16 text-muted-foreground/40" />
            </div>
          )}
          <div className="absolute top-2 right-2 flex gap-1">
            {isPublic ? (
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
                <Globe className="w-3 h-3 mr-1" />
                Public
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
                <Lock className="w-3 h-3 mr-1" />
                Private
              </Badge>
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <h3 className="font-semibold text-white line-clamp-2 mb-1">{title}</h3>
            {author && (
              <p className="text-sm text-white/80 line-clamp-1">{author}</p>
            )}
            {series && (
              <p className="text-xs text-white/60 line-clamp-1 mt-1">{series}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
