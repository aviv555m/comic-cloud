import { useState } from "react";
import { Menu, Home, BookOpen, List, Trophy, MessageSquare, Crown, BarChart3, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Separator } from "@/components/ui/separator";

interface MobileNavDrawerProps {
  userEmail?: string;
  username?: string | null;
  avatarUrl?: string | null;
}

const navItems = [
  { path: "/", label: "Library", icon: Home },
  { path: "/public", label: "Browse", icon: BookOpen },
  { path: "/lists", label: "Reading Lists", icon: List },
  { path: "/challenges", label: "Goals", icon: Trophy },
  { path: "/statistics", label: "Statistics", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export const MobileNavDrawer = ({ userEmail, username, avatarUrl }: MobileNavDrawerProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isSubscribed } = useSubscription();

  const handleNavigation = (path: string) => {
    navigate(path);
    setOpen(false);
  };

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
    setOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0">
        <SheetHeader className="p-4 pb-2 border-b">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 gradient-warm rounded-lg">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span>Bookshelf</span>
          </SheetTitle>
        </SheetHeader>
        
        <div className="flex flex-col h-[calc(100%-60px)]">
          {/* User info */}
          <div className="p-4 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full gradient-warm flex items-center justify-center text-white font-medium">
                  {(username || userEmail || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{username || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </div>
            </div>
          </div>

          {/* Navigation items */}
          <nav className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavigation(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isActive(item.path)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}
              
              {/* Chat item with premium badge */}
              <button
                onClick={() => handleNavigation("/chat")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isActive("/chat")
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                <MessageSquare className="w-5 h-5 shrink-0" />
                <span>AI Chat</span>
                {!isSubscribed && <Crown className="w-4 h-4 text-amber-500 ml-auto" />}
              </button>
            </div>
            
            <Separator className="my-3" />
            
            {/* Premium/Plan */}
            <button
              onClick={() => handleNavigation("/pricing")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted transition-colors"
            >
              <Crown className="w-5 h-5 shrink-0 text-amber-500" />
              <span>{isSubscribed ? "Your Plan" : "Upgrade to Premium"}</span>
            </button>
          </nav>

          {/* Sign out */}
          <div className="p-2 border-t">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};