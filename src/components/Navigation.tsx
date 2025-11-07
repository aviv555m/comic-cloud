import { useState, useEffect } from "react";
import { BookOpen, LogOut, User, MessageSquare, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BookChatDialog } from "./BookChatDialog";

interface NavigationProps {
  userEmail?: string;
}

export const Navigation = ({ userEmail }: NavigationProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [chatOpen, setChatOpen] = useState(false);
  const [userId, setUserId] = useState<string>();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id);
    });
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

  const userInitial = userEmail?.charAt(0).toUpperCase() || "U";

  return (
    <>
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-10 h-10 gradient-warm rounded-lg shadow-md">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">Bookshelf</span>
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.href = '/public'}
              >
                Public Library
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.href = '/statistics'}
                className="gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Stats</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChatOpen(true)}
                className="gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Book Chat</span>
              </Button>

              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="gradient-warm text-white">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">My Account</p>
                    <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
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
