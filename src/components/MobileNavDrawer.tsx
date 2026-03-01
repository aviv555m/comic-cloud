import { useState } from "react";
import { Menu, Home, BookOpen, List, Trophy, MessageSquare, Crown, BarChart3, Settings, LogOut, Award, BookMarked, Users, Sparkles, Bell, PenLine, Quote, Activity, BookCopy, Compass } from "lucide-react";
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

const navSections = [
  {
    label: "Main",
    items: [
      { path: "/", label: "Library", icon: Home },
      { path: "/public", label: "Browse", icon: BookOpen },
      { path: "/lists", label: "Lists", icon: List },
      { path: "/challenges", label: "Goals", icon: Trophy },
      { path: "/statistics", label: "Stats", icon: BarChart3 },
    ],
  },
  {
    label: "Reading",
    items: [
      { path: "/journal", label: "Journal", icon: PenLine },
      { path: "/quotes", label: "Quotes", icon: Quote },
      { path: "/vocabulary", label: "Vocabulary", icon: BookMarked },
      { path: "/reminders", label: "Reminders", icon: Bell },
    ],
  },
  {
    label: "Social",
    items: [
      { path: "/clubs", label: "Book Clubs", icon: Users },
      { path: "/feed", label: "Activity", icon: Activity },
      { path: "/discover", label: "Discover", icon: Compass },
    ],
  },
  {
    label: "Extras",
    items: [
      { path: "/achievements", label: "Achievements", icon: Award },
      { path: "/year-in-review", label: "Year in Review", icon: Sparkles },
      { path: "/bookshelf", label: "3D Bookshelf", icon: BookCopy },
    ],
  },
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
      toast({ variant: "destructive", title: "Error", description: "Failed to sign out" });
    } else {
      toast({ title: "Signed out", description: "You've been signed out successfully" });
      navigate("/auth");
    }
    setOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 -ml-1">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[80vw] max-w-[300px] p-0">
        <SheetHeader className="p-4 pb-2 border-b">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 gradient-warm rounded-lg">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-base">Bookshelf</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-[calc(100%-56px)]">
          {/* User info */}
          <div className="px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full gradient-warm flex items-center justify-center text-white font-medium">
                  {(username || userEmail || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate text-sm">{username || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </div>
            </div>
          </div>

          {/* Grouped navigation */}
          <nav className="flex-1 overflow-y-auto py-2">
            {navSections.map((section, sIdx) => (
              <div key={section.label}>
                {sIdx > 0 && <Separator className="my-1.5" />}
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
                {section.items.map(item => (
                  <button
                    key={item.path}
                    onClick={() => handleNavigation(item.path)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive(item.path)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted active:bg-muted"
                    }`}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))}
              </div>
            ))}

            <Separator className="my-1.5" />

            {/* Chat with premium badge */}
            <button
              onClick={() => handleNavigation("/chat")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                isActive("/chat") ? "bg-primary text-primary-foreground" : "hover:bg-muted active:bg-muted"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="text-sm">AI Chat</span>
              {!isSubscribed && <Crown className="w-3.5 h-3.5 text-amber-500 ml-auto" />}
            </button>

            <button
              onClick={() => handleNavigation("/pricing")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted active:bg-muted transition-colors"
            >
              <Crown className="w-4 h-4 shrink-0 text-amber-500" />
              <span className="text-sm">{isSubscribed ? "Your Plan" : "Upgrade"}</span>
            </button>

            <button
              onClick={() => handleNavigation("/settings")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                isActive("/settings") ? "bg-primary text-primary-foreground" : "hover:bg-muted active:bg-muted"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="text-sm">Settings</span>
            </button>
          </nav>

          {/* Sign out */}
          <div className="p-2 border-t">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="text-sm">Sign out</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
