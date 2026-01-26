import { cn } from "@/lib/utils";
import { 
  Trophy, 
  Flame, 
  Book, 
  Star, 
  Target, 
  Moon, 
  Sun,
  Zap,
  Heart,
  Award,
  Crown,
  Sparkles
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Achievement {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string;
  points: number | null;
  is_secret?: boolean | null;
}

interface AchievementBadgeProps {
  achievement: Achievement;
  earned?: boolean;
  earnedAt?: string;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  trophy: Trophy,
  flame: Flame,
  book: Book,
  star: Star,
  target: Target,
  moon: Moon,
  sun: Sun,
  zap: Zap,
  heart: Heart,
  award: Award,
  crown: Crown,
  sparkles: Sparkles,
};

const categoryColors: Record<string, string> = {
  reading: "from-blue-500 to-indigo-600",
  streak: "from-orange-500 to-red-600",
  social: "from-pink-500 to-rose-600",
  milestone: "from-amber-500 to-yellow-600",
  special: "from-purple-500 to-violet-600",
};

export const AchievementBadge = ({
  achievement,
  earned = false,
  earnedAt,
  size = "md",
  showTooltip = true,
}: AchievementBadgeProps) => {
  const Icon = iconMap[achievement.icon] || Trophy;
  
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
  };

  const iconSizeClasses = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-10 h-10",
  };

  const gradientClass = categoryColors[achievement.category] || categoryColors.milestone;

  const badge = (
    <div
      className={cn(
        "relative rounded-full flex items-center justify-center transition-all",
        sizeClasses[size],
        earned
          ? `bg-gradient-to-br ${gradientClass} shadow-lg`
          : "bg-muted border-2 border-dashed border-muted-foreground/30"
      )}
    >
      <Icon
        className={cn(
          iconSizeClasses[size],
          earned ? "text-white" : "text-muted-foreground/50"
        )}
      />
      {earned && (
        <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 shadow">
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <svg
              className="w-2.5 h-2.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
      )}
      {achievement.is_secret && !earned && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl">?</span>
        </div>
      )}
    </div>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px]">
        <div className="text-center">
          <p className="font-semibold">
            {achievement.is_secret && !earned ? "Secret Achievement" : achievement.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {achievement.is_secret && !earned
              ? "Keep reading to discover this achievement!"
              : achievement.description}
          </p>
          {earned && earnedAt && (
            <p className="text-xs text-primary mt-1">
              Earned {new Date(earnedAt).toLocaleDateString()}
            </p>
          )}
          {achievement.points && (
            <p className="text-xs font-medium mt-1">+{achievement.points} points</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
