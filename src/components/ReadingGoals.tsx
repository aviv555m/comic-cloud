import { useState, useEffect } from "react";
import { Target, Flame, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ReadingGoalsProps {
  currentStreak: number;
  todayMinutes: number;
  weeklyMinutes: number;
}

export const ReadingGoals = ({ currentStreak, todayMinutes, weeklyMinutes }: ReadingGoalsProps) => {
  const [dailyGoal, setDailyGoal] = useState(() => {
    return parseInt(localStorage.getItem("dailyReadingGoal") || "30");
  });
  const [weeklyDaysGoal, setWeeklyDaysGoal] = useState(() => {
    return parseInt(localStorage.getItem("weeklyDaysGoal") || "5");
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tempDaily, setTempDaily] = useState(dailyGoal);
  const [tempWeekly, setTempWeekly] = useState(weeklyDaysGoal);

  const dailyProgress = Math.min(100, (todayMinutes / dailyGoal) * 100);
  const weeklyProgress = Math.min(100, (weeklyMinutes / (dailyGoal * weeklyDaysGoal)) * 100);
  
  const saveGoals = () => {
    setDailyGoal(tempDaily);
    setWeeklyDaysGoal(tempWeekly);
    localStorage.setItem("dailyReadingGoal", tempDaily.toString());
    localStorage.setItem("weeklyDaysGoal", tempWeekly.toString());
    setDialogOpen(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="w-4 h-4" />
            Reading Goals
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Set Reading Goals</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="daily">Daily reading goal (minutes)</Label>
                  <Input
                    id="daily"
                    type="number"
                    value={tempDaily}
                    onChange={(e) => setTempDaily(parseInt(e.target.value) || 15)}
                    min={5}
                    max={240}
                    className="h-11 sm:h-10 text-base sm:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weekly">Weekly days goal</Label>
                  <Input
                    id="weekly"
                    type="number"
                    value={tempWeekly}
                    onChange={(e) => setTempWeekly(parseInt(e.target.value) || 3)}
                    min={1}
                    max={7}
                    className="h-11 sm:h-10 text-base sm:text-sm"
                  />
                </div>
                <Button onClick={saveGoals} className="w-full h-11 sm:h-10">
                  Save Goals
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground">Today</span>
            <span className="text-xs font-medium">
              {todayMinutes} / {dailyGoal} min
              {dailyProgress >= 100 && <Check className="inline w-3 h-3 ml-1 text-green-500" />}
            </span>
          </div>
          <Progress value={dailyProgress} className="h-2" />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-muted-foreground">This Week</span>
            <span className="text-xs font-medium">
              {weeklyMinutes} / {dailyGoal * weeklyDaysGoal} min
              {weeklyProgress >= 100 && <Check className="inline w-3 h-3 ml-1 text-green-500" />}
            </span>
          </div>
          <Progress value={weeklyProgress} className="h-2" />
        </div>

        <div className="flex items-center justify-center gap-2 pt-2 border-t">
          <Flame className={`w-5 h-5 ${currentStreak > 0 ? "text-orange-500" : "text-muted-foreground"}`} />
          <span className="font-bold text-lg">{currentStreak}</span>
          <span className="text-sm text-muted-foreground">day streak</span>
        </div>
      </CardContent>
    </Card>
  );
};
