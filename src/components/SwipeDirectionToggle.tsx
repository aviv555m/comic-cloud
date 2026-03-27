import { MoveHorizontal, MoveVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SwipeDirectionToggleProps {
  direction: "horizontal" | "vertical";
  onChange: (direction: "horizontal" | "vertical") => void;
}

export const SwipeDirectionToggle = ({ direction, onChange }: SwipeDirectionToggleProps) => {
  const toggle = () => {
    const newDir = direction === "horizontal" ? "vertical" : "horizontal";
    onChange(newDir);
    localStorage.setItem("swipeDirection", newDir);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          className="h-8 px-2"
        >
          {direction === "horizontal" ? (
            <MoveHorizontal className="w-4 h-4" />
          ) : (
            <MoveVertical className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Swipe: {direction === "horizontal" ? "Left/Right" : "Up/Down"}</p>
      </TooltipContent>
    </Tooltip>
  );
};
