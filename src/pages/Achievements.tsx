import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AchievementBadge } from "@/components/AchievementBadge";
import { ArrowLeft, Trophy, Flame, Book, Users, Loader2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface Achievement {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  requirement_type: string;
  requirement_value: number;
  points: number | null;
  is_secret: boolean | null;
}

interface UserAchievement {
  id: string;
  achievement_id: string;
  earned_at: string;
}

interface BookRow {
  is_completed: boolean | null;
}

interface ReadingSessionRow {
  start_time: string;
  pages_read: number | null;
  duration_minutes: number | null;
}

const Achievements = () => {
  const [user, setUser] = useState<User | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [stats, setStats] = useState({
    booksRead: 0,
    pagesRead: 0,
    currentStreak: 0,
    totalMinutes: 0,
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let currentUserId: string | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        currentUserId = session.user.id;
        setUser(session.user);
        fetchData(session.user.id);
      } else {
        navigate("/auth");
      }
    });

    // getSession only kicks the remote clone off in the background, so the badge
    // catalogue usually lands after this first fetch — re-read it when it arrives.
    // A clone pass merges `achievements` before `user_achievements`, so the events are
    // coalesced: refetching on the first one would award badges whose earned rows are
    // still in flight, duplicating them here and on the remote.
    let syncRefresh: NodeJS.Timeout | undefined;
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      const table = customEvent.detail?.table;
      if ((table === "achievements" || table === "user_achievements") && currentUserId) {
        const userId = currentUserId;
        clearTimeout(syncRefresh);
        syncRefresh = setTimeout(() => fetchData(userId), 1000);
      }
    };
    window.addEventListener("local-db-synced", handleSync);

    return () => {
      clearTimeout(syncRefresh);
      window.removeEventListener("local-db-synced", handleSync);
    };
  }, [navigate]);

  const fetchData = async (userId: string) => {
    setLoading(true);

    // Fetch all achievements and user's earned achievements
    const [achievementsRes, userAchievementsRes, booksRes, sessionsRes] = await Promise.all([
      supabase.from("achievements").select("*").order("category"),
      supabase.from("user_achievements").select("*").eq("user_id", userId),
      supabase.from("books").select("*").eq("user_id", userId),
      supabase.from("reading_sessions").select("*").eq("user_id", userId),
    ]);

    if (achievementsRes.data) setAchievements(achievementsRes.data);
    if (userAchievementsRes.data) setUserAchievements(userAchievementsRes.data);

    // Calculate stats
    const books: BookRow[] = booksRes.data || [];
    const sessions: ReadingSessionRow[] = sessionsRes.data || [];

    const booksRead = books.filter((b) => b.is_completed).length;
    const pagesRead = sessions.reduce((sum, s) => sum + (s.pages_read || 0), 0);
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

    // Calculate streak
    const today = new Date();
    let streak = 0;
    const sessionDates = [...new Set(
      sessions.map((s) => new Date(s.start_time).toDateString())
    )].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    // Anchor on today (or yesterday, if today hasn't started yet) and then walk back
    // one day at a time. Offsetting from today instead capped the streak at 1.
    const todayStr = today.toDateString();
    const yesterdayStr = new Date(today.getTime() - 86400000).toDateString();
    if (sessionDates[0] === todayStr || sessionDates[0] === yesterdayStr) {
      streak = 1;
      for (let i = 1; i < sessionDates.length; i++) {
        const prevDate = new Date(sessionDates[i - 1]);
        const currDate = new Date(sessionDates[i]);
        const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / 86400000);

        if (diffDays === 1) {
          streak++;
        } else {
          break;
        }
      }
    }

    setStats({ booksRead, pagesRead, currentStreak: streak, totalMinutes });

    // Check for new achievements to award
    await checkAndAwardAchievements(
      userId,
      achievementsRes.data || [],
      userAchievementsRes.data || [],
      { booksRead, pagesRead, currentStreak: streak, totalMinutes }
    );

    setLoading(false);
  };

  const checkAndAwardAchievements = async (
    userId: string,
    allAchievements: Achievement[],
    earnedAchievements: UserAchievement[],
    currentStats: typeof stats
  ) => {
    const earnedIds = new Set(earnedAchievements.map((ua) => ua.achievement_id));
    const newlyEarned: Achievement[] = [];

    for (const achievement of allAchievements) {
      if (earnedIds.has(achievement.id)) continue;

      let earned = false;
      switch (achievement.requirement_type) {
        case "books_read":
          earned = currentStats.booksRead >= achievement.requirement_value;
          break;
        case "pages_read":
          earned = currentStats.pagesRead >= achievement.requirement_value;
          break;
        case "streak_days":
          earned = currentStats.currentStreak >= achievement.requirement_value;
          break;
        case "minutes_read":
          earned = currentStats.totalMinutes >= achievement.requirement_value;
          break;
      }

      if (earned) {
        newlyEarned.push(achievement);
      }
    }

    if (newlyEarned.length > 0) {
      // The insert path only backfills id/created_at, so earned_at has to be explicit —
      // the badge tooltip and the remote row both read it.
      const earnedAt = new Date().toISOString();
      const inserts = newlyEarned.map((achievement) => ({
        user_id: userId,
        achievement_id: achievement.id,
        earned_at: earnedAt,
      }));

      await supabase.from("user_achievements").insert(inserts);

      // An unlock is one of the few activities the app can publish the moment it happens.
      await supabase.from("activity_feed").insert(
        newlyEarned.map((achievement) => ({
          user_id: userId,
          activity_type: "achievement",
          activity_data: {
            achievement_id: achievement.id,
            name: achievement.name,
            points: achievement.points || 0,
          },
          is_public: true,
          created_at: earnedAt,
        }))
      );

      // Refresh user achievements
      const { data } = await supabase
        .from("user_achievements")
        .select("*")
        .eq("user_id", userId);
      if (data) setUserAchievements(data);
    }
  };

  const earnedIds = new Set(userAchievements.map((ua) => ua.achievement_id));
  const totalPoints = achievements
    .filter((a) => earnedIds.has(a.id))
    .reduce((sum, a) => sum + (a.points || 0), 0);

  const categories = [
    { id: "reading", label: "Reading", icon: Book },
    { id: "streak", label: "Streaks", icon: Flame },
    { id: "milestone", label: "Milestones", icon: Trophy },
    { id: "social", label: "Social", icon: Users },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Achievements</h1>
            <p className="text-muted-foreground">Track your reading milestones</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-primary">{totalPoints}</p>
                  <p className="text-sm text-muted-foreground">Total Points</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{userAchievements.length}</p>
                  <p className="text-sm text-muted-foreground">
                    of {achievements.length} Earned
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-orange-500">{stats.currentStreak}</p>
                  <p className="text-sm text-muted-foreground">Day Streak</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-blue-500">{stats.booksRead}</p>
                  <p className="text-sm text-muted-foreground">Books Read</p>
                </CardContent>
              </Card>
            </div>

            {/* Progress bar */}
            <Card className="mb-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Overall Progress</CardTitle>
                <CardDescription>
                  {userAchievements.length} of {achievements.length} achievements unlocked
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress
                  value={(userAchievements.length / Math.max(achievements.length, 1)) * 100}
                  className="h-3"
                />
              </CardContent>
            </Card>

            {/* Achievements by category */}
            <Tabs defaultValue="reading">
              <TabsList className="mb-6">
                {categories.map((cat) => (
                  <TabsTrigger key={cat.id} value={cat.id} className="gap-2">
                    <cat.icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{cat.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map((cat) => (
                <TabsContent key={cat.id} value={cat.id}>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                    {achievements
                      .filter((a) => a.category === cat.id)
                      .map((achievement) => {
                        const userAchievement = userAchievements.find(
                          (ua) => ua.achievement_id === achievement.id
                        );
                        return (
                          <div key={achievement.id} className="flex flex-col items-center gap-2">
                            <AchievementBadge
                              achievement={achievement}
                              earned={!!userAchievement}
                              earnedAt={userAchievement?.earned_at}
                              size="lg"
                            />
                            <p className="text-xs text-center font-medium truncate w-full">
                              {achievement.is_secret && !userAchievement ? "???" : achievement.name}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
};

export default Achievements;
