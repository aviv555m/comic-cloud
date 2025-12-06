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
import NotFound from "./pages/NotFound";

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

const App = () => {
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reader/:bookId" element={<Reader />} />
            <Route path="/public" element={<PublicLibrary />} />
            <Route path="/series/:seriesName" element={<Series />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/settings" element={<Settings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
