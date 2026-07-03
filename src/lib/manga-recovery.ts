import JSZip from "jszip";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { initComixClient, comixAxios } from "@/lib/comix-client";
import {
  mangafireChapters,
  mangafirePages,
  mangafreakChapters,
  mangafreakPages,
  mangaparkChapters,
  mangaparkPages,
  manganatoChapters,
  manganatoPages,
} from "@/lib/manga-sources-client";
import { parseStorageReference } from "@/lib/storage-paths";

type RecoverySource = "comix" | "mangadex" | "mangafire" | "mangafreak" | "mangapark" | "manganato";

interface ChapterRef {
  title: string;
  url: string;
}

interface RecoverableBook {
  id: string;
  title: string;
  author: string | null;
  series?: string | null;
  user_id: string;
  file_url: string;
}

interface SeriesCard {
  title: string;
  author: string | null;
  file_url: string;
}

const normalizeChapterIdentity = (value: string | null | undefined) =>
  String(value || "")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\[offline\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const extractChapterNumber = (value: string | null | undefined): string | null => {
  const match = String(value || "").match(/(?:ch|chap|chapter)\.?\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match?.[1] || null;
};

const proxyJson = async (url: string): Promise<any> => {
  const { data, error } = await supabase.functions.invoke("public-library-proxy", {
    body: { url, responseType: "json" },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Proxy failed");
  return data.data;
};

const mangadexChapters = async (mangaId: string): Promise<ChapterRef[]> => {
  const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=500`;
  const data = await proxyJson(url);
  const out: ChapterRef[] = [];
  if (data?.data) {
    data.data.forEach((c: any) => {
      if (c.attributes.externalUrl) return;
      const chNum = c.attributes.chapter;
      const chTitle = c.attributes.title;
      const title = chTitle ? `Ch. ${chNum} - ${chTitle}` : `Chapter ${chNum}`;
      out.push({ title, url: c.id });
    });
  }
  return out;
};

const mangadexPages = async (chapterId: string): Promise<string[]> => {
  const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
  const data = await proxyJson(url);
  const hash = data?.chapter?.hash;
  const pageFiles = data?.chapter?.data;
  const baseUrl = data?.baseUrl;
  if (!hash || !pageFiles || !baseUrl) {
    throw new Error("This chapter does not have pages hosted on MangaDex.");
  }
  return pageFiles.map((f: string) => `${baseUrl}/data/${hash}/${f}`);
};

const comixChapters = async (seriesUrl: string): Promise<ChapterRef[]> => {
  await initComixClient();
  const [hid, slug] = seriesUrl.split("|");
  const response = await comixAxios.get(`/manga/${hid}/chapters`, {
    params: {
      "order[number]": "desc",
      limit: 500,
      page: 1,
      mangaSlug: slug || "",
    },
  });

  const out: ChapterRef[] = [];
  const items = response.data?.result?.items || response.data?.items || [];
  items.forEach((item: any) => {
    out.push({
      title: item.number !== undefined ? `Chapter ${item.number}` : item.title || "Chapter",
      url: item.id || "",
    });
  });
  return out;
};

const comixPages = async (chapterUrl: string): Promise<string[]> => {
  await initComixClient();
  const response = await comixAxios.get(`/chapters/${chapterUrl}`);
  const imgs: string[] = [];
  const imageItems = response.data?.result?.images || response.data?.images || [];
  imageItems.forEach((img: any) => {
    const url = typeof img === "object" ? img.url || img.image : img;
    if (url) imgs.push(url);
  });
  return imgs;
};

const getSourceChapters = async (source: RecoverySource, seriesUrl: string): Promise<ChapterRef[]> => {
  switch (source) {
    case "comix":
      return comixChapters(seriesUrl);
    case "mangadex":
      return mangadexChapters(seriesUrl);
    case "mangafire":
      return mangafireChapters(seriesUrl);
    case "mangafreak":
      return mangafreakChapters(seriesUrl);
    case "mangapark":
      return mangaparkChapters(seriesUrl);
    case "manganato":
      return manganatoChapters(seriesUrl);
    default:
      return [];
  }
};

const getSourcePages = async (source: RecoverySource, chapterUrl: string): Promise<string[]> => {
  switch (source) {
    case "comix":
      return comixPages(chapterUrl);
    case "mangadex":
      return mangadexPages(chapterUrl);
    case "mangafire":
      return mangafirePages(chapterUrl);
    case "mangafreak":
      return mangafreakPages(chapterUrl);
    case "mangapark":
      return mangaparkPages(chapterUrl);
    case "manganato":
      return manganatoPages(chapterUrl);
    default:
      return [];
  }
};

const fetchImageAsArrayBuffer = async (imgUrl: string): Promise<ArrayBuffer> => {
  const isNative = Capacitor.isNativePlatform();
  let hostname = "";
  try {
    hostname = new URL(imgUrl).hostname.toLowerCase();
  } catch {}

  const allowedHosts = [
    "gutendex.com",
    "archive.org",
    "openlibrary.org",
    "www.wattpad.com",
    "api.mangadex.org",
    "uploads.mangadex.org",
    "standardebooks.org",
    "www.standardebooks.org",
    "covers.openlibrary.org",
    "comix.to",
    "www.comix.to",
  ];
  const isAllowedHost = allowedHosts.includes(hostname) || hostname.endsWith(".comix.to") || hostname.endsWith(".mangadex.org");

  if (isAllowedHost) {
    const { data, error } = await supabase.functions.invoke("public-library-proxy", {
      body: { url: imgUrl, responseType: "text" },
    });
    if (!error && data?.success && data.data) {
      const binaryString = atob(data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }

  if (isNative) {
    const response = await CapacitorHttp.get({
      url: imgUrl,
      responseType: "arraybuffer",
    });
    if (response.status >= 200 && response.status < 300 && response.data) {
      if (typeof response.data === "string") {
        const binaryString = atob(response.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      }
      return response.data;
    }
  } else {
    const res = await fetch(`/api-image-proxy?url=${encodeURIComponent(imgUrl)}`);
    if (res.ok) return res.arrayBuffer();
  }

  const resDirect = await fetch(imgUrl);
  return resDirect.arrayBuffer();
};

export async function recoverMissingMangaBookFile(
  book: RecoverableBook,
  seriesCard: SeriesCard
): Promise<{ signedUrl: string; fileSize: number; chapterUrl: string } | null> {
  const source = String(seriesCard.author || book.author || "").toLowerCase() as RecoverySource;
  const supportedSources: RecoverySource[] = ["comix", "mangadex", "mangafire", "mangafreak", "mangapark", "manganato"];
  if (!supportedSources.includes(source)) return null;

  const seriesUrl = String(seriesCard.file_url || "").trim();
  if (!seriesUrl) return null;

  const wantedChapterKey = normalizeChapterIdentity(book.title);
  const chapters = await getSourceChapters(source, seriesUrl);
  const wantedChapterNumber = extractChapterNumber(book.title);
  const chapter =
    chapters.find((item) => normalizeChapterIdentity(item.title) === wantedChapterKey) ||
    chapters.find((item) => {
      const candidateNumber = extractChapterNumber(item.title);
      return wantedChapterNumber && candidateNumber === wantedChapterNumber;
    });
  if (!chapter) return null;

  const pages = await getSourcePages(source, chapter.url);
  if (!pages.length) return null;

  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    const pageUrl = pages[i];
    const buffer = await fetchImageAsArrayBuffer(pageUrl);
    const ext = pageUrl.split("?")[0].split(".").pop() || "jpg";
    const validExt = ["jpg", "jpeg", "png", "webp"].includes(ext.toLowerCase()) ? ext : "jpg";
    zip.file(`${String(i + 1).padStart(3, "0")}.${validExt}`, buffer);
  }

  const cbzBlob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  if (cbzBlob.size < 1000) {
    throw new Error("Recovered CBZ is empty.");
  }

  const fileRef = parseStorageReference(book.file_url, "book-files");
  const relativePath = fileRef?.relativePath || `${book.user_id}/manga_recovered_${book.id}.cbz`;
  const { error: uploadError } = await supabase.storage
    .from("book-files")
    .upload(relativePath, cbzBlob, {
      contentType: "application/x-cbz",
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: signedData, error: signedError } = await supabase.storage
    .from("book-files")
    .createSignedUrl(relativePath, 60 * 60 * 4);
  if (signedError || !signedData?.signedUrl) {
    throw signedError || new Error("Failed to create signed URL for recovered file.");
  }

  return {
    signedUrl: signedData.signedUrl,
    fileSize: cbzBlob.size,
    chapterUrl: chapter.url,
  };
}
