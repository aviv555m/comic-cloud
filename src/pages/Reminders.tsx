import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type Weekday } from "@capacitor/local-notifications";
import { 
  ArrowLeft, 
  Bell,
  Clock,
  Calendar,
  Plus,
  Trash2,
  Loader2
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface ReadingReminder {
  id: string;
  reminder_type: string;
  time_of_day: string;
  days_of_week: number[] | null;
  is_enabled: boolean | null;
}

interface ScheduledReading {
  id: string;
  book_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  duration_minutes: number | null;
  is_completed: boolean | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Capacitor notification ids must be 32-bit ints, so derive a stable one per reminder+day.
// The band deliberately excludes 999999, which the download manager owns.
const REMINDER_ID_BASE = 1000;
const REMINDER_ID_RANGE = 900000;

const notificationId = (reminderId: string, day: number) => {
  const key = `${reminderId}:${day}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return REMINDER_ID_BASE + (Math.abs(hash) % REMINDER_ID_RANGE);
};

// Only the OS can fire a reminder once the app is closed, so web is intentionally not scheduled.
const syncSchedule = async (list: ReadingReminder[]) => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== "granted") return;
    }

    // Clear the whole reminder band rather than per-id: ids of just-deleted rows are no longer derivable.
    const pending = await LocalNotifications.getPending();
    const ours = pending.notifications.filter(
      (n) => n.id >= REMINDER_ID_BASE && n.id < REMINDER_ID_BASE + REMINDER_ID_RANGE
    );
    if (ours.length > 0) {
      await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
    }

    const notifications = list
      .filter((r) => r.is_enabled)
      .flatMap((r) => {
        const [hours, minutes] = r.time_of_day.split(":");
        return (r.days_of_week ?? [0, 1, 2, 3, 4, 5, 6]).map((day) => ({
          id: notificationId(r.id, day),
          title: "Time to read",
          body: "Your reading session is waiting",
          schedule: {
            on: {
              weekday: (day + 1) as Weekday,
              hour: parseInt(hours),
              minute: parseInt(minutes),
            },
            repeats: true,
          },
        }));
      });

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch (e) {
    console.warn("Failed to schedule reading reminders:", e);
  }
};

const Reminders = () => {
  const [user, setUser] = useState<User | null>(null);
  const [reminders, setReminders] = useState<ReadingReminder[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [newReminderTime, setNewReminderTime] = useState("20:00");
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchData(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchData = async (userId: string) => {
    setLoading(true);

    const [remindersRes, scheduledRes] = await Promise.all([
      supabase.from("reading_reminders").select("*").eq("user_id", userId),
      supabase
        .from("scheduled_reading")
        .select("*")
        .eq("user_id", userId)
        .gte("scheduled_date", new Date().toISOString().split("T")[0])
        .order("scheduled_date"),
    ]);

    if (remindersRes.data) {
      setReminders(remindersRes.data);
      syncSchedule(remindersRes.data);
    }
    if (scheduledRes.data) setScheduled(scheduledRes.data);

    setLoading(false);
  };

  const addReminder = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("reading_reminders")
      .insert({
        user_id: user.id,
        reminder_type: "daily",
        time_of_day: newReminderTime,
        days_of_week: selectedDays,
        is_enabled: true,
      })
      .select()
      .single();

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add reminder" });
    } else if (data) {
      const next = [...reminders, data];
      setReminders(next);
      syncSchedule(next);
      toast({ title: "Reminder added" });
    }
  };

  const toggleReminder = async (id: string, enabled: boolean) => {
    await supabase
      .from("reading_reminders")
      .update({ is_enabled: enabled })
      .eq("id", id);

    const next = reminders.map((r) => (r.id === id ? { ...r, is_enabled: enabled } : r));
    setReminders(next);
    syncSchedule(next);
  };

  const deleteReminder = async (id: string) => {
    await supabase.from("reading_reminders").delete().eq("id", id);
    const next = reminders.filter((r) => r.id !== id);
    setReminders(next);
    syncSchedule(next);
    toast({ title: "Reminder deleted" });
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort());
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Reading Reminders</h1>
            <p className="text-muted-foreground">Never miss a reading session</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Create reminder */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Add Reminder</CardTitle>
                <CardDescription>
                  Set up daily reminders to build a reading habit
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={newReminderTime}
                    onChange={(e) => setNewReminderTime(e.target.value)}
                    className="w-32"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Days</Label>
                  <div className="flex gap-2">
                    {DAYS.map((day, index) => (
                      <Button
                        key={day}
                        variant={selectedDays.includes(index) ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleDay(index)}
                        className="w-10 h-10 p-0"
                      >
                        {day.charAt(0)}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button onClick={addReminder} disabled={selectedDays.length === 0}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Reminder
                </Button>
              </CardContent>
            </Card>

            {/* Existing reminders */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your Reminders</CardTitle>
              </CardHeader>
              <CardContent>
                {reminders.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No reminders set. Add one above!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-full ${
                            reminder.is_enabled ? "bg-primary/10" : "bg-muted"
                          }`}>
                            <Bell className={`w-5 h-5 ${
                              reminder.is_enabled ? "text-primary" : "text-muted-foreground"
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium">
                              {formatTime(reminder.time_of_day)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {reminder.days_of_week
                                ?.map((d) => DAYS[d])
                                .join(", ") || "Every day"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={reminder.is_enabled || false}
                            onCheckedChange={(checked) => toggleReminder(reminder.id, checked)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteReminder(reminder.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scheduled reading sessions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upcoming Sessions</CardTitle>
                <CardDescription>
                  Scheduled reading time for the week ahead
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scheduled.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Scheduled reading sessions aren't available yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scheduled.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">
                              {new Date(session.scheduled_date).toLocaleDateString()}
                            </p>
                            {session.scheduled_time && (
                              <p className="text-sm text-muted-foreground">
                                {formatTime(session.scheduled_time)} •{" "}
                                {session.duration_minutes || 30} min
                              </p>
                            )}
                          </div>
                        </div>
                        {session.is_completed && (
                          <span className="text-xs text-green-600 font-medium">
                            Completed
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info about notifications */}
            <Card className="border-dashed">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground text-center">
                  {Capacitor.isNativePlatform()
                    ? "💡 Reminders are scheduled as device notifications — keep notifications enabled for ComicCloud."
                    : "💡 Reminders are saved here, but only the ComicCloud mobile app can deliver them as notifications."}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default Reminders;
