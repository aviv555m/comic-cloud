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
  const { toast } = useToast();

  const saveAnnotation = async () => {
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
  };

  return (
    <div
      className="fixed z-50 bg-card border rounded-lg shadow-lg p-4 w-80"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium mb-2">Highlight Color</p>
          <div className="flex gap-2">
            {COLORS.map((color) => (
              <button
                key={color.value}
                className={`w-8 h-8 rounded-full border-2 ${
                  selectedColor === color.value ? "border-primary" : "border-transparent"
                }`}
                style={{ backgroundColor: color.value }}
                onClick={() => setSelectedColor(color.value)}
                title={color.name}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-2">Add Note (Optional)</p>
          <Textarea
            placeholder="Add your thoughts..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={saveAnnotation} className="flex-1">
            Save
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
