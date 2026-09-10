import { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface NumericSetting {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** How the current value is rendered, e.g. (v) => `${v}px`. */
  format?: (value: number) => string;
}

interface ChoiceSetting<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ id: T; label: string; swatchClass?: string }>;
}

interface ReaderSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  fontSize?: NumericSetting;
  lineHeight?: NumericSetting;
  margin?: NumericSetting;
  zoom?: NumericSetting;
  theme?: ChoiceSetting;
  fontFamily?: ChoiceSetting;
  fitMode?: ChoiceSetting;
  /** Anything a specific reader needs that the shared sections do not cover. */
  children?: ReactNode;
}

const NumericRow = ({ label, setting }: { label: string; setting: NumericSetting }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label className="text-sm">{label}</Label>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {setting.format ? setting.format(setting.value) : setting.value}
      </span>
    </div>
    <Slider
      value={[setting.value]}
      min={setting.min}
      max={setting.max}
      step={setting.step ?? 1}
      onValueChange={([v]) => setting.onChange(v)}
    />
  </div>
);

const ChoiceRow = ({ label, setting }: { label: string; setting: ChoiceSetting }) => (
  <div className="space-y-2">
    <Label className="text-sm">{label}</Label>
    <div className="flex flex-wrap gap-2">
      {setting.options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setting.onChange(option.id)}
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            setting.value === option.id
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-muted"
          )}
        >
          {option.swatchClass && (
            <span className={cn("h-3.5 w-3.5 rounded-full border border-border/60", option.swatchClass)} />
          )}
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

/**
 * One settings surface for every reader. Each reader passes only the sections it
 * supports, so EPUB gets typography while PDF and comics get zoom/fit — but the
 * layout, spacing and controls stay identical between them.
 */
export const ReaderSettingsSheet = ({
  open,
  onOpenChange,
  title = "Reading settings",
  fontSize,
  lineHeight,
  margin,
  zoom,
  theme,
  fontFamily,
  fitMode,
  children,
}: ReaderSettingsSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-6">
          {theme && <ChoiceRow label="Theme" setting={theme} />}
          {fontFamily && <ChoiceRow label="Typeface" setting={fontFamily} />}
          {fitMode && <ChoiceRow label="Fit" setting={fitMode} />}
          {fontSize && <NumericRow label="Font size" setting={fontSize} />}
          {lineHeight && <NumericRow label="Line height" setting={lineHeight} />}
          {margin && <NumericRow label="Margins" setting={margin} />}
          {zoom && <NumericRow label="Zoom" setting={zoom} />}
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
};
