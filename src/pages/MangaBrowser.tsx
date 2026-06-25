import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  BookOpen,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";

/**
 * Manga / Manhwa / Comics browser.
 * Uses the public-library-proxy edge function to fetch HTML pages and images
 * from supported sources (comix.to and MangaDex) and renders them inline.
 *
 * For comix.to we scrape the public HTML (search results -> chapter list ->
 * page images). The proxy enforces an allowlist server-side.
 */

type Source = "comix" | "mangadex" | "mangafire" | "mangafreak" | "mangapark";

interface SearchResult {
  title: string;
  url: string;
  cover?: string;
}

interface ChapterRef {
  title: string;
  url: string;
}

const proxyText = async (url: string): Promise<string> => {
  const { data, error } = await supabase.functions.invoke("public-library-proxy", {
    body: { url, responseType: "text" },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Proxy failed");
  return typeof data.data === "string" ? data.data : JSON.stringify(data.data);
};

const proxyJson = async (url: string): Promise<any> => {
  const { data, error } = await supabase.functions.invoke("public-library-proxy", {
    body: { url, responseType: "json" },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error ?? "Proxy failed");
  return data.data;
};

const absolutize = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
};

// ---------- MangaDex API helpers ----------
const mangadexSearch = async (q: string): Promise<SearchResult[]> => {
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=cover_art`;
  const data = await proxyJson(url);
  const out: SearchResult[] = [];
  if (data?.data) {
    data.data.forEach((m: any) => {
      const title = m.attributes.title.en || Object.values(m.attributes.title)[0] || "Untitled";
      const coverRelation = m.relationships.find((r: any) => r.type === "cover_art");
      const coverFileName = coverRelation?.attributes?.fileName;
      const cover = coverFileName 
        ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}`
        : undefined;
      out.push({ title, url: m.id, cover });
    });
  }
  return out;
};

const mangadexChapters = async (mangaId: string): Promise<ChapterRef[]> => {
  const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=100`;
  const data = await proxyJson(url);
  const out: ChapterRef[] = [];
  if (data?.data) {
    data.data.forEach((c: any) => {
      if (c.attributes.externalUrl) return;
      
      const chNum = c.attributes.chapter;
      const chTitle = c.attributes.title;
      const title = chTitle 
        ? `Ch. ${chNum} - ${chTitle}`
        : `Chapter ${chNum}`;
      
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

import { initComixClient, comixAxios } from "@/lib/comix-client";

// ---------- comix.to API helpers using signed comixAxios client ----------
const comixSearch = async (q: string): Promise<SearchResult[]> => {
  await initComixClient();
  const searchToken = "/manga"; // signature is computed based on the endpoint pathname
  // The client Axios request interceptor intercepts this request, signs it, and attaches the signature as query param '_'
  const response = await comixAxios.get(`/manga`, {
    params: {
      keyword: q,
      "order[relevance]": "desc",
      limit: 20,
      page: 1
    }
  });

  const out: SearchResult[] = [];
  const items = response.data?.result?.items || response.data?.items || [];
  items.forEach((item: any) => {
    out.push({
      title: item.title || "Untitled",
      url: `${item.hid || item.id}|${item.slug || ""}`, // Store hid and slug combined
      cover: item.coverUrl || item.cover?.url || undefined,
    });
  });
  return out;
};

const comixChapters = async (seriesUrl: string): Promise<ChapterRef[]> => {
  await initComixClient();
  const [hid, slug] = seriesUrl.split("|");
  const chaptersPath = `/manga/${hid}/chapters`;
  const response = await comixAxios.get(chaptersPath, {
    params: {
      "order[number]": "desc",
      limit: 100,
      page: 1,
      mangaSlug: slug || ""
    }
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
  const pagesPath = `/chapters/${chapterUrl}`;
  const response = await comixAxios.get(pagesPath);
  
  const imgs: string[] = [];
  const imageItems = response.data?.result?.images || response.data?.images || [];
  imageItems.forEach((img: any) => {
    // If img is an object containing url, or a plain string
    const url = typeof img === "object" ? img.url || img.image : img;
    if (url) imgs.push(url);
  });
  return imgs;
};

import { searchAniListManga, updateAniListProgress } from "@/lib/anilist";
import {
  mangafireSearch,
  mangafireChapters,
  mangafirePages,
  mangafreakSearch,
  mangafreakChapters,
  mangafreakPages,
  mangaparkSearch,
  mangaparkChapters,
  mangaparkPages,
} from "@/lib/manga-sources-client";

const MangaBrowser = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [source, setSource] = useState<Source>("mangadex");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [currentSeries, setCurrentSeries] = useState<SearchResult | null>(null);
  const [currentChapter, setCurrentChapter] = useState<ChapterRef | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // AniList Sync state
  const [aniListToken] = useState<string | null>(localStorage.getItem("anilist_token"));
  const [aniListMediaId, setAniListMediaId] = useState<number | null>(null);
  const [aniListSyncing, setAniListSyncing] = useState(false);

  const onSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setChapters([]);
    setCurrentSeries(null);
    setCurrentChapter(null);
    setPages([]);
    try {
      let found: SearchResult[] = [];
      if (source === "comix") {
        found = await comixSearch(query);
      } else if (source === "mangadex") {
        found = await mangadexSearch(query);
      } else if (source === "mangafire") {
        found = await mangafireSearch(query);
      } else if (source === "mangafreak") {
        found = await mangafreakSearch(query);
      } else if (source === "mangapark") {
        found = await mangaparkSearch(query);
      }
      setResults(found);
      if (found.length === 0) {
        toast({ title: "No results", description: "Try a different title." });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: err.message ?? "Source unreachable",
      });
    } finally {
      setLoading(false);
    }
  };

  const openSeries = async (series: SearchResult) => {
    setLoading(true);
    setChapters([]);
    setCurrentSeries(series);
    setCurrentChapter(null);
    setPages([]);
    setAniListMediaId(null);
    try {
      let list: ChapterRef[] = [];
      if (source === "comix") {
        list = await comixChapters(series.url);
      } else if (source === "mangadex") {
        list = await mangadexChapters(series.url);
      } else if (source === "mangafire") {
        list = await mangafireChapters(series.url);
      } else if (source === "mangafreak") {
        list = await mangafreakChapters(series.url);
      } else if (source === "mangapark") {
        list = await mangaparkChapters(series.url);
      }
      setChapters(list);

      // Attempt to search and match on AniList
      if (aniListToken && series.title) {
        try {
          const mediaList = await searchAniListManga(aniListToken, series.title);
          if (mediaList && mediaList.length > 0) {
            // Find a media item with close title matching
            setAniListMediaId(mediaList[0].id);
            toast({
              title: "AniList Linked",
              description: `Linked reading progress to: ${mediaList[0].title.english || mediaList[0].title.romaji}`,
            });
          }
        } catch (e) {
          console.error("AniList series matching failed:", e);
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't load chapters",
        description: err.message ?? "",
      });
    } finally {
      setLoading(false);
    }
  };

  const openChapter = async (chapter: ChapterRef) => {
    setLoading(true);
    setCurrentChapter(chapter);
    setPages([]);
    try {
      let imgs: string[] = [];
      if (source === "comix") {
        imgs = await comixPages(chapter.url);
      } else if (source === "mangadex") {
        imgs = await mangadexPages(chapter.url);
      } else if (source === "mangafire") {
        imgs = await mangafirePages(chapter.url);
      } else if (source === "mangafreak") {
        imgs = await mangafreakPages(chapter.url);
      } else if (source === "mangapark") {
        imgs = await mangaparkPages(chapter.url);
      }
      if (imgs.length === 0) throw new Error("No pages found on this chapter page.");
      setPages(imgs);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });

      // Parse chapter number and update AniList progress
      if (aniListToken && aniListMediaId) {
        const match = chapter.title.match(/Chapter\s+(\d+(\.\d+)?)|Ch\.\s*(\d+(\.\d+)?)/i);
        // Fallback: search for first number in title
        const numMatch = match ? match[1] || match[3] : chapter.title.match(/\d+(\.\d+)?/)?.[0];
        if (numMatch) {
          const chapterNum = Math.floor(parseFloat(numMatch));
          if (chapterNum > 0) {
            setAniListSyncing(true);
            try {
              await updateAniListProgress(aniListToken, aniListMediaId, chapterNum);
              toast({
                title: "AniList Synced",
                description: `Successfully updated progress to Chapter ${chapterNum} on AniList!`,
              });
            } catch (syncErr: any) {
              console.error("AniList progress sync failed:", syncErr);
            } finally {
              setAniListSyncing(false);
            }
          }
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't load chapter",
        description: err.message ?? "",
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------------- Render ----------------

  if (currentChapter && pages.length > 0) {
    const idx = chapters.findIndex((c) => c.url === currentChapter.url);
    const prev = idx > 0 ? chapters[idx - 1] : null;
    const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b">
          <div className="max-w-3xl mx-auto flex items-center gap-2 p-3">
            <Button variant="ghost" size="icon" onClick={() => setPages([])}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentSeries?.title}</p>
              <p className="text-xs text-muted-foreground truncate">{currentChapter.title}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!prev}
              onClick={() => prev && openChapter(prev)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!next}
              onClick={() => next && openChapter(next)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-1 py-4">
          {pages.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Page ${i + 1}`}
              loading="lazy"
              className="w-full h-auto"
              referrerPolicy="no-referrer"
            />
          ))}
          <div className="flex gap-2 p-4">
            <Button variant="outline" disabled={!prev} onClick={() => prev && openChapter(prev)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev chapter
            </Button>
            <Button disabled={!next} onClick={() => next && openChapter(next)}>
              Next chapter <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Manga & Manhwa</h1>
            <p className="text-sm text-muted-foreground">
              Browse MangaDex (and more) right inside your library
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Badge
            variant={source === "comix" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSource("comix")}
          >
            comix.to
          </Badge>
          <Badge
            variant={source === "mangadex" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSource("mangadex")}
          >
            MangaDex
          </Badge>
          <Badge
            variant={source === "mangafire" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSource("mangafire")}
          >
            MangaFire
          </Badge>
          <Badge
            variant={source === "mangafreak" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSource("mangafreak")}
          >
            MangaFreak
          </Badge>
          <Badge
            variant={source === "mangapark" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSource("mangapark")}
          >
            MangaPark
          </Badge>
        </div>

        <form onSubmit={onSearch} className="flex gap-2 mb-6">
          <Input
            placeholder="Search a series (e.g. Solo Leveling)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </form>

        {currentSeries && (
          <div className="mb-4 p-3 rounded-lg border bg-card flex items-center gap-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium flex-1 truncate">{currentSeries.title}</p>
            {aniListMediaId && (
              <Badge variant="secondary" className="bg-sky-500/10 text-sky-400 border-0 flex gap-1 items-center shrink-0">
                <Sparkles className="w-3 h-3 text-sky-400 animate-pulse" />
                {aniListSyncing ? "Syncing..." : "AniList Linked"}
              </Badge>
            )}
            <Button size="sm" variant="ghost" onClick={() => window.open(currentSeries.url, "_blank")}>
              <ExternalLink className="w-3 h-3 mr-1" /> Source
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCurrentSeries(null); setChapters([]); }}>
              Back
            </Button>
          </div>
        )}

        {/* Chapters list */}
        {chapters.length > 0 && (
          <div className="grid gap-2 mb-6">
            {chapters.map((c) => (
              <Card
                key={c.url}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => openChapter(c)}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm">{c.title}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Search results */}
        {!currentSeries && results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {results.map((r) => (
              <Card
                key={r.url}
                className="cursor-pointer overflow-hidden hover:shadow-lg transition"
                onClick={() => openSeries(r)}
              >
                <div className="aspect-[2/3] bg-muted">
                  {r.cover ? (
                    <img
                      src={r.cover}
                      alt={r.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <CardContent className="p-2">
                  <p className="text-xs font-medium line-clamp-2">{r.title}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && results.length === 0 && !currentSeries && (
          <div className="text-center text-sm text-muted-foreground py-10">
            Search for a series to get started.
          </div>
        )}
      </div>
    </div>
  );
};

export default MangaBrowser;
