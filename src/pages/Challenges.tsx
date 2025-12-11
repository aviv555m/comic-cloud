import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReadingChallengeCard } from "@/components/ReadingChallengeCard";
import { CreateChallengeDialog } from "@/components/CreateChallengeDialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trophy, Target, ArrowLeft } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface ReadingChallenge {
  id: string;
  name: string;
  goal_type: string;
  goal_value: number;
  current_value: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_completed: boolean;
}

const Challenges = () => {
  const [user, setUser] = useState<User | null>(null);
  const [challenges, setChallenges] = useState<ReadingChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchChallenges(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchChallenges = async (userId: string) => {
    setLoading(true);

    // Get challenges
    const { data: challengesData } = await supabase
      .from("reading_challenges")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (challengesData) {
      // Calculate current values based on goal type
      const { data: books } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", userId);

      const { data: sessions } = await supabase
        .from("reading_sessions")
        .select("*")
        .eq("user_id", userId);

      const updatedChallenges = challengesData.map((challenge) => {
        let currentValue = 0;
        const startDate = new Date(challenge.start_date);
        const endDate = new Date(challenge.end_date);

        switch (challenge.goal_type) {
          case "books":
            currentValue = books?.filter(
              (b) =>
                b.is_completed &&
                new Date(b.updated_at) >= startDate &&
                new Date(b.updated_at) <= endDate
            ).length || 0;
            break;
          case "pages":
            currentValue = sessions
              ?.filter(
                (s) =>
                  new Date(s.start_time) >= startDate &&
                  new Date(s.start_time) <= endDate
              )
              .reduce((sum, s) => sum + (s.pages_read || 0), 0) || 0;
            break;
          case "minutes":
            currentValue = sessions
              ?.filter(
                (s) =>
                  new Date(s.start_time) >= startDate &&
                  new Date(s.start_time) <= endDate
              )
              .reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;
            break;
          case "streak":
            // Calculate streak within date range
            const datesInRange = sessions
              ?.filter(
                (s) =>
                  new Date(s.start_time) >= startDate &&
                  new Date(s.start_time) <= endDate
              )
              .map((s) => new Date(s.start_time).toDateString())
              .filter((d, i, self) => self.indexOf(d) === i);
            currentValue = datesInRange?.length || 0;
            break;
        }

        return {
          ...challenge,
          current_value: currentValue,
          is_completed: currentValue >= challenge.goal_value,
        };
      });

      setChallenges(updatedChallenges);
    }

    setLoading(false);
  };

  const deleteChallenge = async (id: string) => {
    const { error } = await supabase
      .from("reading_challenges")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete challenge" });
      return;
    }

    toast({ title: "Challenge deleted" });
    setChallenges(challenges.filter((c) => c.id !== id));
  };

  const activeChallenges = challenges.filter(
    (c) => !c.is_completed && new Date(c.end_date) >= new Date()
  );
  const completedChallenges = challenges.filter((c) => c.is_completed);
  const expiredChallenges = challenges.filter(
    (c) => !c.is_completed && new Date(c.end_date) < new Date()
  );

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
              <h1 className="text-2xl font-bold">Reading Challenges</h1>
              <p className="text-muted-foreground">Set goals and track your progress</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Challenge
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Target className="w-12 h-12 animate-pulse text-muted-foreground" />
          </div>
        ) : challenges.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center py-12">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No challenges yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first reading challenge to stay motivated
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Challenge
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="active" className="space-y-6">
            <TabsList>
              <TabsTrigger value="active">
                Active ({activeChallenges.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed ({completedChallenges.length})
              </TabsTrigger>
              {expiredChallenges.length > 0 && (
                <TabsTrigger value="expired">
                  Expired ({expiredChallenges.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {activeChallenges.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No active challenges. Create one to get started!
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeChallenges.map((challenge) => (
                    <ReadingChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onDelete={deleteChallenge}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedChallenges.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No completed challenges yet. Keep reading!
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {completedChallenges.map((challenge) => (
                    <ReadingChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onDelete={deleteChallenge}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {expiredChallenges.length > 0 && (
              <TabsContent value="expired" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {expiredChallenges.map((challenge) => (
                    <ReadingChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      onDelete={deleteChallenge}
                    />
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>

      <CreateChallengeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={user.id}
        onCreated={() => user && fetchChallenges(user.id)}
      />
    </div>
  );
};

export default Challenges;
