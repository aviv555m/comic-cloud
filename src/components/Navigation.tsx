import { useState, useEffect } from "react";
import { BookOpen, LogOut, MessageSquare, BarChart3, Settings, Home, Crown, List, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookChatDialog } from "./BookChatDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { toast as sonnerToast } from "sonner";

interface NavigationProps {
  userEmail?: string;
}

export const Navigation = ({ userEmail }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isSubscribed } = useSubscription();
  const [chatOpen, setChatOpen] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  const handleChatClick = () => {
    if (!isSubscribed) {
      sonnerToast.error("Premium feature", {
        description: "AI Chat requires a Premium subscription",
        action: {
          label: "Upgrade",
          onClick: () => navigate("/pricing"),
        },
      });
      return;
    }
    setChatOpen(true);
  };

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        
        // Fetch profile for avatar
        const { data: profile } = await supabase
          .from("profiles")
          .select("avatar_url, username")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          setAvatarUrl(profile.avatar_url);
          setUsername(profile.username);
        }
      }
    };
    fetchUserData();
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to sign out",
      });
    } else {
      toast({
        title: "Signed out",
        description: "You've been signed out successfully",
      });
      navigate("/auth");
    }
  };

  const userInitial = username?.charAt(0).toUpperCase() || userEmail?.charAt(0).toUpperCase() || "U";
  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center justify-center w-10 h-10 gradient-warm rounded-lg shadow-md">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold hidden sm:block">Bookshelf</span>
            </button>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant={isActive("/") ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate("/")}
                className="gap-1.5 px-2 sm:px-3"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Library</span>
              </Button>

              <Button
                variant={isActive("/public") ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate("/public")}
                className="gap-1.5 px-2 sm:px-3"
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Browse</span>
              </Button>

              <Button
                variant={isActive("/lists") ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate("/lists")}
                className="gap-1.5 px-2 sm:px-3"
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Lists</span>
              </Button>

              <Button
                variant={isActive("/challenges") ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate("/challenges")}
                className="gap-1.5 px-2 sm:px-3"
              >
                <Trophy className="w-4 h-4" />
                <span className="hidden sm:inline">Goals</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleChatClick}
                className="gap-1.5 px-2 sm:px-3"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Chat</span>
                {!isSubscribed && <Crown className="w-3 h-3 text-amber-500 ml-0.5" />}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={avatarUrl || undefined} />
                      <AvatarFallback className="gradient-warm text-white text-sm">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{username || "My Account"}</p>
                      <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/lists")}>
                    <List className="mr-2 h-4 w-4" />
                    Reading Lists
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/challenges")}>
                    <Trophy className="mr-2 h-4 w-4" />
                    Challenges
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/statistics")}>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Reading Stats
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/pricing")}>
                    <Crown className="mr-2 h-4 w-4 text-amber-500" />
                    {isSubscribed ? "Your Plan" : "Upgrade to Premium"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>
      
      <BookChatDialog 
        open={chatOpen} 
        onOpenChange={setChatOpen}
        userId={userId}
      />
    </>
  );
};
