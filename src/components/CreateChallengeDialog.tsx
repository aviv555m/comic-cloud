import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format, addMonths, addDays, startOfMonth, endOfMonth, endOfYear } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CreateChallengeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: () => void;
}

const PRESETS = [
  { name: "52 Books in a Year", type: "books", value: 52, duration: "year" },
  { name: "Read Every Day for 30 Days", type: "streak", value: 30, duration: "month" },
  { name: "1000 Pages This Month", type: "pages", value: 1000, duration: "month" },
  { name: "Read 2 Hours Daily for a Week", type: "minutes", value: 840, duration: "week" },
];

export const CreateChallengeDialog = ({
  open,
  onOpenChange,
  userId,
  onCreated,
}: CreateChallengeDialogProps) => {
  const [name, setName] = useState("");
  const [goalType, setGoalType] = useState("books");
  const [goalValue, setGoalValue] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(addMonths(new Date(), 1));
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    setGoalType(preset.type);
    setGoalValue(preset.value.toString());
    setStartDate(new Date());
    
    switch (preset.duration) {
      case "year":
        setEndDate(endOfYear(new Date()));
        break;
      case "month":
        setEndDate(endOfMonth(new Date()));
        break;
      case "week":
        setEndDate(addDays(new Date(), 7));
        break;
    }
  };

  const createChallenge = async () => {
    if (!name.trim() || !goalValue) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    setCreating(true);

    const { error } = await supabase.from("reading_challenges").insert({
      user_id: userId,
      name: name.trim(),
      goal_type: goalType,
      goal_value: parseInt(goalValue),
      start_date: format(startDate, "yyyy-MM-dd"),
      end_date: format(endDate, "yyyy-MM-dd"),
    });

    setCreating(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create challenge",
      });
      return;
    }

    toast({ title: "Challenge created!" });
    onCreated();
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setName("");
    setGoalType("books");
    setGoalValue("");
    setStartDate(new Date());
    setEndDate(addMonths(new Date(), 1));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Reading Challenge</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Quick Presets</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-2 justify-start"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Challenge Name</Label>
            <Input
              id="name"
              placeholder="e.g., Summer Reading Challenge"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Goal Type</Label>
              <Select value={goalType} onValueChange={setGoalType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="books">Books</SelectItem>
                  <SelectItem value="pages">Pages</SelectItem>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="streak">Day Streak</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal">Target</Label>
              <Input
                id="goal"
                type="number"
                min="1"
                placeholder="e.g., 12"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                    disabled={(date) => date < startDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Button onClick={createChallenge} disabled={creating} className="w-full">
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Challenge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
