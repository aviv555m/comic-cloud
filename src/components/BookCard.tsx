import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Globe, Lock, CheckCircle2, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

interface BookCardProps {
  id: string;
  title: string;
  author?: string;
  series?: string;
  coverUrl?: string;
  fileUrl?: string;
  fileType: string;
  isPublic: boolean;
  isCompleted?: boolean;
  readingProgress?: number;
  lastPageRead?: number;
  canEdit?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  onCoverGenerated?: () => void;
}

export const BookCard = ({
  id,
  title,
  author,
  series,
  coverUrl,
  fileType,
  isPublic,
  isCompleted = false,
  readingProgress = 0,
  onClick,
  onLongPress,
}: BookCardProps) => {
  const { isBookOffline } = useOfflineBooks();
  const isOffline = isBookOffline(id);
  const [resolvedCover, setResolvedCover] = useState<string | undefined>(undefined);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressActiveRef = useRef(false);
  const startCoordsRef = useRef({ x: 0, y: 0 });
  const wasDraggedRef = useRef(false);

  useEffect(() => {
    if (!coverUrl) {
      setResolvedCover(undefined);
      return;
    }
    
    if (coverUrl.startsWith("data:")) {
      setResolvedCover(coverUrl);
      return;
    }
    
    const isNative = Capacitor.isNativePlatform();
    const isProdOrNative = isNative || !import.meta.env.DEV;
    
    if (isProdOrNative && coverUrl.startsWith("/api-image-proxy?url=")) {
      const targetUrl = decodeURIComponent(coverUrl.split("/api-image-proxy?url=")[1]);
      
      let active = true;
      const fetchCover = async () => {
        try {
          const { data, error } = await supabase.functions.invoke("public-library-proxy", {
            body: { url: targetUrl, responseType: "text" },
          });
          if (active && !error && data?.success && data.data) {
            setResolvedCover(`data:image/jpeg;base64,${data.data}`);
          }
        } catch (e) {
          console.warn("Failed to load native cover via edge proxy:", e);
        }
      };
      
      fetchCover();
      return () => {
        active = false;
      };
    } else {
      setResolvedCover(coverUrl);
    }
  }, [coverUrl]);

  const handlePressStart = (e: React.TouchEvent | React.MouseEvent) => {
    // Avoid mouse emulation triggers on touch devices
    if (e.type === 'mousedown' && 'ontouchstart' in window) return;
    
    if (e.type === 'touchstart') {
      const touch = (e as React.TouchEvent).touches[0];
      startCoordsRef.current = { x: touch.clientX, y: touch.clientY };
    }
    
    wasDraggedRef.current = false;
    longPressActiveRef.current = false;
    touchTimeoutRef.current = setTimeout(() => {
      if (onLongPress) {
        onLongPress();
        longPressActiveRef.current = true;
        if (navigator.vibrate) {
          try {
            navigator.vibrate(40);
          } catch (err) {}
        }
      }
    }, 600); // 600ms hold
  };

  const handlePressEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (e.type === 'mouseup' && 'ontouchstart' in window) return;
    
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
    
    if (longPressActiveRef.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressActiveRef.current = false;
      return;
    }
    
    // Ignore clicks if the user dragged/scrolled their finger during touch
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false;
      return;
    }
    
    if (onClick) {
      onClick();
    }
  };

  const handlePressCancel = () => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - startCoordsRef.current.x;
    const dy = touch.clientY - startCoordsRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Only cancel hold if user actually scrolled/dragged their finger (distance > 10px)
    if (distance > 10) {
      wasDraggedRef.current = true;
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
        touchTimeoutRef.current = null;
      }
    }
  };

  return (
    <Card
      className={cn(
        "group cursor-pointer overflow-hidden border-0 transition-smooth hover:shadow-lg hover:-translate-y-1 select-none active:scale-[0.98]",
        "glass-card"
      )}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent' }}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressCancel}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[2/3] bg-gradient-to-br from-muted to-secondary/50">
          {resolvedCover ? (
            <img
              src={resolvedCover}
              alt={title}
              className={cn(
                "w-full h-full object-cover",
                isCompleted && "opacity-60"
              )}
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full gap-3">
              <BookOpen className="w-16 h-16 text-muted-foreground/40" />
            </div>
          )}
          
          {/* Progress bar */}
          {readingProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${readingProgress}%` }}
              />
            </div>
          )}

          {/* Status badges */}
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {isOffline && (
              <Badge variant="secondary" className="bg-green-500/90 text-white border-0 text-xs">
                <CloudOff className="w-3 h-3" />
              </Badge>
            )}
            {isPublic ? (
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-xs">
                <Globe className="w-3 h-3" />
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-xs">
                <Lock className="w-3 h-3" />
              </Badge>
            )}
          </div>

          {/* Completion badge */}
          {isCompleted && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="bg-green-500/90 backdrop-blur-sm rounded-full p-3">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
            </div>
          )}

          {/* File type badge */}
          <Badge 
            variant="secondary" 
            className="absolute top-2 left-2 bg-black/50 text-white border-0 text-xs uppercase"
          >
            {fileType}
          </Badge>

          {/* Title and author overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-t from-black/80 to-transparent">
            {isCompleted && (
              <Badge className="bg-green-500 mb-2 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Completed
              </Badge>
            )}
            <h3 className="font-semibold text-white line-clamp-2 mb-1 text-sm md:text-base">{title}</h3>
            {author && (
              <p className="text-xs md:text-sm text-white/80 line-clamp-1">{author}</p>
            )}
            {series && (
              <p className="text-xs text-white/60 line-clamp-1 mt-1">{series}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
