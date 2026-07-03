import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Download, Sparkles } from "lucide-react";

interface UpdatePluginType {
  downloadAndInstall(options: { url: string }): Promise<{ success: boolean }>;
}
const UpdatePlugin = registerPlugin<UpdatePluginType>("UpdatePlugin");

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Library from "./pages/Library";
import Auth from "./pages/Auth";
import Reader from "./pages/Reader";
import PublicLibrary from "./pages/PublicLibrary";
import Series from "./pages/Series";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import Pricing from "./pages/Pricing";
import PaymentSuccess from "./pages/PaymentSuccess";
import ReadingLists from "./pages/ReadingLists";
import Challenges from "./pages/Challenges";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";
import Achievements from "./pages/Achievements";
import Vocabulary from "./pages/Vocabulary";
import Clubs from "./pages/Clubs";
import ClubDetail from "./pages/ClubDetail";
import { DownloadProgressOverlay } from "@/components/DownloadProgressOverlay";
import Discover from "./pages/Discover";
import Reminders from "./pages/Reminders";
import Journal from "./pages/Journal";
import Quotes from "./pages/Quotes";
import YearInReview from "./pages/YearInReview";
import Feed from "./pages/Feed";
import Bookshelf3D from "./pages/Bookshelf3D";
import SeanimeStream from "./pages/SeanimeStream";
import MangaBrowser from "./pages/MangaBrowser";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { useServiceWorker } from "./hooks/useServiceWorker";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { OfflineAlertOverlay } from "./components/OfflineAlertOverlay";
const queryClient = new QueryClient();

// Apply saved theme on load
const applyTheme = () => {
  try {
    const savedTheme = localStorage.getItem("theme") || "system";
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (savedTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      }
    }
    
    const fontSize = localStorage.getItem("fontSize") || "16";
    document.documentElement.style.setProperty("--font-size-root", `${fontSize}px`);
  } catch (e) {
    console.warn("Failed to apply theme or load preferences from localStorage:", e);
  }
};

const AppContent = () => {
  const { isUpdateAvailable, updateServiceWorker } = useServiceWorker();
  const [nativeUpdateAvailable, setNativeUpdateAvailable] = useState(false);
  const [latestReleaseInfo, setLatestReleaseInfo] = useState<{ tag: string; body: string } | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

  useEffect(() => {
    applyTheme();

    // Check for native app updates once upon app opening
    if (Capacitor.isNativePlatform()) {
      const checkNativeUpdate = async () => {
        try {
          const res = await fetch(`https://api.github.com/repos/aviv555m/comic-cloud/releases/latest?t=${Date.now()}`, {
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            }
          });
          if (!res.ok) return;
          const data = await res.json();
          const latestTag = data.tag_name;
          const currentTag = "v1.0.104"; // Hardcoded current native app version
          
          if (latestTag) {
            const cleanLatest = latestTag.toLowerCase().replace(/^v/, "").trim();
            const cleanCurrent = currentTag.toLowerCase().replace(/^v/, "").trim();
            
            if (cleanLatest !== cleanCurrent) {
              const bodyText = (data.body || "").toLowerCase();
              const isMandatory = bodyText.includes("[mandatory]") || bodyText.includes("[critical]");
              
              if (isMandatory) {
                localStorage.setItem("app_outdated", "true");
                setLatestReleaseInfo({
                  tag: latestTag,
                  body: data.body || ""
                });
                setNativeUpdateAvailable(true);
              } else {
                localStorage.setItem("app_outdated", "false");
              }
            } else {
              localStorage.setItem("app_outdated", "false");
            }
          }
        } catch (e) {
          console.warn("Failed to check for native updates:", e);
        }
      };
      checkNativeUpdate();

      // Listen for app state changes on mobile (foreground/background) to sync
      const appStateSub = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log("[App] App returned to foreground, triggering update check and sync");
          checkNativeUpdate();
          // The visibilitychange listener in local-supabase.ts will handle data sync,
          // but we can also trigger a generic window event just in case
          window.dispatchEvent(new Event('online'));
        }
      });

      return () => {
        appStateSub.then(sub => sub.remove());
      };
    }
  }, []);

  if (nativeUpdateAvailable && latestReleaseInfo) {
    return (
      <div className="fixed inset-0 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-50 animate-in fade-in duration-300">
        <div className="w-full max-w-md bg-card border border-violet-500/20 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="p-3 bg-violet-500/10 rounded-full text-violet-400 animate-bounce">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Mandatory Update Required</h2>
            <p className="text-gray-400 mt-2 text-sm">
              Current version: <span className="font-mono bg-gray-800 px-2 py-1 rounded">v1.0.104</span>
            </p>
            <p className="text-sm text-muted-foreground">
              You are running version <span className="text-muted-foreground/80 font-mono font-bold">v1.0.104</span>. A mandatory update to <span className="text-violet-400 font-bold font-mono">{latestReleaseInfo.tag}</span> is required to continue.
            </p>
          </div>
          
          <div className="flex flex-col gap-2 pt-2">
            <Button 
              disabled={isInstallingUpdate}
              onClick={async () => {
                setIsInstallingUpdate(true);
                try {
                  await UpdatePlugin.downloadAndInstall({
                    url: `https://github.com/aviv555m/comic-cloud/releases/latest/download/comic-cloud-release.apk?t=${Date.now()}`
                  });
                } catch (err: any) {
                  console.error("Installation failed:", err);
                  alert("Failed to start automatic update installation. Falling back to browser download...");
                  window.open(`https://github.com/aviv555m/comic-cloud/releases/latest/download/comic-cloud-release.apk?t=${Date.now()}`, "_system");
                } finally {
                  setIsInstallingUpdate(false);
                }
              }}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold h-11 flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20"
            >
              <Download className="w-4 h-4" />
              {isInstallingUpdate ? "Downloading Update..." : "Update Now"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <BrowserRouter>
        <OfflineAlertOverlay />
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reader/:bookId" element={<Reader />} />
          <Route path="/public" element={<PublicLibrary />} />
          <Route path="/series/:seriesName" element={<Series />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/lists" element={<ReadingLists />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/vocabulary" element={<Vocabulary />} />
          <Route path="/clubs" element={<Clubs />} />
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/year-in-review" element={<YearInReview />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/bookshelf" element={<Bookshelf3D />} />
          <Route path="/seanime" element={<SeanimeStream />} />
          <Route path="/manga" element={<MangaBrowser />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <DownloadProgressOverlay />
      </BrowserRouter>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SubscriptionProvider>
          <AppContent />
        </SubscriptionProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
