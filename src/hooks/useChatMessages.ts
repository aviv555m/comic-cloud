import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const useChatMessages = (userId?: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Fetch enhanced context: books, reading stats, and annotations
      let userBooks = [];
      let readingStats = null;
      let recentAnnotations = [];
      
      if (userId) {
        const { data: booksData } = await supabase
          .from("books")
          .select("title, author, series, reading_progress, is_completed")
          .eq("user_id", userId);
        userBooks = booksData || [];

        // Get reading statistics
        const { data: sessions } = await supabase
          .from("reading_sessions")
          .select("duration_minutes, pages_read")
          .eq("user_id", userId);
        
        if (sessions) {
          const totalTime = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
          const totalPages = sessions.reduce((sum, s) => sum + (s.pages_read || 0), 0);
          readingStats = { totalTime, totalPages, sessionCount: sessions.length };
        }

        // Get recent annotations
        const { data: annotationsData } = await supabase
          .from("annotations")
          .select("selected_text, note, book_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5);
        recentAnnotations = annotationsData || [];
      }

      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/book-chat`;
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          messages: [...messages, userMessage],
          userBooks,
          readingStats,
          recentAnnotations
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          toast({
            variant: "destructive",
            title: "Rate limit exceeded",
            description: "Please try again in a moment.",
          });
          setMessages(prev => prev.slice(0, -1));
          setIsLoading(false);
          return;
        }
        if (response.status === 402) {
          toast({
            variant: "destructive",
            title: "Credits exhausted",
            description: "Please add more credits to continue.",
          });
          setMessages(prev => prev.slice(0, -1));
          setIsLoading(false);
          return;
        }
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantMessage = "";
      
      // Add empty assistant message that we'll update
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantMessage += content;
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1] = {
                  role: "assistant",
                  content: assistantMessage
                };
                return newMessages;
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, userId, toast]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    scrollRef,
    scrollToBottom,
  };
};
