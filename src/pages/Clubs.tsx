import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Users, 
  Plus, 
  Search,
  Loader2,
  Lock,
  Globe,
  UserPlus
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface BookClub {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  owner_id: string;
  is_public: boolean | null;
  invite_code: string | null;
  max_members: number | null;
  created_at: string;
  member_count?: number;
}

const Clubs = () => {
  const [user, setUser] = useState<User | null>(null);
  const [myClubs, setMyClubs] = useState<BookClub[]>([]);
  const [publicClubs, setPublicClubs] = useState<BookClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [newClub, setNewClub] = useState({ name: "", description: "", isPublic: false });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchClubs(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchClubs = async (userId: string) => {
    setLoading(true);

    // Fetch user's clubs (owned + member of)
    const { data: memberships } = await supabase
      .from("book_club_members")
      .select("club_id")
      .eq("user_id", userId);

    const memberClubIds = memberships?.map((m) => m.club_id) || [];

    const { data: ownedClubs } = await supabase
      .from("book_clubs")
      .select("*")
      .eq("owner_id", userId);

    const { data: joinedClubs } = memberClubIds.length > 0
      ? await supabase
          .from("book_clubs")
          .select("*")
          .in("id", memberClubIds)
          .neq("owner_id", userId)
      : { data: [] };

    setMyClubs([...(ownedClubs || []), ...(joinedClubs || [])]);

    // Fetch public clubs
    const { data: pubClubs } = await supabase
      .from("book_clubs")
      .select("*")
      .eq("is_public", true)
      .limit(20);

    setPublicClubs(pubClubs || []);
    setLoading(false);
  };

  const createClub = async () => {
    if (!user || !newClub.name.trim()) return;

    setCreating(true);
    const { data, error } = await supabase
      .from("book_clubs")
      .insert({
        name: newClub.name,
        description: newClub.description || null,
        owner_id: user.id,
        is_public: newClub.isPublic,
      })
      .select()
      .single();

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create club" });
    } else if (data) {
      // Add owner as member
      await supabase.from("book_club_members").insert({
        club_id: data.id,
        user_id: user.id,
        role: "owner",
      });

      toast({ title: "Club created!", description: `${data.name} is ready` });
      setMyClubs([data, ...myClubs]);
      setCreateOpen(false);
      setNewClub({ name: "", description: "", isPublic: false });
    }
    setCreating(false);
  };

  const joinClubByCode = async () => {
    if (!user || !joinCode.trim()) return;

    const { data: club, error } = await supabase
      .from("book_clubs")
      .select("*")
      .eq("invite_code", joinCode.trim())
      .single();

    if (error || !club) {
      toast({ variant: "destructive", title: "Invalid code", description: "Club not found" });
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("book_club_members")
      .select("id")
      .eq("club_id", club.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      toast({ title: "Already a member", description: "You're already in this club" });
      return;
    }

    const { error: joinError } = await supabase.from("book_club_members").insert({
      club_id: club.id,
      user_id: user.id,
      role: "member",
    });

    if (joinError) {
      toast({ variant: "destructive", title: "Error", description: "Failed to join club" });
    } else {
      toast({ title: "Joined!", description: `Welcome to ${club.name}` });
      setMyClubs([club, ...myClubs]);
      setJoinCode("");
    }
  };

  const joinPublicClub = async (club: BookClub) => {
    if (!user) return;

    const { error } = await supabase.from("book_club_members").insert({
      club_id: club.id,
      user_id: user.id,
      role: "member",
    });

    if (error) {
      if (error.code === "23505") {
        toast({ title: "Already a member" });
      } else {
        toast({ variant: "destructive", title: "Error", description: "Failed to join" });
      }
    } else {
      toast({ title: "Joined!", description: `Welcome to ${club.name}` });
      setMyClubs([club, ...myClubs]);
    }
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
              <h1 className="text-2xl font-bold">Book Clubs</h1>
              <p className="text-muted-foreground">Read together with friends</p>
            </div>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Club
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a Book Club</DialogTitle>
                <DialogDescription>
                  Start a reading group with friends or the community
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Club Name</Label>
                  <Input
                    placeholder="e.g., Sci-Fi Explorers"
                    value={newClub.name}
                    onChange={(e) => setNewClub({ ...newClub, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    placeholder="What's your club about?"
                    value={newClub.description}
                    onChange={(e) => setNewClub({ ...newClub, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="public"
                    checked={newClub.isPublic}
                    onChange={(e) => setNewClub({ ...newClub, isPublic: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="public" className="cursor-pointer">
                    Make this club public (anyone can join)
                  </Label>
                </div>
                <Button onClick={createClub} disabled={creating || !newClub.name.trim()} className="w-full">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create Club
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="my-clubs" className="space-y-6">
            <TabsList>
              <TabsTrigger value="my-clubs">My Clubs ({myClubs.length})</TabsTrigger>
              <TabsTrigger value="discover">Discover</TabsTrigger>
              <TabsTrigger value="join">Join by Code</TabsTrigger>
            </TabsList>

            <TabsContent value="my-clubs">
              {myClubs.length === 0 ? (
                <Card className="max-w-md mx-auto">
                  <CardContent className="text-center py-12">
                    <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No clubs yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Create a club or join one to read with others
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myClubs.map((club) => (
                    <Card
                      key={club.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/clubs/${club.id}`)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{club.name}</CardTitle>
                          {club.is_public ? (
                            <Globe className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Lock className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <CardDescription className="line-clamp-2">
                          {club.description || "No description"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>Up to {club.max_members || 50} members</span>
                        </div>
                        {club.owner_id === user.id && (
                          <Badge className="mt-2" variant="secondary">Owner</Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="discover">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {publicClubs.map((club) => (
                  <Card key={club.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{club.name}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {club.description || "No description"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={() => joinPublicClub(club)}
                        className="w-full"
                        disabled={myClubs.some((c) => c.id === club.id)}
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        {myClubs.some((c) => c.id === club.id) ? "Joined" : "Join Club"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                {publicClubs.length === 0 && (
                  <p className="text-muted-foreground col-span-full text-center py-8">
                    No public clubs available yet. Be the first to create one!
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="join">
              <Card className="max-w-md mx-auto">
                <CardHeader>
                  <CardTitle>Join with Invite Code</CardTitle>
                  <CardDescription>
                    Enter the invite code shared by a club member
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Enter invite code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                  <Button onClick={joinClubByCode} disabled={!joinCode.trim()} className="w-full">
                    Join Club
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Clubs;
