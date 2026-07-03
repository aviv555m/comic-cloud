import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { originalSupabase, resolveBookAssetUrl } from "@/lib/local-supabase";
import { parseStorageReference } from "@/lib/storage-paths";

interface ResolvedCoverImageProps {
  alt: string;
  className?: string;
  src: string;
}

export const ResolvedCoverImage = ({ alt, className, src }: ResolvedCoverImageProps) => {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    if (!src) return;
    if (src.startsWith("data:")) {
      setResolvedSrc(src);
      return;
    }

    const isNative = Capacitor.isNativePlatform();
    const isProdOrNative = isNative || !import.meta.env.DEV;

    if (isProdOrNative && src.startsWith("/api-image-proxy?url=")) {
      const targetUrl = decodeURIComponent(src.split("/api-image-proxy?url=")[1]);
      let active = true;

      const fetchCover = async () => {
        try {
          const { data, error } = await supabase.functions.invoke("public-library-proxy", {
            body: { url: targetUrl, responseType: "text" },
          });
          if (active && !error && data?.success && data.data) {
            setResolvedSrc(`data:image/jpeg;base64,${data.data}`);
          }
        } catch (err) {
          console.warn("Failed to resolve proxied cover:", err);
        }
      };

      fetchCover();
      return () => {
        active = false;
      };
    }

    setResolvedSrc(src);
  }, [src]);

  const handleError = async () => {
    const localFallback = await resolveBookAssetUrl(src, "book-covers");
    if (localFallback && localFallback !== resolvedSrc) {
      setResolvedSrc(localFallback);
      return;
    }

    const coverRef = parseStorageReference(src, "book-covers");
    if (!coverRef) return;

    try {
      const { data, error } = await originalSupabase.storage
        .from("book-covers")
        .createSignedUrl(coverRef.relativePath, 60 * 60 * 4);
      if (!error && data?.signedUrl) {
        setResolvedSrc(data.signedUrl);
      }
    } catch (err) {
      console.warn("Failed to resolve legacy cover fallback:", err);
    }
  };

  return <img src={resolvedSrc} alt={alt} className={className} onError={() => void handleError()} />;
};
