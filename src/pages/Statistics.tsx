import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BookOpen, Clock, TrendingUp, Award } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Stats {
  totalBooks: number;
  completedBooks: number;
  totalPages: number;
  totalReadingTime: number;
  currentStreak: number;
  longestStreak: number;
  favoriteGenre: string;
  booksThisMonth: number;
  averageReadingSpeed: number;
}

const Statistics = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentBooks, setRecentBooks] = useState<any[]>([]);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch books
      const { data: books } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", user.id);

      // Fetch reading sessions
      const { data: sessions } = await supabase
        .from("reading_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("start_time", { ascending: false });

      if (books && sessions) {
        const completed = books.filter(b => b.is_completed).length;
        const totalPages = books.reduce((sum, b) => sum + (b.last_page_read || 0), 0);
        const totalTime = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

        // Calculate streaks
        const { currentStreak, longestStreak } = calculateStreaks(sessions);

        // Books this month
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const booksThisMonth = books.filter(b => 
          new Date(b.created_at) >= thisMonth
        ).length;

        // Average reading speed (pages per hour)
        const avgSpeed = totalTime > 0 ? Math.round((totalPages / totalTime) * 60) : 0;

        setStats({
          totalBooks: books.length,
          completedBooks: completed,
          totalPages,
          totalReadingTime: totalTime,
          currentStreak,
          longestStreak,
          favoriteGenre: "Fiction", // Could be enhanced with genre tracking
          booksThisMonth,
          averageReadingSpeed: avgSpeed,
        });

        // Recent books
        setRecentBooks(books.slice(0, 5));
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching statistics:", error);
      setLoading(false);
    }
  };

  const calculateStreaks = (sessions: any[]) => {
    if (sessions.length === 0) return { currentStreak: 0, longestStreak: 0 };

    const dates = sessions.map(s => new Date(s.start_time).toDateString());
    const uniqueDates = [...new Set(dates)].sort();

    let currentStreak = 1;
    let longestStreak = 1;
    let tempStreak = 1;

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    // Check if today or yesterday has activity
    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
      currentStreak = 0;
    }

    for (let i = 1; i < uniqueDates.length; i++) {
      const prev = new Date(uniqueDates[i - 1]);
      const curr = new Date(uniqueDates[i]);
      const diffDays = Math.floor((prev.getTime() - curr.getTime()) / 86400000);

      if (diffDays === 1) {
        tempStreak++;
        if (i === 1 && currentStreak > 0) currentStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, tempStreak);
    return { currentStreak, longestStreak };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <BookOpen className="w-12 h-12 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Button>
          <h1 className="text-3xl font-bold">Reading Statistics</h1>
          <p className="text-muted-foreground">Track your reading journey</p>
        </div>

        {stats && (
          <>
            {/* Key Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Books</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalBooks}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.completedBooks} completed
                  </p>
                  <Progress 
                    value={(stats.completedBooks / stats.totalBooks) * 100} 
                    className="mt-2"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pages Read</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalPages.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    ~{stats.averageReadingSpeed} pages/hour
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Reading Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Math.floor(stats.totalReadingTime / 60)}h {stats.totalReadingTime % 60}m
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total time spent reading
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Current Streak</CardTitle>
                  <Award className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.currentStreak} days</div>
                  <p className="text-xs text-muted-foreground">
                    Longest: {stats.longestStreak} days
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">Books This Month</span>
                        <span className="text-sm font-bold">{stats.booksThisMonth}</span>
                      </div>
                      <Progress value={(stats.booksThisMonth / 5) * 100} />
                      <p className="text-xs text-muted-foreground mt-1">Goal: 5 books</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {recentBooks.map((book) => (
                      <div 
                        key={book.id} 
                        className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                        onClick={() => navigate(`/reader/${book.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{book.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {book.reading_progress}% complete
                          </p>
                        </div>
                        <Progress value={book.reading_progress} className="w-20" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Statistics;
