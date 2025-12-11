import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Target, BookOpen, Clock, Flame, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface ReadingChallenge {
  id: string;
  name: string;
  goal_type: string;
  goal_value: number;
  current_value: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_completed: boolean;
}

interface ReadingChallengeCardProps {
  challenge: ReadingChallenge;
  onDelete: (id: string) => void;
}

const GOAL_ICONS: Record<string, any> = {
  books: BookOpen,
  pages: Target,
  minutes: Clock,
  streak: Flame,
};

const GOAL_LABELS: Record<string, string> = {
  books: "books",
  pages: "pages",
  minutes: "minutes",
  streak: "day streak",
};

export const ReadingChallengeCard = ({ 
  challenge, 
  onDelete 
}: ReadingChallengeCardProps) => {
  const Icon = GOAL_ICONS[challenge.goal_type] || Target;
  const progress = Math.min(
    100,
    Math.round((challenge.current_value / challenge.goal_value) * 100)
  );
  const isCompleted = challenge.is_completed || progress >= 100;
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(challenge.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  );

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isCompleted
          ? "bg-primary/5 border-primary/20"
          : "bg-card hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isCompleted ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {isCompleted ? (
              <Trophy className="w-5 h-5" />
            ) : (
              <Icon className="w-5 h-5" />
            )}
          </div>
          <div>
            <h4 className="font-semibold">{challenge.name}</h4>
            <p className="text-xs text-muted-foreground">
              {format(new Date(challenge.start_date), "MMM d")} -{" "}
              {format(new Date(challenge.end_date), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCompleted && (
            <Badge variant="default" className="bg-primary">
              Completed!
            </Badge>
          )}
          {!isCompleted && daysLeft <= 7 && daysLeft > 0 && (
            <Badge variant="secondary">{daysLeft} days left</Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(challenge.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Progress</span>
          <span className="font-medium">
            {challenge.current_value} / {challenge.goal_value}{" "}
            {GOAL_LABELS[challenge.goal_type]}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-right">
          {progress}% complete
        </p>
      </div>
    </div>
  );
};
