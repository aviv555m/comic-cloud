import { useEffect, useState } from "react";
import { Tv, Search, Server, CheckCircle2, XCircle, Loader2, Link2, PlayCircle, StopCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { CleanVideoPlayer } from "@/components/CleanVideoPlayer";
import { Navigation } from "@/components/Navigation";

const LS_HOST = "seanime_host";
const DEFAULT_HOST = "http://127.0.0.1:43211";

interface TorrentResult {
  name: string;
  link: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  provider?: string;
  magnetLink?: string;
  infoHash?: string;
}

const sizeFmt = (bytes?: number) => {
  if (!bytes) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
};

export default function SeanimeStream() {
  const { toast } = useToast();
  const [host, setHost] = useState(localStorage.getItem(LS_HOST) || DEFAULT_HOST);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  // search
  const [provider, setProvider] = useState("nyaa");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TorrentResult[]>([]);

  // playback
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamTitle, setStreamTitle] = useState<string>("");
  const [starting, setStarting] = useState(false);

  // direct url
  const [directUrl, setDirectUrl] = useState("");

  const apiBase = host.replace(/\/$/, "");

  const saveHost = () => {
    localStorage.setItem(LS_HOST, host);
    toast({ title: "Server saved" });
  };

  const checkConnection = async () => {
    setStatus("checking");
    setStatusMsg("");
    try {
      const r = await fetch(`${apiBase}/api/v1/status`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setStatus("ok");
      setStatusMsg(`Seanime ${j?.data?.version ?? ""} on ${j?.data?.os ?? ""}`);
    } catch (e: any) {
      setStatus("fail");
      setStatusMsg(e?.message || "Cannot reach Seanime. Make sure it's running and CORS allows this origin.");
    }
  };

  useEffect(() => { checkConnection(); /* eslint-disable-next-line */ }, []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const r = await fetch(`${apiBase}/api/v1/torrent/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, provider }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const list: TorrentResult[] = j?.data?.torrents || j?.data || [];
      setResults(list);
      if (!list.length) toast({ title: "No results", description: "Try a different query or provider." });
    } catch (e: any) {
      toast({ title: "Search failed", description: e?.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const startStream = async (t: TorrentResult) => {
    setStarting(true);
    setStreamUrl(null);
    try {
      const r = await fetch(`${apiBase}/api/v1/torrentstream/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSelect: false,
          playbackType: "externalPlayerLink",
          torrent: {
            name: t.name,
            link: t.link,
            magnetLink: t.magnetLink || t.link,
            infoHash: t.infoHash,
            provider: t.provider || provider,
          },
          clientId: crypto.randomUUID(),
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      // Seanime returns a stream URL; common keys: streamUrl, url, streamingUrl
      const url: string =
        j?.data?.streamUrl || j?.data?.url || j?.data?.streamingUrl ||
        `${apiBase}/api/v1/torrentstream/stream`;
      setStreamUrl(url);
      setStreamTitle(t.name);
      toast({ title: "Stream starting", description: "Buffering will begin shortly." });
    } catch (e: any) {
      toast({ title: "Failed to start stream", description: e?.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const stopStream = async () => {
    try {
      await fetch(`${apiBase}/api/v1/torrentstream/stop`, { method: "POST" });
    } catch {}
    setStreamUrl(null);
    setStreamTitle("");
  };

  const playDirect = () => {
    if (!directUrl.trim()) return;
    setStreamUrl(directUrl.trim());
    setStreamTitle(directUrl.split("/").pop() || "Video");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-6xl">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tv className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Seanime Stream</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Stream torrents from your Seanime server, or play any video URL.
            </p>
          </div>
        </div>

        {/* Player */}
        {streamUrl ? (
          <div className="mb-4 space-y-2">
            <CleanVideoPlayer src={streamUrl} title={streamTitle} />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground truncate flex-1">{streamTitle}</p>
              <Button size="sm" variant="outline" onClick={stopStream}>
                <StopCircle className="w-4 h-4 mr-1" /> Stop & close
              </Button>
            </div>
          </div>
        ) : (
          <Card className="mb-4 aspect-video flex items-center justify-center bg-muted/30 border-dashed">
            <div className="text-center text-muted-foreground p-6">
              <PlayCircle className="w-12 h-12 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Search a torrent or paste a video URL to start</p>
            </div>
          </Card>
        )}

        <Tabs defaultValue="torrent" className="w-full">
          <TabsList className="grid grid-cols-3 w-full sm:w-auto">
            <TabsTrigger value="torrent"><Search className="w-4 h-4 mr-1.5" />Torrent</TabsTrigger>
            <TabsTrigger value="direct"><Link2 className="w-4 h-4 mr-1.5" />Direct URL</TabsTrigger>
            <TabsTrigger value="server"><Server className="w-4 h-4 mr-1.5" />Server</TabsTrigger>
          </TabsList>

          <TabsContent value="torrent" className="mt-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Search torrents (e.g. One Piece 1100 1080p)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                className="flex-1"
              />
              <Input
                placeholder="provider (nyaa)"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="sm:w-40"
              />
              <Button onClick={search} disabled={searching}>
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="ml-1.5">Search</span>
              </Button>
            </div>

            {results.length > 0 && (
              <Card className="p-0 overflow-hidden">
                <ScrollArea className="max-h-[420px]">
                  <ul className="divide-y">
                    {results.map((t, i) => (
                      <li key={i} className="p-3 hover:bg-muted/50 transition-colors flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                            <Badge variant="secondary" className="text-[10px] py-0">{t.provider || provider}</Badge>
                            <span>{sizeFmt(t.size)}</span>
                            {t.seeders !== undefined && <span className="text-green-600">↑ {t.seeders}</span>}
                            {t.leechers !== undefined && <span className="text-orange-500">↓ {t.leechers}</span>}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => startStream(t)} disabled={starting}>
                          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                          <span className="ml-1 hidden sm:inline">Stream</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </Card>
            )}

            {status !== "ok" && (
              <Alert>
                <Info className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Connect to your Seanime server first (Server tab) to enable torrent search.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="direct" className="mt-4 space-y-3">
            <Card className="p-4 space-y-3">
              <Label htmlFor="durl">Video URL (mp4, webm, mkv, m3u8…)</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="durl"
                  placeholder="https://example.com/video.mkv"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && playDirect()}
                />
                <Button onClick={playDirect}>
                  <PlayCircle className="w-4 h-4 mr-1.5" /> Play
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                MKV playback depends on browser codec support. Files using H.264 + AAC usually work; HEVC or unusual audio may not.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="server" className="mt-4 space-y-3">
            <Card className="p-4 space-y-3">
              <Label htmlFor="host">Seanime server URL</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="host"
                  placeholder={DEFAULT_HOST}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
                <Button variant="outline" onClick={saveHost}>Save</Button>
                <Button onClick={checkConnection} disabled={status === "checking"}>
                  {status === "checking" ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> :
                   status === "ok" ? <CheckCircle2 className="w-4 h-4 mr-1.5 text-green-500" /> :
                   status === "fail" ? <XCircle className="w-4 h-4 mr-1.5 text-destructive" /> : null}
                  Test connection
                </Button>
              </div>
              {statusMsg && (
                <p className={`text-xs ${status === "ok" ? "text-green-600" : status === "fail" ? "text-destructive" : "text-muted-foreground"}`}>
                  {statusMsg}
                </p>
              )}
              <Alert>
                <Info className="w-4 h-4" />
                <AlertDescription className="text-xs space-y-1">
                  <p>Seanime runs locally (default <code>http://127.0.0.1:43211</code>). It must be running on your device or accessible over the network.</p>
                  <p>If you see CORS errors, run Seanime with a flag/config that allows this origin, or use a reverse proxy.</p>
                </AlertDescription>
              </Alert>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
