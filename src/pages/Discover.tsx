import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Sparkles, 
  X,
  BookOpen,
  Loader2,
  RefreshCw,
  ExternalLink
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface Recommendation {
  id: string;
  recommended_title: string;
  recommended_author: string | null;
  recommended_cover_url: string | null;
  reason: string | null;
  source_type: string | null;
  confidence_score: number | null;
  is_dismissed: boolean | null;
}

const Discover = () => {
  const [user, setUser] = useState<User | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchRecommendations(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchRecommendations = async (userId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("book_recommendations")
      .select("*")
      .eq("user_id", userId)
      .eq("is_dismissed", false)
      .order("confidence_score", { ascending: false });

    setRecommendations(data || []);
    setLoading(false);
  };

  const dismissRecommendation = async (id: string) => {
    await supabase
      .from("book_recommendations")
      .update({ is_dismissed: true })
      .eq("id", id);

    setRecommendations(recommendations.filter((r) => r.id !== id));
    toast({ title: "Removed from recommendations" });
  };

  const generateRecommendations = async () => {
    if (!user) return;

    setGenerating(true);
    
    // Fetch user's reading history for context
    const { data: books } = await supabase
      .from("books")
      .select("title, author, is_completed")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);

    const { data: preferences } = await supabase
      .from("user_reading_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Generate some sample recommendations based on reading history
    // In a real app, this would call an AI edge function
    const completedBooks = books?.filter((b) => b.is_completed) || [];
    const authors = [...new Set(completedBooks.map((b) => b.author).filter(Boolean))];

    const sampleRecommendations = [
      {
        user_id: user.id,
        recommended_title: "The Midnight Library",
        recommended_author: "Matt Haig",
        reason: "Based on your reading patterns, you might enjoy this thought-provoking fiction",
        source_type: "ai_analysis",
        confidence_score: 0.85,
      },
      {
        user_id: user.id,
        recommended_title: "Project Hail Mary",
        recommended_author: "Andy Weir",
        reason: "Popular among readers with similar tastes",
        source_type: "similar_users",
        confidence_score: 0.78,
      },
      {
        user_id: user.id,
        recommended_title: "Atomic Habits",
        recommended_author: "James Clear",
        reason: "Highly rated self-improvement book",
        source_type: "reading_history",
        confidence_score: 0.72,
      },
    ];

    // Filter out books user already has
    const existingTitles = new Set(books?.map((b) => b.title.toLowerCase()) || []);
    const newRecs = sampleRecommendations.filter(
      (r) => !existingTitles.has(r.recommended_title.toLowerCase())
    );

    if (newRecs.length > 0) {
      await supabase.from("book_recommendations").insert(newRecs);
      await fetchRecommendations(user.id);
      toast({ title: "New recommendations generated!" });
    } else {
      toast({ title: "No new recommendations", description: "Check back later!" });
    }

    setGenerating(false);
  };

  const searchBook = (title: string, author: string | null) => {
    const query = encodeURIComponent(`${title} ${author || ""}`);
    window.open(`https://www.google.com/search?q=${query}+book`, "_blank");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Discover</h1>
              <p className="text-muted-foreground">Personalized book recommendations</p>
            </div>
          </div>
          <Button onClick={generateRecommendations} disabled={generating}>
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Generate New
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : recommendations.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center py-12">
              <Sparkles className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No recommendations yet</h3>
              <p className="text-muted-foreground mb-4">
                Generate personalized recommendations based on your reading history
              </p>
              <Button onClick={generateRecommendations} disabled={generating}>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Recommendations
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recommendations.map((rec) => (
              <Card key={rec.id} className="relative group">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => dismissRecommendation(rec.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-24 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      {rec.recommended_cover_url ? (
                        <img
                          src={rec.recommended_cover_url}
                          alt={rec.recommended_title}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <BookOpen className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base line-clamp-2">
                        {rec.recommended_title}
                      </CardTitle>
                      <CardDescription className="line-clamp-1">
                        {rec.recommended_author || "Unknown Author"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{rec.reason}</p>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {rec.confidence_score
                        ? `${Math.round(rec.confidence_score * 100)}% match`
                        : "Recommended"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => searchBook(rec.recommended_title, rec.recommended_author)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Find
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Discover;
