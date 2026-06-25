import { useState, useEffect } from "react";
import { BookOpen, LogOut, MessageSquare, BarChart3, Settings, Home, Crown, List, Trophy, Tv, Sparkles } from "lucide-react";
import { Logo } from "./Logo";
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
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { MobileNavDrawer } from "./MobileNavDrawer";

interface NavigationProps {
  userEmail?: string;
}

export const Navigation = ({ userEmail }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isSubscribed } = useSubscription();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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
      toast({ variant: "destructive", title: "Error", description: "Failed to sign out" });
    } else {
      toast({ title: "Signed out", description: "You've been signed out successfully" });
      navigate("/auth");
    }
  };

  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user || null);
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setCurrentUser(session?.user || null);
      }
    );
    
    return () => subscription.unsubscribe();
  }, []);

  const activeEmail = userEmail || currentUser?.email;
  const isGuest = !activeEmail;

  const userInitial = username?.charAt(0).toUpperCase() || activeEmail?.charAt(0).toUpperCase() || "U";
  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50 safe-area-inset-top">
        <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
          <div className="flex items-center justify-between">
            {/* Left: hamburger + logo */}
            <div className="flex items-center gap-1 sm:gap-2">
              <MobileNavDrawer userEmail={activeEmail || undefined} username={username} avatarUrl={avatarUrl} />
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-2 hover:opacity-80 active:opacity-70 transition-opacity"
              >
                <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 gradient-warm rounded-lg shadow-md text-white">
                  <Logo size={20} className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <span className="text-lg sm:text-xl font-bold hidden sm:block">ComicCloud</span>
              </button>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {isGuest ? (
                <>
                  <Button
                    variant={isActive("/public") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => navigate("/public")}
                    className="gap-1.5 px-2.5"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Public Library</span>
                  </Button>
                  <Button
                    variant={isActive("/manga") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => navigate("/manga")}
                    className="gap-1.5 px-2.5"
                  >
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <span>Manga & Manhwa</span>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => navigate("/auth")}
                    className="ml-2 bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-md"
                  >
                    Sign In
                  </Button>
                </>
              ) : (
                <>
                  {[
                    { path: "/", icon: Home, label: "Library" },
                    { path: "/public", icon: BookOpen, label: "Browse" },
                    { path: "/lists", icon: List, label: "Lists" },
                    { path: "/challenges", icon: Trophy, label: "Goals" },
                    { path: "/statistics", icon: BarChart3, label: "Stats" },
                  ].map(item => (
                    <Button
                      key={item.path}
                      variant={isActive(item.path) ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => navigate(item.path)}
                      className="gap-1.5 px-2.5"
                    >
                      <item.icon className="w-4 h-4" />
                      <span className="hidden lg:inline">{item.label}</span>
                    </Button>
                  ))}

                  <Button
                    variant={isActive("/chat") ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => navigate("/chat")}
                    className="gap-1.5 px-2.5"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="hidden lg:inline">Chat</span>
                    {!isSubscribed && <Crown className="w-3 h-3 text-amber-500 ml-0.5" />}
                  </Button>

                  {/* Profile dropdown - simplified */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-1">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={avatarUrl || undefined} />
                          <AvatarFallback className="gradient-warm text-white text-sm">
                            {userInitial}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel>
                        <p className="text-sm font-medium">{username || "My Account"}</p>
                        <p className="text-xs text-muted-foreground truncate">{activeEmail}</p>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/journal")}>Journal</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/quotes")}>Quotes</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/vocabulary")}>Vocabulary</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/clubs")}>Book Clubs</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/feed")}>Activity Feed</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/discover")}>Discover</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/achievements")}>Achievements</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/year-in-review")}>Year in Review</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/bookshelf")}>3D Bookshelf</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/manga")}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Manga & Manhwa
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/seanime")}>
                        <Tv className="mr-2 h-4 w-4" />
                        Seanime Stream
                        {!isSubscribed && <Crown className="ml-auto h-3 w-3 text-amber-500" />}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/settings")}>Settings</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/pricing")}>
                        <Crown className="mr-2 h-3 w-3 text-amber-500" />
                        {isSubscribed ? "Your Plan" : "Upgrade"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            {/* Mobile: avatar dropdown */}
            <div className="md:hidden">
              {isGuest ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate("/auth")}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-md"
                >
                  Sign In
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={avatarUrl || undefined} />
                        <AvatarFallback className="gradient-warm text-white text-sm">
                          {userInitial}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>
                      <p className="text-sm font-medium">{username || "My Account"}</p>
                      <p className="text-xs text-muted-foreground truncate">{activeEmail}</p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate("/manga")} className="py-3">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Manga & Manhwa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/seanime")} className="py-3">
                      <Tv className="mr-2 h-4 w-4" />
                      Seanime Stream
                      {!isSubscribed && <Crown className="ml-auto h-3 w-3 text-amber-500" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="py-3">Settings</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive py-3">
                      <LogOut className="mr-2 h-4 w-4" />Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};
