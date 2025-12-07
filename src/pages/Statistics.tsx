import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BookOpen, Clock, TrendingUp, Award, Calendar, Target, Flame } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Stats {
  totalBooks: number;
  completedBooks: number;
  totalPages: number;
  totalReadingTime: number;
  currentStreak: number;
  longestStreak: number;
  booksThisMonth: number;
  booksThisWeek: number;
  averageReadingSpeed: number;
  averageSessionLength: number;
  totalSessions: number;
  readingGoalProgress: number;
}

interface DailyActivity {
  date: string;
  minutes: number;
  pages: number;
}

const Statistics = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentBooks, setRecentBooks] = useState<any[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<DailyActivity[]>([]);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

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
        
        // Total pages from all books' current progress
        const totalPages = books.reduce((sum, b) => sum + (b.last_page_read || 0), 0);
        
        // Total reading time from sessions (with proper duration calculation)
        const totalTime = sessions.reduce((sum, s) => {
          if (s.duration_minutes && s.duration_minutes > 0) {
            return sum + s.duration_minutes;
          }
          // If duration not set but end_time exists, calculate it
          if (s.end_time && s.start_time) {
            const start = new Date(s.start_time).getTime();
            const end = new Date(s.end_time).getTime();
            const minutes = Math.round((end - start) / 60000);
            return sum + (minutes > 0 ? minutes : 0);
          }
          return sum;
        }, 0);

        // Calculate streaks properly
        const { currentStreak, longestStreak } = calculateStreaks(sessions);

        // Books this month
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const booksThisMonth = books.filter(b => 
          new Date(b.created_at) >= thisMonth
        ).length;

        // Books this week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const booksThisWeek = books.filter(b => 
          new Date(b.created_at) >= weekAgo
        ).length;

        // Average reading speed (pages per hour)
        const avgSpeed = totalTime > 0 ? Math.round((totalPages / totalTime) * 60) : 0;

        // Average session length
        const sessionsWithDuration = sessions.filter(s => s.duration_minutes && s.duration_minutes > 0);
        const avgSessionLength = sessionsWithDuration.length > 0 
          ? Math.round(sessionsWithDuration.reduce((sum, s) => sum + s.duration_minutes, 0) / sessionsWithDuration.length)
          : 0;

        // Weekly activity data
        const last7Days = getLast7DaysActivity(sessions);
        setWeeklyActivity(last7Days);

        // Reading goal (default: 30 min per day, 5 days per week)
        const weeklyGoalDays = 5;
        const daysWithReading = last7Days.filter(d => d.minutes > 0).length;
        const readingGoalProgress = Math.min(100, Math.round((daysWithReading / weeklyGoalDays) * 100));

        setStats({
          totalBooks: books.length,
          completedBooks: completed,
          totalPages,
          totalReadingTime: totalTime,
          currentStreak,
          longestStreak,
          booksThisMonth,
          booksThisWeek,
          averageReadingSpeed: avgSpeed,
          averageSessionLength: avgSessionLength,
          totalSessions: sessions.length,
          readingGoalProgress,
        });

        // Recent books sorted by last activity
        const sortedBooks = [...books].sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        setRecentBooks(sortedBooks.slice(0, 5));
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching statistics:", error);
      setLoading(false);
    }
  };

  const getLast7DaysActivity = (sessions: any[]): DailyActivity[] => {
    const result: DailyActivity[] = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      
      const daySessions = sessions.filter(s => 
        new Date(s.start_time).toDateString() === dateStr
      );
      
      const minutes = daySessions.reduce((sum, s) => {
        if (s.duration_minutes) return sum + s.duration_minutes;
        if (s.end_time) {
          const dur = Math.round((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000);
          return sum + (dur > 0 ? dur : 0);
        }
        return sum;
      }, 0);
      
      const pages = daySessions.reduce((sum, s) => sum + (s.pages_read || 0), 0);
      
      result.push({
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        minutes,
        pages,
      });
    }
    
    return result;
  };

  const calculateStreaks = (sessions: any[]) => {
    if (sessions.length === 0) return { currentStreak: 0, longestStreak: 0 };

    // Get unique dates when user had reading sessions
    const dates = sessions
      .map(s => new Date(s.start_time).toDateString())
      .filter((date, index, self) => self.indexOf(date) === index)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); // Sort descending

    if (dates.length === 0) return { currentStreak: 0, longestStreak: 0 };

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    // Check if the most recent session is today or yesterday
    let currentStreak = 0;
    if (dates[0] === today || dates[0] === yesterday) {
      currentStreak = 1;
      
      // Count consecutive days
      for (let i = 1; i < dates.length; i++) {
        const prevDate = new Date(dates[i - 1]);
        const currDate = new Date(dates[i]);
        const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / 86400000);
        
        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    let longestStreak = 1;
    let tempStreak = 1;
    
    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(dates[i - 1]);
      const currDate = new Date(dates[i]);
      const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / 86400000);
      
      if (diffDays === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }

    return { currentStreak, longestStreak: Math.max(longestStreak, currentStreak) };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <BookOpen className="w-12 h-12 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  const maxMinutes = Math.max(...weeklyActivity.map(d => d.minutes), 1);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold">Reading Statistics</h1>
          <p className="text-muted-foreground">Track your reading journey</p>
        </div>

        {stats && (
          <>
            {/* Key Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Total Books</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">{stats.totalBooks}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.completedBooks} completed
                  </p>
                  {stats.totalBooks > 0 && (
                    <Progress 
                      value={(stats.completedBooks / stats.totalBooks) * 100} 
                      className="mt-2 h-1"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Pages Read</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">{stats.totalPages.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    ~{stats.averageReadingSpeed} pages/hour
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Reading Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold">
                    {stats.totalReadingTime >= 60 
                      ? `${Math.floor(stats.totalReadingTime / 60)}h ${stats.totalReadingTime % 60}m`
                      : `${stats.totalReadingTime}m`
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.totalSessions} sessions total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs sm:text-sm font-medium">Current Streak</CardTitle>
                  <Flame className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl sm:text-2xl font-bold flex items-center gap-1">
                    {stats.currentStreak}
                    <span className="text-sm font-normal text-muted-foreground">days</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Best: {stats.longestStreak} days
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Weekly Activity Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Weekly Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between gap-1 h-32">
                    {weeklyActivity.map((day, i) => (
                      <div key={i} className="flex flex-col items-center flex-1">
                        <div 
                          className="w-full bg-primary/80 rounded-t transition-all duration-300 min-h-[4px]"
                          style={{ 
                            height: `${Math.max(4, (day.minutes / maxMinutes) * 100)}%` 
                          }}
                          title={`${day.minutes} minutes`}
                        />
                        <span className="text-xs text-muted-foreground mt-2">{day.date}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                    <span>Total: {weeklyActivity.reduce((s, d) => s + d.minutes, 0)} min</span>
                    <span>{weeklyActivity.reduce((s, d) => s + d.pages, 0)} pages</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Weekly Goal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">Reading Days</span>
                        <span className="text-sm font-bold">
                          {weeklyActivity.filter(d => d.minutes > 0).length} / 5 days
                        </span>
                      </div>
                      <Progress value={stats.readingGoalProgress} className="h-3" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {stats.readingGoalProgress >= 100 
                          ? "Goal achieved!" 
                          : `${5 - weeklyActivity.filter(d => d.minutes > 0).length} more days to reach your goal`
                        }
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">Avg Session</p>
                        <p className="text-lg font-bold">
                          {stats.averageSessionLength > 0 
                            ? `${stats.averageSessionLength} min` 
                            : "—"
                          }
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">This Week</p>
                        <p className="text-lg font-bold">{stats.booksThisWeek} books</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {recentBooks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No reading activity yet. Start reading to see your progress!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recentBooks.map((book) => (
                      <div 
                        key={book.id} 
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => navigate(`/reader/${book.id}`)}
                      >
                        {book.cover_url ? (
                          <img 
                            src={book.cover_url} 
                            alt={book.title}
                            className="w-10 h-14 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{book.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {book.is_completed ? "Completed" : `${book.reading_progress || 0}% complete`}
                          </p>
                        </div>
                        <Progress value={book.reading_progress || 0} className="w-20 h-2" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default Statistics;
