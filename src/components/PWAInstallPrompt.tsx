import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PWAInstallPrompt = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || 
                          (window.navigator as any).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed prompt before
    let dismissed = null;
    try {
      dismissed = localStorage.getItem("pwa-prompt-dismissed");
    } catch (e) {}
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    // Check if iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    if (ios) {
      // iOS doesn't support beforeinstallprompt, so we trigger the modal manually after a delay
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    } else {
      const handler = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e as BeforeInstallPromptEvent);
        // Show prompt after a short delay
        setTimeout(() => setShowPrompt(true), 3000);
      };

      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    
    setShowPrompt(false);
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem("pwa-prompt-dismissed", Date.now().toString());
    } catch (e) {}
  };

  if (!showPrompt || isInstalled) return null;

  return (
    <Card className="fixed bottom-20 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-80 shadow-xl border-primary/20 bg-card/95 backdrop-blur-sm animate-in slide-in-from-bottom-4">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <h3 className="font-semibold text-sm">Install ComicCloud</h3>
              <Button size="icon" variant="ghost" className="h-6 w-6 p-0 hover:bg-transparent" onClick={handleDismiss}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {isIOS ? (
              <div className="mt-2 space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>Add to your Home Screen to open it as a standalone app:</p>
                <ol className="list-decimal pl-4 space-y-2 font-medium text-foreground/90">
                  <li>
                    Tap the Share button <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-card-foreground text-[10px]">📤</span> at the bottom of Safari.
                  </li>
                  <li>
                    Scroll down and select <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-card-foreground font-semibold text-[10px]">Add to Home Screen ➕</span>.
                  </li>
                  <li>
                    Tap <span className="text-primary font-semibold">Add</span> in the top-right corner.
                  </li>
                </ol>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mt-1">
                  Install for offline access and a better experience
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleInstall} className="flex-1">
                    Install
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
