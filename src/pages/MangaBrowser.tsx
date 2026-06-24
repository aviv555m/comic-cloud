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
} from "lucide-react";

/**
 * Manga / Manhwa / Comics browser.
 * Uses the public-library-proxy edge function to fetch HTML pages and images
 * from supported sources (comix.to and MangaDex) and renders them inline.
 *
 * For comix.to we scrape the public HTML (search results -> chapter list ->
 * page images). The proxy enforces an allowlist server-side.
 */

type Source = "comix" | "mangadex";

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

const absolutize = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
};

// ---------- comix.to scrapers (best-effort, structure may change) ----------
const comixSearch = async (q: string): Promise<SearchResult[]> => {
  const url = `https://comix.to/?s=${encodeURIComponent(q)}`;
  const html = await proxyText(url);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: SearchResult[] = [];
  doc.querySelectorAll("article, .bs, .listupd .bsx").forEach((el) => {
    const a = el.querySelector("a[href]") as HTMLAnchorElement | null;
    const img = el.querySelector("img") as HTMLImageElement | null;
    if (!a) return;
    const href = absolutize(a.getAttribute("href") || "", url);
    if (!/comix\.to\//.test(href)) return;
    const title =
      a.getAttribute("title") ||
      el.querySelector(".tt, .title, h2, h3")?.textContent?.trim() ||
      a.textContent?.trim() ||
      "Untitled";
    const cover =
      img?.getAttribute("data-src") ||
      img?.getAttribute("src") ||
      undefined;
    out.push({ title, url: href, cover });
  });
  // de-dup
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.url) ? false : seen.add(r.url)));
};

const comixChapters = async (seriesUrl: string): Promise<ChapterRef[]> => {
  const html = await proxyText(seriesUrl);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: ChapterRef[] = [];
  doc.querySelectorAll("#chapterlist a, .eph-num a, .chbox a").forEach((a) => {
    const href = absolutize((a as HTMLAnchorElement).getAttribute("href") || "", seriesUrl);
    const title =
      (a.querySelector(".chapternum")?.textContent?.trim()) ||
      a.textContent?.trim() ||
      "Chapter";
    if (href.includes("comix.to")) out.push({ title, url: href });
  });
  return out;
};

const comixPages = async (chapterUrl: string): Promise<string[]> => {
  const html = await proxyText(chapterUrl);
  // Try the common embedded JSON: ts_reader.run({...})
  const m = html.match(/ts_reader\.run\((\{[\s\S]*?\})\);/);
  if (m) {
    try {
      const json = JSON.parse(m[1]);
      const imgs: string[] = json?.sources?.[0]?.images ?? [];
      if (imgs.length) return imgs;
    } catch {
      /* fall through */
    }
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs: string[] = [];
  doc.querySelectorAll("#readerarea img, .reader-area img").forEach((img) => {
    const src =
      (img as HTMLImageElement).getAttribute("data-src") ||
      (img as HTMLImageElement).getAttribute("src");
    if (src) imgs.push(absolutize(src, chapterUrl));
  });
  return imgs;
};

const MangaBrowser = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [source, setSource] = useState<Source>("comix");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [chapters, setChapters] = useState<ChapterRef[]>([]);
  const [currentSeries, setCurrentSeries] = useState<SearchResult | null>(null);
  const [currentChapter, setCurrentChapter] = useState<ChapterRef | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

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
      const found = source === "comix" ? await comixSearch(query) : [];
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
    try {
      const list = await comixChapters(series.url);
      setChapters(list);
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
      const imgs = await comixPages(chapter.url);
      if (imgs.length === 0) throw new Error("No pages found on this chapter page.");
      setPages(imgs);
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
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
              Browse comix.to (and more) right inside your library
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <Badge
            variant={source === "comix" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSource("comix")}
          >
            comix.to
          </Badge>
          <Badge variant="outline" className="opacity-50 cursor-not-allowed">
            MangaDex (soon)
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
