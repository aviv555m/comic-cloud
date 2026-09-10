import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ReaderProgressBarProps {
  /** 0-100. Values outside the range are clamped. */
  percent: number;
  /** Right-hand caption, e.g. "12 / 340" or "48%". */
  caption?: string;
  /** Optional controls rendered to the left of the bar (chapter nav, etc.). */
  leading?: ReactNode;
  /** Optional controls rendered to the right of the caption. */
  trailing?: ReactNode;
  visible?: boolean;
  /** Called with a 0-100 value when the user scrubs the bar. */
  onSeek?: (percent: number) => void;
  className?: string;
}

/**
 * Fixed bottom progress bar shared by the readers. Respects the Android
 * safe-area inset so it clears gesture navigation bars.
 */
export const ReaderProgressBar = ({
  percent,
  caption,
  leading,
  trailing,
  visible = true,
  onSeek,
  className,
}: ReaderProgressBarProps) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(100, ratio * 100)));
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-md transition-transform duration-300",
        "pb-[env(safe-area-inset-bottom)]",
        visible ? "translate-y-0" : "translate-y-full",
        className
      )}
    >
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
        {leading}
        <div
          className={cn("group relative flex-1 py-2", onSeek && "cursor-pointer")}
          onClick={handleSeek}
          role={onSeek ? "slider" : undefined}
          aria-valuenow={onSeek ? Math.round(clamped) : undefined}
          aria-valuemin={onSeek ? 0 : undefined}
          aria-valuemax={onSeek ? 100 : undefined}
          aria-label={onSeek ? "Reading progress" : undefined}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${clamped}%` }}
            />
          </div>
        </div>
        {caption && (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {caption}
          </span>
        )}
        {trailing}
      </div>
    </div>
  );
};
