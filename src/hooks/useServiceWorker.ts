import { useEffect, useState } from "react";

export const useServiceWorker = () => {
  const [isReady, setIsReady] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  useEffect(() => {
    // In preview/dev we should not register a service worker because it can cache
    // old builds and make new routes/components appear "missing".
    if (!import.meta.env.PROD) {
      void unregisterServiceWorkersInDev();
      return;
    }

    if ("serviceWorker" in navigator) {
      registerServiceWorker();
    }
  }, []);

  const unregisterServiceWorkersInDev = async () => {
    if (!("serviceWorker" in navigator)) return;

    // Avoid reload loops.
    if (sessionStorage.getItem("sw_unregistered_once") === "1") return;

    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) return;

    sessionStorage.setItem("sw_unregistered_once", "1");

    await Promise.all(regs.map((r) => r.unregister()));

    // Clear caches if available (prevents stale assets)
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // Reload to ensure the latest build is fetched.
    window.location.reload();
  };

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
    if (!import.meta.env.PROD) return;
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
