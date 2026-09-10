import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cloneRemoteData } from "@/lib/local-supabase";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Activity, BookOpen, Star, Trophy, Milestone, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { User } from "@supabase/supabase-js";

interface ActivityRow {
  id: string;
  user_id: string;
  activity_type: string;
  activity_data: Record<string, any> | null;
  created_at: string;
}

interface FeedItem extends ActivityRow {
  activity_data: Record<string, any>;
  username?: string;
  avatar_url?: string;
}

interface ProfileRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

interface FinishedBookRow {
  id: string;
  title: string;
  author: string | null;
  finished_reading_at: string | null;
}

interface ReviewRow {
  book_id: string;
  rating: number | null;
  created_at: string | null;
  books: { title: string } | null;
}

interface ActivityInsert {
  user_id: string;
  activity_type: string;
  activity_data: Record<string, any>;
  is_public: boolean;
  created_at: string;
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
  const publishedFor = useRef<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let currentUserId: string | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        currentUserId = session.user.id;
        setUser(session.user);
        fetchFeed(session.user.id);
        publishOwnActivityOnce(session.user.id);
      } else {
        navigate("/auth");
      }
    });

    // activity_feed is cloned from the remote in the background, so the first fetch
    // usually runs before any rows have landed in the local table.
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      const table = customEvent.detail?.table;
      if ((table === "activity_feed" || table === "profiles") && currentUserId) {
        fetchFeed(currentUserId);
      }
    };
    window.addEventListener("local-db-synced", handleSync);

    return () => {
      window.removeEventListener("local-db-synced", handleSync);
    };
  }, [navigate]);

  // Nothing in the app writes activity rows as things happen, so the user's own feed is
  // derived from what the local DB already knows: finished books and posted reviews. These
  // go through the normal local-first insert, so they sync upstream like any other table.
  const publishOwnActivity = async (userId: string) => {
    const [ownRes, booksRes, reviewsRes] = await Promise.all([
      supabase.from("activity_feed").select("activity_type, activity_data").eq("user_id", userId),
      // Capped: a large back catalogue shouldn't turn the first visit into a bulk upload.
      supabase
        .from("books")
        .select("id, title, author, finished_reading_at")
        .eq("user_id", userId)
        .eq("is_completed", true)
        .order("finished_reading_at", { ascending: false })
        .limit(25),
      supabase
        .from("book_reviews")
        .select("*, books(title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    const own: Pick<ActivityRow, "activity_type" | "activity_data">[] = ownRes.data || [];
    const finished: FinishedBookRow[] = booksRes.data || [];
    const reviews: ReviewRow[] = reviewsRes.data || [];

    const published = new Set(
      own.map(a => `${a.activity_type}:${a.activity_data?.book_id || ""}`)
    );
    const pending: ActivityInsert[] = [];

    for (const book of finished) {
      if (published.has(`finished_book:${book.id}`)) continue;
      published.add(`finished_book:${book.id}`);
      pending.push({
        user_id: userId,
        activity_type: "finished_book",
        activity_data: { book_id: book.id, title: book.title, author: book.author },
        is_public: true,
        created_at: book.finished_reading_at || new Date().toISOString(),
      });
    }

    for (const review of reviews) {
      if (!review.rating || published.has(`review:${review.book_id}`)) continue;
      published.add(`review:${review.book_id}`);
      pending.push({
        user_id: userId,
        activity_type: "review",
        activity_data: {
          book_id: review.book_id,
          title: review.books?.title,
          rating: review.rating,
        },
        is_public: true,
        created_at: review.created_at || new Date().toISOString(),
      });
    }

    if (pending.length > 0) {
      await supabase.from("activity_feed").insert(pending);
    }
  };

  // The dedupe above reads the local activity_feed mirror, and the clone merges that table
  // late in its pass — backfilling against a half-cloned table would re-post rows that
  // already exist upstream. Refresh the mirror first, the way Discover does.
  const publishOwnActivityOnce = async (userId: string) => {
    if (publishedFor.current === userId) return;
    publishedFor.current = userId;
    if (navigator.onLine) {
      try {
        await cloneRemoteData(userId);
      } catch (error) {
        console.error("Error syncing activity feed:", error);
      }
    }
    await publishOwnActivity(userId);
    await fetchFeed(userId);
  };

  const fetchFeed = async (userId: string) => {
    setLoading(true);

    const { data } = await supabase
      .from("activity_feed")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    const rows: ActivityRow[] = data || [];
    if (rows.length > 0) {
      // Fetch usernames for all unique user_ids
      const userIds = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", userIds);

      const profileRows: ProfileRow[] = profiles || [];
      const profileMap = new Map<string, ProfileRow>(profileRows.map(p => [p.id, p]));
      const enriched = rows.map(r => ({
        ...r,
        activity_data: (r.activity_data || {}) as Record<string, any>,
        username: profileMap.get(r.user_id)?.username || "Reader",
        avatar_url: profileMap.get(r.user_id)?.avatar_url || undefined,
      }));
      setFeed(enriched);
    } else {
      setFeed([]);
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
