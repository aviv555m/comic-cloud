import { BookOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PageAnimationToggleProps {
  mode: "slide" | "curl";
  onChange: (mode: "slide" | "curl") => void;
}

export const PageAnimationToggle = ({ mode, onChange }: PageAnimationToggleProps) => {
  const toggle = () => {
    const newMode = mode === "slide" ? "curl" : "slide";
    onChange(newMode);
    localStorage.setItem("pageAnimation", newMode);
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
          {mode === "slide" ? (
            <Layers className="w-4 h-4" />
          ) : (
            <BookOpen className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Animation: {mode === "slide" ? "Slide" : "Page Curl"}</p>
      </TooltipContent>
    </Tooltip>
  );
};
