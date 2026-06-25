import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WifiOff, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const OfflineAlertOverlay = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  const path = location.pathname;
  // Offline-friendly paths: Library, Reader, Auth, Settings
  const isOfflineFriendly = 
    path === "/" || 
    path === "/settings" || 
    path === "/auth" || 
    path.startsWith("/reader/");

  if (isOfflineFriendly) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-background/85 backdrop-blur-md">
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-2xl border border-border bg-card/60 shadow-2xl relative overflow-hidden">
        {/* Decorative glowing gradient backdrop */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex p-4 bg-amber-500/10 rounded-full text-amber-500 border border-amber-500/20 animate-pulse">
          <WifiOff className="w-12 h-12" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">No Internet Connection</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You are currently offline. Pages like search, streaming, and clubs require an active internet connection.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
          💡 You can still read books or manga that you have downloaded to this device!
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button 
            className="flex-1 gap-2 h-11"
            onClick={() => navigate("/")}
          >
            <Home className="w-4 h-4" />
            Go to Downloads
          </Button>
          <Button 
            variant="outline" 
            className="gap-2 h-11"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
};
