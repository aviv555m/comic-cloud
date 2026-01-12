import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare, X, Send, Loader2, Crown, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useChatMessages } from "@/hooks/useChatMessages";
import { cn } from "@/lib/utils";

export const FloatingChatBubble = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isSubscribed } = useSubscription();
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string>();
  const [input, setInput] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { messages, isLoading, sendMessage, scrollRef, scrollToBottom } = useChatMessages(userId);

  // Hide on certain pages
  const hiddenPaths = ["/auth", "/chat", "/reader"];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path));

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (shouldHide || !isAuthenticated) return null;

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput("");
    }
  };

  const handleBubbleClick = () => {
    if (!isSubscribed) {
      navigate("/pricing");
      return;
    }
    setIsOpen(true);
  };

  return (
    <>
      {/* Floating bubble */}
      {!isOpen && (
        <button
          onClick={handleBubbleClick}
          className={cn(
            "fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-lg",
            "gradient-warm flex items-center justify-center",
            "hover:scale-110 active:scale-95 transition-transform duration-200",
            "animate-in fade-in slide-in-from-bottom-4"
          )}
          aria-label="Open chat"
        >
          <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          {!isSubscribed && (
            <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-amber-500 rounded-full flex items-center justify-center">
              <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
            </div>
          )}
        </button>
      )}

      {/* Chat popup - fullscreen on mobile, popup on desktop */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 bg-card border shadow-2xl flex flex-col overflow-hidden",
            "animate-in fade-in duration-200",
            // Mobile: fullscreen
            "inset-0 rounded-none",
            // Desktop: popup in corner
            "sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[360px] sm:h-[480px] sm:rounded-xl sm:slide-in-from-bottom-4"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 safe-area-inset-top">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full gradient-warm flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium text-sm">Book Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 sm:h-8 sm:w-8"
                onClick={() => {
                  setIsOpen(false);
                  navigate("/chat");
                }}
                title="Open full chat"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 sm:h-8 sm:w-8"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3 sm:p-3" ref={scrollRef}>
            <div className="space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8 sm:py-8">
                  <MessageSquare className="w-10 h-10 sm:w-8 sm:h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-base sm:text-sm mb-1">Ask me about books!</p>
                  <p className="text-sm sm:text-xs">Recommendations, summaries & more</p>
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-base sm:text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input - with safe area for mobile */}
          <div className="p-3 border-t safe-area-inset-bottom">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about books..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={isLoading}
                className="h-11 sm:h-9 text-base sm:text-sm"
              />
              <Button 
                size="sm" 
                onClick={handleSend} 
                disabled={isLoading || !input.trim()} 
                className="h-11 sm:h-9 px-4 sm:px-3"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
