import { cn } from "@/lib/utils";

interface ReaderPagePillProps {
  /** Current position, already 1-based for display. */
  current: number;
  /** Total pages/locations. When unknown, only the current value is shown. */
  total?: number | null;
  /** Optional label shown before the numbers, e.g. a chapter title. */
  label?: string;
  visible?: boolean;
  /** "float" hovers over the content, "sticky" rides the top of a scroll container. */
  variant?: "float" | "sticky";
  className?: string;
}

/**
 * The single "Page X of Y" indicator shared by every reader. Each reader used to
 * hand-roll its own, which is why they drifted apart visually.
 */
export const ReaderPagePill = ({
  current,
  total,
  label,
  visible = true,
  variant = "float",
  className,
}: ReaderPagePillProps) => {
  return (
    <div
      className={cn(
        "pointer-events-none z-40 flex justify-center transition-all duration-300",
        variant === "float"
          ? "fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
          : "sticky top-2",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className
      )}
    >
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3.5 py-1.5 shadow-lg backdrop-blur-md">
        {label && (
          <span className="max-w-[10rem] truncate text-xs font-medium text-muted-foreground">
            {label}
          </span>
        )}
        <span className="text-xs font-semibold tabular-nums">
          {current}
          {total ? <span className="text-muted-foreground"> / {total}</span> : null}
        </span>
      </div>
    </div>
  );
};
