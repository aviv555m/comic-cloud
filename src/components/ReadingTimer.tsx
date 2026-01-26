import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Timer, 
  Coffee, 
  X,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReadingTimerProps {
  onSessionComplete?: (durationMinutes: number) => void;
}

type TimerMode = "focus" | "break";

const PRESETS = [
  { label: "25 min", focus: 25, break: 5 },
  { label: "45 min", focus: 45, break: 10 },
  { label: "60 min", focus: 60, break: 15 },
];

export const ReadingTimer = ({ onSessionComplete }: ReadingTimerProps) => {
  const [isMinimized, setIsMinimized] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<TimerMode>("focus");
  const [preset, setPreset] = useState(PRESETS[0]);
  const [timeLeft, setTimeLeft] = useState(preset.focus * 60);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element for timer completion
    audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleA8GQHDL76Rw");
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleTimerComplete();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, timeLeft]);

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    audioRef.current?.play().catch(() => {});
    
    if (mode === "focus") {
      setSessionsCompleted((prev) => prev + 1);
      onSessionComplete?.(preset.focus);
      setMode("break");
      setTimeLeft(preset.break * 60);
    } else {
      setMode("focus");
      setTimeLeft(preset.focus * 60);
    }
  }, [mode, preset, onSessionComplete]);

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setMode("focus");
    setTimeLeft(preset.focus * 60);
  };

  const changePreset = (label: string) => {
    const newPreset = PRESETS.find((p) => p.label === label) || PRESETS[0];
    setPreset(newPreset);
    setIsRunning(false);
    setMode("focus");
    setTimeLeft(newPreset.focus * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = mode === "focus" 
    ? ((preset.focus * 60 - timeLeft) / (preset.focus * 60)) * 100
    : ((preset.break * 60 - timeLeft) / (preset.break * 60)) * 100;

  if (isMinimized) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsMinimized(false)}
        className="gap-2"
      >
        <Timer className="w-4 h-4" />
        {isRunning ? formatTime(timeLeft) : "Timer"}
      </Button>
    );
  }

  return (
    <Card className="p-4 w-64 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {mode === "focus" ? (
            <Timer className="w-4 h-4 text-primary" />
          ) : (
            <Coffee className="w-4 h-4 text-amber-500" />
          )}
          <span className="font-medium text-sm">
            {mode === "focus" ? "Focus Time" : "Break Time"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsMinimized(true)}
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Progress ring */}
      <div className="relative flex items-center justify-center mb-4">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-muted"
          />
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={351.86}
            strokeDashoffset={351.86 - (351.86 * progress) / 100}
            className={mode === "focus" ? "text-primary" : "text-amber-500"}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute text-2xl font-bold tabular-nums">
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Button
          variant="outline"
          size="icon"
          onClick={resetTimer}
          disabled={!isRunning && timeLeft === preset.focus * 60}
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button
          size="lg"
          onClick={toggleTimer}
          className={mode === "focus" ? "" : "bg-amber-500 hover:bg-amber-600"}
        >
          {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </Button>
      </div>

      {/* Preset selector */}
      <div className="flex items-center justify-between">
        <Select value={preset.label} onValueChange={changePreset}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.label} value={p.label}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs">
          {sessionsCompleted} sessions
        </Badge>
      </div>
    </Card>
  );
};
