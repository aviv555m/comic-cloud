import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, BookOpen, Clock, TrendingUp, Award, Calendar, Target, Flame, Sun, Moon, Sunrise, BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, eachMonthOfInterval, subMonths } from "date-fns";

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

interface HourlyStats {
  hour: number;
  minutes: number;
  sessions: number;
}

interface MonthlyStats {
  month: string;
  books: number;
  pages: number;
  minutes: number;
}

interface FileTypeStats {
  type: string;
  count: number;
  percentage: number;
}

const Statistics = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentBooks, setRecentBooks] = useState<any[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<DailyActivity[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [fileTypeStats, setFileTypeStats] = useState<FileTypeStats[]>([]);
  const [yearlyBooks, setYearlyBooks] = useState<{ year: number; count: number }[]>([]);

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
        const totalPages = books.reduce((sum, b) => sum + (b.last_page_read || 0), 0);
        
        const totalTime = sessions.reduce((sum, s) => {
          if (s.duration_minutes && s.duration_minutes > 0) {
            return sum + s.duration_minutes;
          }
          if (s.end_time && s.start_time) {
            const start = new Date(s.start_time).getTime();
            const end = new Date(s.end_time).getTime();
            const minutes = Math.round((end - start) / 60000);
            return sum + (minutes > 0 ? minutes : 0);
          }
          return sum;
        }, 0);

        const { currentStreak, longestStreak } = calculateStreaks(sessions);

        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const booksThisMonth = books.filter(b => 
          new Date(b.created_at) >= thisMonth
        ).length;

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const booksThisWeek = books.filter(b => 
          new Date(b.created_at) >= weekAgo
        ).length;

        const avgSpeed = totalTime > 0 ? Math.round((totalPages / totalTime) * 60) : 0;

        const sessionsWithDuration = sessions.filter(s => s.duration_minutes && s.duration_minutes > 0);
        const avgSessionLength = sessionsWithDuration.length > 0 
          ? Math.round(sessionsWithDuration.reduce((sum, s) => sum + s.duration_minutes, 0) / sessionsWithDuration.length)
          : 0;

        const last7Days = getLast7DaysActivity(sessions);
        setWeeklyActivity(last7Days);

        const weeklyGoalDays = 5;
        const daysWithReading = last7Days.filter(d => d.minutes > 0).length;
        const readingGoalProgress = Math.min(100, Math.round((daysWithReading / weeklyGoalDays) * 100));

        // Calculate hourly stats (best reading times)
        const hourlyData = calculateHourlyStats(sessions);
        setHourlyStats(hourlyData);

        // Calculate monthly stats
        const monthlyData = calculateMonthlyStats(sessions, books);
        setMonthlyStats(monthlyData);

        // Calculate file type distribution
        const fileTypes = calculateFileTypeStats(books);
        setFileTypeStats(fileTypes);

        // Calculate yearly book counts
        const yearlyData = calculateYearlyBooks(books);
        setYearlyBooks(yearlyData);

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

  const calculateHourlyStats = (sessions: any[]): HourlyStats[] => {
    const hours: HourlyStats[] = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      minutes: 0,
      sessions: 0,
    }));

    sessions.forEach(s => {
      const hour = new Date(s.start_time).getHours();
      hours[hour].sessions++;
      hours[hour].minutes += s.duration_minutes || 0;
    });

    return hours;
  };

  const calculateMonthlyStats = (sessions: any[], books: any[]): MonthlyStats[] => {
    const now = new Date();
    const sixMonthsAgo = subMonths(now, 5);
    const months = eachMonthOfInterval({ start: startOfMonth(sixMonthsAgo), end: endOfMonth(now) });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      const monthSessions = sessions.filter(s => {
        const date = new Date(s.start_time);
        return date >= monthStart && date <= monthEnd;
      });

      const monthBooks = books.filter(b => {
        const date = new Date(b.finished_reading_at || b.updated_at);
        return b.is_completed && date >= monthStart && date <= monthEnd;
      });

      return {
        month: format(month, "MMM"),
        books: monthBooks.length,
        pages: monthSessions.reduce((sum, s) => sum + (s.pages_read || 0), 0),
        minutes: monthSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0),
      };
    });
  };

  const calculateFileTypeStats = (books: any[]): FileTypeStats[] => {
    const types: Record<string, number> = {};
    books.forEach(b => {
      const type = b.file_type?.toUpperCase() || "OTHER";
      types[type] = (types[type] || 0) + 1;
    });

    const total = books.length || 1;
    return Object.entries(types)
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  };

  const calculateYearlyBooks = (books: any[]): { year: number; count: number }[] => {
    const years: Record<number, number> = {};
    books.forEach(b => {
      if (b.is_completed) {
        const year = new Date(b.finished_reading_at || b.updated_at).getFullYear();
        years[year] = (years[year] || 0) + 1;
      }
    });

    return Object.entries(years)
      .map(([year, count]) => ({ year: parseInt(year), count }))
      .sort((a, b) => b.year - a.year)
      .slice(0, 5);
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

    const dates = sessions
      .map(s => new Date(s.start_time).toDateString())
      .filter((date, index, self) => self.indexOf(date) === index)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    if (dates.length === 0) return { currentStreak: 0, longestStreak: 0 };

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    let currentStreak = 0;
    if (dates[0] === today || dates[0] === yesterday) {
      currentStreak = 1;
      
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

  const getBestReadingTime = (): { period: string; icon: any; description: string } => {
    const morningHours = hourlyStats.slice(5, 12);
    const afternoonHours = hourlyStats.slice(12, 18);
    const eveningHours = hourlyStats.slice(18, 24);
    const nightHours = [...hourlyStats.slice(0, 5), ...hourlyStats.slice(23)];

    const totals = [
      { period: "Morning", minutes: morningHours.reduce((s, h) => s + h.minutes, 0), icon: Sunrise },
      { period: "Afternoon", minutes: afternoonHours.reduce((s, h) => s + h.minutes, 0), icon: Sun },
      { period: "Evening", minutes: eveningHours.reduce((s, h) => s + h.minutes, 0), icon: Moon },
      { period: "Night", minutes: nightHours.reduce((s, h) => s + h.minutes, 0), icon: Moon },
    ].sort((a, b) => b.minutes - a.minutes);

    const best = totals[0];
    return {
      period: best.period,
      icon: best.icon,
      description: best.minutes > 0 
        ? `You read ${Math.round(best.minutes / 60)}h ${best.minutes % 60}m during ${best.period.toLowerCase()}`
        : "Start reading to see your patterns",
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <BookOpen className="w-12 h-12 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  const maxMinutes = Math.max(...weeklyActivity.map(d => d.minutes), 1);
  const maxMonthlyMinutes = Math.max(...monthlyStats.map(m => m.minutes), 1);
  const bestTime = getBestReadingTime();
  const BestTimeIcon = bestTime.icon;

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
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Key Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            </TabsContent>

            <TabsContent value="insights" className="space-y-6">
              {/* Best Reading Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BestTimeIcon className="w-4 h-4" />
                      Best Reading Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">{bestTime.period}</div>
                    <p className="text-muted-foreground text-sm">{bestTime.description}</p>
                    
                    {/* Hourly breakdown */}
                    <div className="mt-6">
                      <p className="text-xs text-muted-foreground mb-2">Reading by hour</p>
                      <div className="flex items-end gap-0.5 h-16">
                        {hourlyStats.map((h, i) => {
                          const maxH = Math.max(...hourlyStats.map(x => x.minutes), 1);
                          return (
                            <div
                              key={i}
                              className="flex-1 bg-primary/60 rounded-t transition-all"
                              style={{ height: `${Math.max(2, (h.minutes / maxH) * 100)}%` }}
                              title={`${h.hour}:00 - ${h.minutes} min`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>12am</span>
                        <span>6am</span>
                        <span>12pm</span>
                        <span>6pm</span>
                        <span>12am</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Format Preferences
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {fileTypeStats.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No books yet</p>
                      ) : (
                        fileTypeStats.map((ft) => (
                          <div key={ft.type}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{ft.type}</span>
                              <span className="text-muted-foreground">{ft.count} books ({ft.percentage}%)</span>
                            </div>
                            <Progress value={ft.percentage} className="h-2" />
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Yearly Summary */}
              {yearlyBooks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      Books Completed by Year
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {yearlyBooks.map((y) => (
                        <div key={y.year} className="text-center p-4 rounded-lg bg-muted">
                          <div className="text-3xl font-bold text-primary">{y.count}</div>
                          <div className="text-sm text-muted-foreground">{y.year}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="reports" className="space-y-6">
              {/* Monthly Report */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Monthly Reading Report
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Reading Time Chart */}
                    <div>
                      <p className="text-sm font-medium mb-3">Reading Time (minutes)</p>
                      <div className="flex items-end gap-2 h-32">
                        {monthlyStats.map((m, i) => (
                          <div key={i} className="flex flex-col items-center flex-1">
                            <div 
                              className="w-full bg-primary rounded-t transition-all"
                              style={{ height: `${Math.max(4, (m.minutes / maxMonthlyMinutes) * 100)}%` }}
                            />
                            <span className="text-xs text-muted-foreground mt-2">{m.month}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Monthly Stats Table */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-3 text-sm font-medium">Month</th>
                            <th className="text-right p-3 text-sm font-medium">Books</th>
                            <th className="text-right p-3 text-sm font-medium">Pages</th>
                            <th className="text-right p-3 text-sm font-medium">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyStats.map((m, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-3 text-sm">{m.month}</td>
                              <td className="p-3 text-sm text-right">{m.books}</td>
                              <td className="p-3 text-sm text-right">{m.pages}</td>
                              <td className="p-3 text-sm text-right">
                                {m.minutes >= 60 
                                  ? `${Math.floor(m.minutes / 60)}h ${m.minutes % 60}m`
                                  : `${m.minutes}m`
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* This Month Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>This Month Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <div className="text-2xl font-bold">{stats.booksThisMonth}</div>
                      <div className="text-xs text-muted-foreground">Books Added</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <div className="text-2xl font-bold">
                        {monthlyStats[monthlyStats.length - 1]?.pages || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Pages Read</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <div className="text-2xl font-bold">
                        {Math.round((monthlyStats[monthlyStats.length - 1]?.minutes || 0) / 60)}h
                      </div>
                      <div className="text-xs text-muted-foreground">Reading Time</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <div className="text-2xl font-bold">{stats.currentStreak}</div>
                      <div className="text-xs text-muted-foreground">Day Streak</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Statistics;
