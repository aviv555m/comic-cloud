import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Activity, BookOpen, Star, Trophy, Milestone, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { User } from "@supabase/supabase-js";

interface FeedItem {
  id: string;
  user_id: string;
  activity_type: string;
  activity_data: Record<string, any>;
  created_at: string;
  username?: string;
  avatar_url?: string;
}

const ACTIVITY_ICONS: Record<string, typeof BookOpen> = {
  finished_book: BookOpen,
  review: Star,
  achievement: Trophy,
  milestone: Milestone,
};

const ACTIVITY_COLORS: Record<string, string> = {
  finished_book: "text-green-500",
  review: "text-amber-500",
  achievement: "text-purple-500",
  milestone: "text-blue-500",
};

const Feed = () => {
  const [user, setUser] = useState<User | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchFeed(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchFeed = async (userId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("activity_feed")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      // Fetch usernames for all unique user_ids
      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const enriched = data.map(d => ({
        ...d,
        activity_data: (d.activity_data || {}) as Record<string, any>,
        username: profileMap.get(d.user_id)?.username || "Reader",
        avatar_url: profileMap.get(d.user_id)?.avatar_url || null,
      }));
      setFeed(enriched);
    }
    setLoading(false);
  };

  const getActivityText = (item: FeedItem) => {
    const data = item.activity_data;
    switch (item.activity_type) {
      case "finished_book":
        return `finished reading "${data.title || "a book"}"`;
      case "review":
        return `reviewed "${data.title || "a book"}" with ${data.rating || "?"} stars`;
      case "achievement":
        return `earned the "${data.name || "achievement"}" badge`;
      case "milestone":
        return data.text || "reached a reading milestone";
      default:
        return "did something";
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" /> Activity Feed
            </h1>
            <p className="text-muted-foreground">See what your book club friends are reading</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : feed.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
              <p className="text-muted-foreground">
                Join a book club to see what others are reading, or start logging your own activity!
              </p>
              <Button className="mt-4" onClick={() => navigate("/clubs")}>Browse Book Clubs</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {feed.map(item => {
              const Icon = ACTIVITY_ICONS[item.activity_type] || Activity;
              const color = ACTIVITY_COLORS[item.activity_type] || "text-primary";
              return (
                <Card key={item.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-4 flex items-start gap-3">
                    <div className="shrink-0">
                      {item.avatar_url ? (
                        <img src={item.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                          {(item.username || "R").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{item.username}</span>{" "}
                        {getActivityText(item)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(item.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <Icon className={`w-5 h-5 shrink-0 ${color}`} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Feed;
