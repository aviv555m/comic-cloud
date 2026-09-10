import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface HighlightMenuProps {
  selectedText: string;
  bookId: string;
  pageNumber: number;
  position: { x: number; y: number };
  onClose: () => void;
  onSaved: () => void;
}

const MENU_WIDTH = 320; // matches w-80

const COLORS = [
  { name: "Yellow", value: "#FFFF00" },
  { name: "Green", value: "#00FF00" },
  { name: "Blue", value: "#00BFFF" },
  { name: "Pink", value: "#FF69B4" },
  { name: "Orange", value: "#FFA500" },
];

export const HighlightMenu = ({ 
  selectedText, 
  bookId, 
  pageNumber, 
  position,
  onClose,
  onSaved 
}: HighlightMenuProps) => {
  const [note, setNote] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const saveAnnotation = async () => {
    if (saving) return; // a double-tap would otherwise insert the annotation twice
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("annotations")
        .insert({
          book_id: bookId,
          user_id: user.id,
          page_number: pageNumber,
          selected_text: selectedText,
          note: note || null,
          highlight_color: selectedColor,
        });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to save annotation",
        });
      } else {
        toast({
          title: "Success",
          description: "Annotation saved",
        });
        onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  // Keep the menu inside narrow (phone) viewports instead of running off the edge
  const left = Math.min(
    Math.max(position.x, 12),
    Math.max(12, window.innerWidth - MENU_WIDTH - 12)
  );

  return (
    <div
      className="fixed z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border/60 bg-background/90 p-4 shadow-xl backdrop-blur-md"
      style={{
        left: `${left}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">Highlight Color</p>
          <div className="flex gap-2">
            {COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`w-10 h-10 rounded-full border-2 transition-transform ${
                  selectedColor === color.value
                    ? "border-primary ring-2 ring-primary/30 scale-110"
                    : "border-border/60"
                }`}
                style={{ backgroundColor: color.value }}
                onClick={() => setSelectedColor(color.value)}
                title={color.name}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-2 text-muted-foreground">Add Note (Optional)</p>
          <Textarea
            placeholder="Add your thoughts..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="text-sm rounded-xl border-border/60 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={saveAnnotation} disabled={saving} className="flex-1 h-11 rounded-full">
            Save
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="h-11 px-5 rounded-full border-border/60"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
