import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Loader2, Database, ShieldAlert } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Tables included in a full backup. Order matters for restore (parents first).
const BACKUP_TABLES = [
  "profiles",
  "books",
  "tags",
  "book_tags",
  "annotations",
  "book_reviews",
  "reading_sessions",
  "reading_lists",
  "reading_list_books",
  "reading_challenges",
  "reading_reminders",
  "scheduled_reading",
  "journal_entries",
  "vocabulary",
  "user_reading_preferences",
] as const;

export const BackupRestoreDialog = ({ open, onOpenChange }: Props) => {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const exportBackup = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload: Record<string, unknown> = {
        version: 1,
        exportedAt: new Date().toISOString(),
        userId: user.id,
        tables: {} as Record<string, unknown[]>,
      };

      for (const table of BACKUP_TABLES) {
        const query = supabase.from(table as any).select("*");
        // profiles uses id = user.id; everything else uses user_id
        const { data, error } =
          table === "profiles"
            ? await query.eq("id", user.id)
            : await query.eq("user_id", user.id);
        if (error) {
          console.warn(`Skipping ${table}:`, error.message);
          (payload.tables as Record<string, unknown[]>)[table] = [];
        } else {
          (payload.tables as Record<string, unknown[]>)[table] = data ?? [];
        }
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookshelf-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Backup downloaded",
        description: "Keep this file safe — you can restore it on any device.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Backup failed",
        description: e.message ?? "Unknown error",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.tables) throw new Error("Invalid backup file");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (
        !confirm(
          "Restore will merge this backup into your account. Existing rows with the same ID will be overwritten. Continue?",
        )
      ) {
        setImporting(false);
        return;
      }

      let total = 0;
      for (const table of BACKUP_TABLES) {
        const rows: any[] = parsed.tables[table] ?? [];
        if (rows.length === 0) continue;
        // Re-assign ownership to current user
        const remapped = rows.map((r) => ({
          ...r,
          ...(table === "profiles" ? { id: user.id } : { user_id: user.id }),
        }));

        const { error } = await supabase
          .from(table as any)
          .upsert(remapped, { onConflict: "id" });
        if (error) {
          console.warn(`Skipping ${table}:`, error.message);
          continue;
        }
        total += remapped.length;
      }

      toast({
        title: "Restore complete",
        description: `Imported ${total} rows across ${BACKUP_TABLES.length} tables.`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Restore failed",
        description: e.message ?? "Invalid file",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" /> Backup & Restore
          </DialogTitle>
          <DialogDescription>
            Save everything (library, progress, annotations, lists, journal, vocab…)
            to a single JSON file. Restore it later or on another device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Button
            onClick={exportBackup}
            disabled={exporting || importing}
            className="w-full"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Download full backup
          </Button>

          <Separator />

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button
            variant="outline"
            disabled={exporting || importing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Restore from backup file
          </Button>

          <div className="flex gap-2 text-xs text-muted-foreground rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p>
              Backups do <strong>not</strong> include book files themselves — those
              stay in your cloud storage. Use the offline-download button on each
              book if you also want the file locally.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
