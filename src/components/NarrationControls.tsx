import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Volume2, VolumeX, Pause, Play, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface NarrationControlsProps {
  text: string;
  onPlayingChange?: (playing: boolean) => void;
}

const VOICES = [
  { id: "alloy", name: "Alloy", description: "Neutral and balanced" },
  { id: "echo", name: "Echo", description: "Warm and conversational" },
  { id: "fable", name: "Fable", description: "Expressive and dramatic" },
  { id: "onyx", name: "Onyx", description: "Deep and authoritative" },
  { id: "nova", name: "Nova", description: "Friendly and upbeat" },
  { id: "shimmer", name: "Shimmer", description: "Clear and pleasant" },
];

export const NarrationControls = ({ text, onPlayingChange }: NarrationControlsProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [voice, setVoice] = useState("nova");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const generateAndPlay = async () => {
    if (!text || text.trim().length === 0) {
      toast({
        variant: "destructive",
        title: "No text",
        description: "No text available for narration",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Limit text to avoid API limits (OpenAI TTS has 4096 char limit)
      const trimmedText = text.substring(0, 4000);

      const response = await supabase.functions.invoke("text-to-speech", {
        body: { text: trimmedText, voice },
      });

      if (response.error) throw response.error;

      const { audioContent } = response.data;
      
      // Use data URI for proper decoding
      const audioUrl = `data:audio/mpeg;base64,${audioContent}`;
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.playbackRate = speed;
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("TTS error:", error);
      toast({
        variant: "destructive",
        title: "Narration failed",
        description: "Could not generate audio. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else if (audioRef.current?.src) {
      await audioRef.current.play();
      setIsPlaying(true);
    } else {
      await generateAndPlay();
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={togglePlayback}
        disabled={isLoading}
        className="h-9 px-3"
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </Button>

      {isPlaying && (
        <Button
          variant="ghost"
          size="sm"
          onClick={stop}
          className="h-9 px-3"
        >
          <VolumeX className="w-4 h-4" />
        </Button>
      )}

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 px-3">
            <Settings className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-4">
            <h4 className="font-medium">Narration Settings</h4>

            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div>
                        <span className="font-medium">{v.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {v.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-sm font-medium">Speed</label>
                <span className="text-sm text-muted-foreground">{speed.toFixed(1)}x</span>
              </div>
              <Slider
                value={[speed]}
                onValueChange={([v]) => setSpeed(v)}
                min={0.5}
                max={2.0}
                step={0.1}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Changes apply to the next playback. Premium voices use OpenAI TTS.
            </p>
          </div>
        </PopoverContent>
      </Popover>

      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false);
          toast({
            variant: "destructive",
            title: "Playback error",
            description: "Failed to play audio",
          });
        }}
      />
    </div>
  );
};
