import { useEffect, useState } from "react";

export const useServiceWorker = () => {
  const [isReady, setIsReady] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      setIsReady(true);

      // Check for updates
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setIsUpdateAvailable(true);
            }
          });
        }
      });

      // Handle updates on page load
      if (registration.waiting) {
        setIsUpdateAvailable(true);
      }
    } catch (error) {
      console.error("Service Worker registration failed:", error);
    }
  };

  const updateServiceWorker = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage("skipWaiting");
          window.location.reload();
        }
      });
    }
  };

  return {
    isReady,
    isUpdateAvailable,
    updateServiceWorker,
  };
};
