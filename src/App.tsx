import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
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
import Discover from "./pages/Discover";
import Reminders from "./pages/Reminders";
import Journal from "./pages/Journal";
import Quotes from "./pages/Quotes";
import YearInReview from "./pages/YearInReview";
import Feed from "./pages/Feed";
import Bookshelf3D from "./pages/Bookshelf3D";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { FloatingChatBubble } from "./components/FloatingChatBubble";
import { useServiceWorker } from "./hooks/useServiceWorker";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
const queryClient = new QueryClient();

// Apply saved theme on load
const applyTheme = () => {
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
};

const AppContent = () => {
  const { isUpdateAvailable, updateServiceWorker } = useServiceWorker();

  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <>
      <Toaster />
      <Sonner />
      <PWAInstallPrompt />
      {isUpdateAvailable && (
        <div className="fixed top-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-80">
          <div className="bg-primary text-primary-foreground p-3 rounded-lg shadow-lg text-sm">
            <p className="font-medium">Update available</p>
            <button 
              onClick={updateServiceWorker}
              className="mt-2 underline text-xs"
            >
              Click to update
            </button>
          </div>
        </div>
      )}
      <BrowserRouter>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <FloatingChatBubble />
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
