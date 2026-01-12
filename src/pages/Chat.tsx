import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Navigation } from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useChatMessages } from "@/hooks/useChatMessages";

const Chat = () => {
  const navigate = useNavigate();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscription();
  const [userEmail, setUserEmail] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [input, setInput] = useState("");
  
  const { messages, isLoading, sendMessage, clearMessages, scrollRef, scrollToBottom } = useChatMessages(userId);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUserEmail(user.email);
      setUserId(user.id);
    };
    fetchUser();
  }, [navigate]);

  useEffect(() => {
    if (!subscriptionLoading && !isSubscribed) {
      navigate("/pricing");
    }
  }, [isSubscribed, subscriptionLoading, navigate]);

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput("");
    }
  };

  if (subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation userEmail={userEmail} />
      
      <div className="flex-1 container mx-auto max-w-4xl px-3 sm:px-4 py-4 sm:py-6 flex flex-col min-h-0">
        {/* Header - more compact on mobile */}
        <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full gradient-warm flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate">Book Chat</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Ask about books, get recommendations</p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearMessages} className="gap-1.5 shrink-0 h-9">
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>

        {/* Chat area - fills remaining space */}
        <div className="flex-1 border rounded-lg bg-card flex flex-col min-h-0 overflow-hidden">
          <ScrollArea className="flex-1 p-3 sm:p-4" ref={scrollRef}>
            <div className="space-y-3 sm:space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8 sm:py-12">
                  <MessageSquare className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                  <p className="mb-1.5 sm:mb-2 font-medium text-base sm:text-lg">Ask me anything about books!</p>
                  <p className="text-sm">I can help with recommendations, summaries, and discussions.</p>
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[80%] rounded-lg px-3 sm:px-4 py-2 sm:py-3 ${
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
                  <div className="bg-muted rounded-lg px-3 sm:px-4 py-2 sm:py-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input area - taller touch targets on mobile */}
          <div className="p-3 sm:p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Ask about books..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={isLoading}
                className="flex-1 h-11 sm:h-10 text-base sm:text-sm"
              />
              <Button 
                onClick={handleSend} 
                disabled={isLoading || !input.trim()}
                className="h-11 sm:h-10 px-4"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
