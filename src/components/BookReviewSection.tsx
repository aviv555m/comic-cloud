import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StarRating } from "./StarRating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface BookReviewSectionProps {
  bookId: string;
  userId: string;
}

export const BookReviewSection = ({ bookId, userId }: BookReviewSectionProps) => {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchReview();
  }, [bookId, userId]);

  const fetchReview = async () => {
    const { data } = await supabase
      .from("book_reviews")
      .select("*")
      .eq("book_id", bookId)
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      setRating(data.rating || 0);
      setReview(data.review || "");
      setIsPublic(data.is_public);
    }
    setLoading(false);
  };

  const saveReview = async () => {
    setSaving(true);

    const { error } = await supabase
      .from("book_reviews")
      .upsert(
        {
          book_id: bookId,
          user_id: userId,
          rating: rating || null,
          review: review || null,
          is_public: isPublic,
        },
        { onConflict: "book_id,user_id" }
      );

    setSaving(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save review",
      });
      return;
    }

    setHasChanges(false);
    toast({ title: "Review saved" });
  };

  const handleRatingChange = (newRating: number) => {
    setRating(newRating);
    setHasChanges(true);
  };

  const handleReviewChange = (newReview: string) => {
    setReview(newReview);
    setHasChanges(true);
  };

  const handlePublicChange = (newPublic: boolean) => {
    setIsPublic(newPublic);
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Your Rating</Label>
        <StarRating value={rating} onChange={handleRatingChange} size="lg" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Review (optional)</Label>
        <Textarea
          placeholder="Share your thoughts about this book..."
          value={review}
          onChange={(e) => handleReviewChange(e.target.value)}
          className="min-h-[100px] resize-none"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="public-review"
            checked={isPublic}
            onCheckedChange={handlePublicChange}
          />
          <Label htmlFor="public-review" className="text-sm">
            Make review public
          </Label>
        </div>

        {hasChanges && (
          <Button onClick={saveReview} disabled={saving} size="sm">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Review
          </Button>
        )}
      </div>
    </div>
  );
};
