import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Globe, Lock, Sparkles, Edit, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { EditBookDialog } from "./EditBookDialog";

interface BookCardProps {
  id: string;
  title: string;
  author?: string;
  series?: string;
  coverUrl?: string;
  fileType: string;
  isPublic: boolean;
  isCompleted?: boolean;
  readingProgress?: number;
  canEdit?: boolean;
  onClick?: () => void;
  onCoverGenerated?: () => void;
}

export const BookCard = ({
  id,
  title,
  author,
  series,
  coverUrl,
  fileType,
  isPublic,
  isCompleted = false,
  readingProgress = 0,
  canEdit = false,
  onClick,
  onCoverGenerated,
}: BookCardProps) => {
  const [generating, setGenerating] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleGenerateCover = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGenerating(true);

    try {
      const { error } = await supabase.functions.invoke('generate-cover', {
        body: { bookId: id }
      });

      if (error) throw error;

      toast({
        title: "Cover generated!",
        description: "Your book cover has been created",
      });
      
      onCoverGenerated?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate cover",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditDialogOpen(true);
  };

  return (
    <>
      <EditBookDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        book={{ id, title, author: author || null, series: series || null, cover_url: coverUrl || null }}
        onSuccess={() => onCoverGenerated?.()}
      />
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
              className={cn(
                "w-full h-full object-cover",
                isCompleted && "opacity-60"
              )}
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full gap-3">
              <BookOpen className="w-16 h-16 text-muted-foreground/40" />
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleGenerateCover}
                  disabled={generating}
                  className="text-xs"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {generating ? "Generating..." : "Generate Cover"}
                </Button>
              )}
            </div>
          )}
          
          {/* Progress bar */}
          {readingProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${readingProgress}%` }}
              />
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 w-6 p-0 bg-white/90 backdrop-blur-sm"
                onClick={handleEdit}
              >
                <Edit className="w-3 h-3" />
              </Button>
            )}
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

          {/* Completion badge */}
          {isCompleted && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="bg-green-500/90 backdrop-blur-sm rounded-full p-3">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-t from-black/80 to-transparent">
            {isCompleted && (
              <Badge className="bg-green-500 mb-2 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Completed
              </Badge>
            )}
            <h3 className="font-semibold text-white line-clamp-2 mb-1 text-sm md:text-base">{title}</h3>
            {author && (
              <p className="text-xs md:text-sm text-white/80 line-clamp-1">{author}</p>
            )}
            {series && (
              <p className="text-xs text-white/60 line-clamp-1 mt-1">{series}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
};
