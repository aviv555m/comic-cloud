import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Sparkles, Book, Clock, Flame, Star, Download, Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, startOfYear, endOfYear, eachDayOfInterval, differenceInDays } from "date-fns";
import type { User } from "@supabase/supabase-js";

const YearInReview = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [stats, setStats] = useState({
    totalBooks: 0,
    totalPages: 0,
    totalMinutes: 0,
    longestStreak: 0,
    topBooks: [] as { title: string; author: string | null; rating: number }[],
    heatmap: {} as Record<string, number>,
    genres: [] as string[],
    avgPagesPerDay: 0,
  });
  const navigate = useNavigate();
  const { toast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchStats(session.user.id, parseInt(year));
      } else {
        navigate("/auth");
      }
    });
  }, [navigate, year]);

  const fetchStats = async (userId: string, yr: number) => {
    setLoading(true);
    const start = startOfYear(new Date(yr, 0, 1)).toISOString();
    const end = endOfYear(new Date(yr, 0, 1)).toISOString();

    const [booksRes, sessionsRes, reviewsRes] = await Promise.all([
      supabase.from("books").select("*").eq("user_id", userId).eq("is_completed", true).gte("finished_reading_at", start).lte("finished_reading_at", end),
      supabase.from("reading_sessions").select("*").eq("user_id", userId).gte("start_time", start).lte("start_time", end),
      supabase.from("book_reviews").select("*, books(title, author)").eq("user_id", userId),
    ]);

    const books = booksRes.data || [];
    const sessions = sessionsRes.data || [];
    const reviews = reviewsRes.data || [];

    const totalMinutes = sessions.reduce((s, x) => s + (x.duration_minutes || 0), 0);
    const totalPages = sessions.reduce((s, x) => s + (x.pages_read || 0), 0);

    // Heatmap
    const heatmap: Record<string, number> = {};
    sessions.forEach(s => {
      const day = format(new Date(s.start_time), "yyyy-MM-dd");
      heatmap[day] = (heatmap[day] || 0) + (s.duration_minutes || 0);
    });

    // Longest streak
    const sessionDays = new Set(Object.keys(heatmap));
    const allDays = eachDayOfInterval({
      start: new Date(yr, 0, 1),
      end: new Date(Math.min(new Date(yr, 11, 31).getTime(), Date.now())),
    });
    let longestStreak = 0, currentStreak = 0;
    allDays.forEach(d => {
      const key = format(d, "yyyy-MM-dd");
      if (sessionDays.has(key)) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });

    // Top rated books
    const topBooks = reviews
      .filter(r => r.rating && r.rating >= 4)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 5)
      .map(r => ({
        title: (r as any).books?.title || "Unknown",
        author: (r as any).books?.author || null,
        rating: r.rating || 0,
      }));

    const daysInYear = differenceInDays(
      new Date(Math.min(new Date(yr, 11, 31).getTime(), Date.now())),
      new Date(yr, 0, 1)
    ) + 1;

    setStats({
      totalBooks: books.length,
      totalPages,
      totalMinutes,
      longestStreak,
      topBooks,
      heatmap,
      genres: [],
      avgPagesPerDay: Math.round(totalPages / daysInYear),
    });
    setLoading(false);
  };

  const exportCard = async () => {
    if (!cardRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, { backgroundColor: null });
      const link = document.createElement("a");
      link.download = `reading-wrapped-${year}.png`;
      link.href = canvas.toDataURL();
      link.click();
      toast({ title: "Exported!", description: "Your reading wrapped card has been saved" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to export" });
    }
  };

  // Heatmap rendering
  const renderHeatmap = () => {
    const yr = parseInt(year);
    const start = new Date(yr, 0, 1);
    const end = new Date(Math.min(new Date(yr, 11, 31).getTime(), Date.now()));
    const days = eachDayOfInterval({ start, end });
    const maxMinutes = Math.max(...Object.values(stats.heatmap), 1);

    return (
      <div className="flex flex-wrap gap-[2px]">
        {days.map(d => {
          const key = format(d, "yyyy-MM-dd");
          const minutes = stats.heatmap[key] || 0;
          const intensity = minutes / maxMinutes;
          return (
            <div
              key={key}
              className="w-2.5 h-2.5 rounded-[2px] transition-colors"
              style={{
                backgroundColor: minutes === 0
                  ? "hsl(var(--muted))"
                  : `hsl(28 80% ${70 - intensity * 40}%)`,
              }}
              title={`${format(d, "MMM d")}: ${minutes} min`}
            />
          );
        })}
      </div>
    );
  };

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" /> Year in Review
              </h1>
              <p className="text-muted-foreground">Your reading journey at a glance</p>
            </div>
          </div>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Shareable summary card */}
            <div ref={cardRef} className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-primary/10 via-accent/5 to-background border">
              <h2 className="text-xl font-bold mb-6 text-center">{year} Reading Wrapped</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <Book className="w-6 h-6 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{stats.totalBooks}</p>
                  <p className="text-xs text-muted-foreground">Books Read</p>
                </div>
                <div className="text-center">
                  <Calendar className="w-6 h-6 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{stats.totalPages.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Pages</p>
                </div>
                <div className="text-center">
                  <Clock className="w-6 h-6 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{Math.round(stats.totalMinutes / 60)}</p>
                  <p className="text-xs text-muted-foreground">Hours</p>
                </div>
                <div className="text-center">
                  <Flame className="w-6 h-6 mx-auto text-primary mb-1" />
                  <p className="text-2xl font-bold">{stats.longestStreak}</p>
                  <p className="text-xs text-muted-foreground">Longest Streak</p>
                </div>
              </div>

              {/* Heatmap */}
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Reading Activity</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {renderHeatmap()}
                </CardContent>
              </Card>

              {/* Top books */}
              {stats.topBooks.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500" /> Top Rated Books
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.topBooks.map((b, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground w-5">{i + 1}.</span>
                          <div className="flex-1 truncate">
                            <span className="font-medium">{b.title}</span>
                            {b.author && <span className="text-muted-foreground"> by {b.author}</span>}
                          </div>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: b.rating }).map((_, j) => (
                              <Star key={j} className="w-3 h-3 fill-amber-500 text-amber-500" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="flex justify-center">
              <Button onClick={exportCard} className="gap-2">
                <Download className="w-4 h-4" /> Export as Image
              </Button>
            </div>

            {/* Extra stats */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{stats.avgPagesPerDay}</p>
                    <p className="text-xs text-muted-foreground">Avg pages/day</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">{Object.keys(stats.heatmap).length}</p>
                    <p className="text-xs text-muted-foreground">Days reading</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default YearInReview;
