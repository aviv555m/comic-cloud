import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Users, 
  BookOpen,
  MessageSquare,
  Settings,
  Copy,
  Loader2,
  Send
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface BookClub {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_public: boolean | null;
  invite_code: string | null;
}

interface ClubMember {
  id: string;
  user_id: string;
  role: string | null;
  joined_at: string;
  username?: string;
}

interface Discussion {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  page_reference: number | null;
  username?: string;
}

const ClubDetail = () => {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [club, setClub] = useState<BookClub | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchClubData();
      } else {
        navigate("/auth");
      }
    });
  }, [clubId, navigate]);

  const fetchClubData = async () => {
    if (!clubId) return;
    setLoading(true);

    // Fetch club details
    const { data: clubData } = await supabase
      .from("book_clubs")
      .select("*")
      .eq("id", clubId)
      .single();

    if (clubData) {
      setClub(clubData);

      // Fetch members
      const { data: membersData } = await supabase
        .from("book_club_members")
        .select("*")
        .eq("club_id", clubId);

      if (membersData) {
        // Fetch usernames for members
        const userIds = membersData.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        const membersWithNames = membersData.map((m) => ({
          ...m,
          username: profiles?.find((p) => p.id === m.user_id)?.username || "Anonymous",
        }));
        setMembers(membersWithNames);
      }

      // Fetch discussions
      const { data: discussionsData } = await supabase
        .from("book_club_discussions")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: true });

      if (discussionsData) {
        const userIds = [...new Set(discussionsData.map((d) => d.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        const discussionsWithNames = discussionsData.map((d) => ({
          ...d,
          username: profiles?.find((p) => p.id === d.user_id)?.username || "Anonymous",
        }));
        setDiscussions(discussionsWithNames);
      }
    }

    setLoading(false);
  };

  const sendMessage = async () => {
    if (!user || !club || !newMessage.trim()) return;

    setSending(true);
    const { data, error } = await supabase
      .from("book_club_discussions")
      .insert({
        club_id: club.id,
        user_id: user.id,
        content: newMessage,
      })
      .select()
      .single();

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to send message" });
    } else if (data) {
      // Get username for new message
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      setDiscussions([...discussions, { ...data, username: profile?.username || "You" }]);
      setNewMessage("");
    }
    setSending(false);
  };

  const copyInviteCode = () => {
    if (club?.invite_code) {
      navigator.clipboard.writeText(club.invite_code);
      toast({ title: "Copied!", description: "Invite code copied to clipboard" });
    }
  };

  const isOwner = user?.id === club?.owner_id;

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate("/clubs")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          {club && (
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{club.name}</h1>
              <p className="text-muted-foreground">{club.description}</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : club ? (
          <Tabs defaultValue="discussion" className="space-y-6">
            <TabsList>
              <TabsTrigger value="discussion" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Discussion
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-2">
                <Users className="w-4 h-4" />
                Members ({members.length})
              </TabsTrigger>
              {isOwner && (
                <TabsTrigger value="settings" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Settings
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="discussion">
              <Card className="h-[600px] flex flex-col">
                <CardHeader className="border-b">
                  <CardTitle className="text-lg">Club Discussion</CardTitle>
                  <CardDescription>Share thoughts about your current read</CardDescription>
                </CardHeader>
                <ScrollArea className="flex-1 p-4">
                  {discussions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {discussions.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${
                            msg.user_id === user.id ? "flex-row-reverse" : ""
                          }`}
                        >
                          <Avatar className="w-8 h-8">
                            <AvatarFallback>
                              {(msg.username || "A").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              msg.user_id === user.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-xs font-medium mb-1 opacity-70">
                              {msg.username}
                            </p>
                            <p className="text-sm">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <div className="border-t p-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    />
                    <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="members">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Club Members</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {(member.username || "A").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.username}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {new Date(member.joined_at || "").toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {member.role === "owner" && (
                          <Badge>Owner</Badge>
                        )}
                        {member.role === "admin" && (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {isOwner && (
              <TabsContent value="settings">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Club Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Invite Code</p>
                      <div className="flex gap-2">
                        <Input value={club.invite_code || ""} readOnly />
                        <Button variant="outline" onClick={copyInviteCode}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Share this code to invite people to your club
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <p className="text-center text-muted-foreground">Club not found</p>
        )}
      </main>
    </div>
  );
};

export default ClubDetail;
