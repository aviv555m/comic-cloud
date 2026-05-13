import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  PictureInPicture2, RotateCcw, RotateCw, Loader2, Settings,
  Subtitles, Languages, Upload,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface SubtitleTrack {
  id: string;
  label: string;
  lang: string;
  url: string;
}

interface CleanVideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
  className?: string;
  /** Optional preset subtitle tracks (e.g. from Seanime) */
  subtitles?: SubtitleTrack[];
}

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

// Convert SRT to VTT
const srtToVtt = (srt: string) =>
  "WEBVTT\n\n" +
  srt
    .replace(/\r+/g, "")
    .replace(/^\d+\s*$/gm, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trim();

export const CleanVideoPlayer = ({ src, title, poster, className, subtitles = [] }: CleanVideoPlayerProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Subtitles & audio tracks
  const [subs, setSubs] = useState<SubtitleTrack[]>(subtitles);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<{ id: string; label: string; lang: string }[]>([]);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);

  useEffect(() => setSubs(subtitles), [subtitles]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2500);
  }, []);

  const reveal = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  };

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen();
    else await document.exitFullscreen();
  };

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {}
  };

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!wrapRef.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") seekBy(10);
      else if (e.key === "ArrowLeft") seekBy(-10);
      else if (e.key === "f") toggleFullscreen();
      else if (e.key === "m") setMuted((m) => !m);
      else if (e.key === "c") setActiveSub((cur) => (cur ? null : subs[0]?.id ?? null));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, subs]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  }, [volume, muted, rate]);

  // Sync subtitle text track display mode
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      const t = v.textTracks[i];
      t.mode = t.id === activeSub ? "showing" : "hidden";
    }
  }, [activeSub, subs]);

  // Detect native audio tracks (Safari/limited support)
  useEffect(() => {
    const v: any = videoRef.current;
    if (!v?.audioTracks) return;
    const sync = () => {
      const list: { id: string; label: string; lang: string }[] = [];
      let active: string | null = null;
      for (let i = 0; i < v.audioTracks.length; i++) {
        const t = v.audioTracks[i];
        const id = t.id || `audio-${i}`;
        list.push({ id, label: t.label || `Track ${i + 1}`, lang: t.language || "" });
        if (t.enabled) active = id;
      }
      setAudioTracks(list);
      setActiveAudio(active);
    };
    v.audioTracks.addEventListener?.("change", sync);
    v.audioTracks.addEventListener?.("addtrack", sync);
    sync();
    return () => {
      v.audioTracks.removeEventListener?.("change", sync);
      v.audioTracks.removeEventListener?.("addtrack", sync);
    };
  }, [src]);

  const selectAudio = (id: string) => {
    const v: any = videoRef.current;
    if (!v?.audioTracks) return;
    for (let i = 0; i < v.audioTracks.length; i++) {
      v.audioTracks[i].enabled = v.audioTracks[i].id === id || `audio-${i}` === id;
    }
    setActiveAudio(id);
  };

  const onUploadSubtitle = async (file: File) => {
    const text = await file.text();
    const ext = file.name.split(".").pop()?.toLowerCase();
    const vtt = ext === "srt" ? srtToVtt(text) : text;
    const blob = new Blob([vtt], { type: "text/vtt" });
    const url = URL.createObjectURL(blob);
    const id = `sub-${Date.now()}`;
    const lang = file.name.match(/\.([a-z]{2,3})\.(srt|vtt)$/i)?.[1] || "en";
    const track: SubtitleTrack = { id, label: file.name.replace(/\.(srt|vtt)$/i, ""), lang, url };
    setSubs((s) => [...s, track]);
    setActiveSub(id);
  };

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full bg-black rounded-xl overflow-hidden group select-none aspect-video",
        className
      )}
      onMouseMove={reveal}
      onMouseLeave={() => videoRef.current && !videoRef.current.paused && setShowControls(false)}
      onClick={(e) => {
        if (e.target === videoRef.current || (e.target as HTMLElement).dataset?.overlay === "true") togglePlay();
      }}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        crossOrigin="anonymous"
        playsInline
        className="w-full h-full object-contain bg-black"
        onPlay={() => { setPlaying(true); scheduleHide(); }}
        onPause={() => { setPlaying(false); setShowControls(true); }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onError={() => setError("This video format may not be supported by your browser. Try a different stream or use an external player.")}
      >
        {subs.map((s) => (
          <track
            key={s.id}
            id={s.id}
            kind="subtitles"
            label={s.label}
            srcLang={s.lang}
            src={s.url}
            default={s.id === activeSub}
          />
        ))}
      </video>

      <input
        ref={fileInputRef}
        type="file"
        accept=".vtt,.srt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadSubtitle(f);
          e.target.value = "";
        }}
      />

      {/* center loading */}
      {loading && !error && (
        <div data-overlay="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-12 h-12 text-white animate-spin" />
        </div>
      )}

      {/* error overlay */}
      {error && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-white text-sm">{error}</p>
            <p className="text-white/60 text-xs break-all">{src}</p>
          </div>
        </div>
      )}

      {/* big play btn */}
      {!playing && !loading && !error && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity"
          aria-label="Play"
        >
          <span className="w-20 h-20 rounded-full bg-white/95 flex items-center justify-center shadow-2xl">
            <Play className="w-9 h-9 text-black ml-1" fill="currentColor" />
          </span>
        </button>
      )}

      {/* top bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {title && <h3 className="text-white text-sm font-medium truncate">{title}</h3>}
      </div>

      {/* bottom controls */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 px-3 sm:px-4 pb-3 pt-8 bg-gradient-to-t from-black/80 to-transparent transition-opacity",
          showControls ? "opacity-100" : "opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* progress */}
        <div className="relative mb-2">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full" />
          <div
            className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-white/40 rounded-full pointer-events-none"
            style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }}
          />
          <Slider
            value={[duration ? (time / duration) * 100 : 0]}
            max={100}
            step={0.1}
            onValueChange={(v) => {
              if (videoRef.current && duration) videoRef.current.currentTime = (v[0] / 100) * duration;
            }}
            className="relative z-10 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-primary [&>span:first-child]:bg-transparent [&>span:first-child>span]:bg-primary"
          />
        </div>

        <div className="flex items-center gap-1 sm:gap-2 text-white">
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9" onClick={togglePlay}>
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9 hidden sm:inline-flex" onClick={() => seekBy(-10)}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9 hidden sm:inline-flex" onClick={() => seekBy(10)}>
            <RotateCw className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 ml-1 group/vol">
            <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9" onClick={() => setMuted((m) => !m)}>
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
            <div className="hidden sm:block w-0 group-hover/vol:w-20 overflow-hidden transition-all">
              <Slider
                value={[muted ? 0 : volume * 100]}
                max={100}
                onValueChange={(v) => { setVolume(v[0] / 100); setMuted(false); }}
              />
            </div>
          </div>

          <span className="text-xs sm:text-sm tabular-nums ml-1">{fmt(time)} / {fmt(duration)}</span>

          <div className="flex-1" />

          {/* Subtitles menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "text-white hover:bg-white/10 h-9 w-9",
                  activeSub && "text-primary"
                )}
                title="Subtitles (C)"
              >
                <Subtitles className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveSub(null)}>
                {activeSub === null ? "✓ " : "  "}Off
              </DropdownMenuItem>
              {subs.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => setActiveSub(s.id)}>
                  {activeSub === s.id ? "✓ " : "  "}
                  {s.label} {s.lang && <span className="text-xs text-muted-foreground ml-1">({s.lang})</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-2" /> Upload .srt / .vtt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Audio language menu (only if multiple tracks) */}
          {audioTracks.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9" title="Audio language">
                  <Languages className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel>Audio</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {audioTracks.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => selectAudio(t.id)}>
                    {activeAudio === t.id ? "✓ " : "  "}
                    {t.label} {t.lang && <span className="text-xs text-muted-foreground ml-1">({t.lang})</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9">
                <Settings className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Playback speed</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <DropdownMenuItem key={r} onClick={() => setRate(r)}>
                  {rate === r ? "✓ " : "  "}{r}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {document.pictureInPictureEnabled && (
            <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9 hidden sm:inline-flex" onClick={togglePiP}>
              <PictureInPicture2 className="w-4 h-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 h-9 w-9" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
