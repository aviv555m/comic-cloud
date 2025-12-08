import { useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseReadingSessionProps {
  bookId: string | undefined;
  currentPage: number;
  initialPage: number;
}

export const useReadingSession = ({ bookId, currentPage, initialPage }: UseReadingSessionProps) => {
  const sessionId = useRef<string | null>(null);
  const sessionStartTime = useRef<Date>(new Date());
  const startPage = useRef<number>(initialPage);
  const isActive = useRef<boolean>(false);
  const lastUpdateTime = useRef<Date>(new Date());

  const startSession = useCallback(async () => {
    if (!bookId || isActive.current) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("reading_sessions")
        .insert({
          book_id: bookId,
          user_id: user.id,
          start_time: new Date().toISOString(),
          pages_read: 0,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to start reading session:", error);
        return;
      }

      if (data) {
        sessionId.current = data.id;
        sessionStartTime.current = new Date();
        startPage.current = currentPage;
        lastUpdateTime.current = new Date();
        isActive.current = true;
      }
    } catch (error) {
      console.error("Error starting reading session:", error);
    }
  }, [bookId, currentPage]);

  const updateSession = useCallback(async () => {
    if (!sessionId.current || !isActive.current) return;

    const now = new Date();
    const durationMinutes = Math.max(1, Math.round(
      (now.getTime() - sessionStartTime.current.getTime()) / 60000
    ));
    const pagesRead = Math.abs(currentPage - startPage.current);

    try {
      await supabase
        .from("reading_sessions")
        .update({
          end_time: now.toISOString(),
          duration_minutes: durationMinutes,
          pages_read: pagesRead,
        })
        .eq("id", sessionId.current);
      
      lastUpdateTime.current = now;
    } catch (error) {
      console.error("Error updating reading session:", error);
    }
  }, [currentPage]);

  const endSession = useCallback(async () => {
    if (!sessionId.current || !isActive.current) return;

    const now = new Date();
    const durationMinutes = Math.max(1, Math.round(
      (now.getTime() - sessionStartTime.current.getTime()) / 60000
    ));
    const pagesRead = Math.abs(currentPage - startPage.current);

    try {
      await supabase
        .from("reading_sessions")
        .update({
          end_time: now.toISOString(),
          duration_minutes: durationMinutes,
          pages_read: Math.max(pagesRead, 1),
        })
        .eq("id", sessionId.current);

      sessionId.current = null;
      isActive.current = false;
    } catch (error) {
      console.error("Error ending reading session:", error);
    }
  }, [currentPage]);

  // Periodic updates every 30 seconds to ensure we capture reading time
  useEffect(() => {
    if (!isActive.current) return;

    const interval = setInterval(() => {
      updateSession();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [updateSession]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updateSession();
      }
    };

    const handleBeforeUnload = () => {
      endSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [updateSession, endSession]);

  return {
    startSession,
    endSession,
    updateSession,
    isActive: isActive.current,
  };
};
