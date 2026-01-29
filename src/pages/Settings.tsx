import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { ArrowLeft, User, Lock, Palette, Loader2, Moon, Sun, Monitor, Crown, CreditCard, Download } from "lucide-react";
import { ExportDialog } from "@/components/ExportDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Badge } from "@/components/ui/badge";
// AdminPremiumToggle removed for security - premium status managed via secure user_subscriptions table

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSubscribed, subscriptionEnd, isLoading: subLoading, checkSubscription } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{
    username: string;
    avatar_url: string | null;
  }>({
    username: "",
    avatar_url: null,
  });
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [fontSize, setFontSize] = useState(16);
  const [readingGoal, setReadingGoal] = useState(30);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to open subscription management",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUser(user);
      
      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (profileData) {
        setProfile({
          username: profileData.username || "",
          avatar_url: profileData.avatar_url,
        });
      }

      // Load preferences from localStorage
      const savedTheme = localStorage.getItem("theme") as "light" | "dark" | "system" || "system";
      const savedFontSize = parseInt(localStorage.getItem("fontSize") || "16");
      const savedGoal = parseInt(localStorage.getItem("readingGoal") || "30");
      
      setTheme(savedTheme);
      setFontSize(savedFontSize);
      setReadingGoal(savedGoal);
    };
    
    getUser();
  }, [navigate]);

  const updateProfile = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: profile.username,
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async () => {
    if (passwords.new !== passwords.confirm) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "New passwords don't match",
      });
      return;
    }

    if (passwords.new.length < 6) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Password must be at least 6 characters",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.new,
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (newTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      // System preference
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  };

  const applyFontSize = (size: number) => {
    setFontSize(size);
    localStorage.setItem("fontSize", size.toString());
    document.documentElement.style.setProperty("--font-size-root", `${size}px`);
  };

  const saveReadingGoal = (goal: number) => {
    setReadingGoal(goal);
    localStorage.setItem("readingGoal", goal.toString());
    toast({
      title: "Reading goal updated",
      description: `Your daily reading goal is now ${goal} minutes.`,
    });
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setLoading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("book-covers")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("book-covers")
        .getPublicUrl(filePath);

      setProfile({ ...profile, avatar_url: publicUrl });
      
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      toast({
        title: "Avatar uploaded",
        description: "Your profile picture has been updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const userInitial = profile.username?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user?.email} />
      
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="gap-2">
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Plan</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">Theme</span>
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-2">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Data</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="gradient-warm text-white text-2xl">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Label htmlFor="avatar" className="cursor-pointer">
                      <span className="text-primary hover:underline">Change avatar</span>
                    </Label>
                    <Input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={uploadAvatar}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Display Name</Label>
                  <Input
                    id="username"
                    placeholder="Enter your name"
                    value={profile.username}
                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                  />
                </div>

                <Button onClick={updateProfile} disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscription">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isSubscribed ? (
                    <>
                      <Crown className="h-5 w-5 text-amber-500" />
                      Premium Plan
                    </>
                  ) : (
                    "Free Plan"
                  )}
                </CardTitle>
                <CardDescription>
                  {isSubscribed 
                    ? "You have access to all premium features"
                    : "Upgrade to unlock AI features and unlimited storage"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isSubscribed ? (
                  <>
                    <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <Crown className="h-4 w-4 text-amber-500" />
                          Premium Member
                        </p>
                        {subscriptionEnd && (
                          <p className="text-sm text-muted-foreground">
                            Renews on {new Date(subscriptionEnd).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Badge className="bg-primary text-primary-foreground">Active</Badge>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className="w-full"
                    >
                      {portalLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        "Manage Subscription"
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="font-medium mb-2">Premium includes:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• AI Book Chat Assistant</li>
                        <li>• Text-to-Speech narration</li>
                        <li>• AI Cover Generation</li>
                        <li>• Unlimited book storage</li>
                      </ul>
                    </div>
                    <Button onClick={() => navigate("/pricing")} className="w-full">
                      <Crown className="mr-2 h-4 w-4" />
                      Upgrade to Premium - $1/month
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your password to keep your account secure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    minLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    minLength={6}
                  />
                </div>

                <Button onClick={updatePassword} disabled={loading} className="w-full">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Theme</CardTitle>
                  <CardDescription>Choose your preferred color scheme</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      onClick={() => applyTheme("light")}
                      className="flex flex-col gap-2 h-auto py-4"
                    >
                      <Sun className="w-5 h-5" />
                      <span>Light</span>
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      onClick={() => applyTheme("dark")}
                      className="flex flex-col gap-2 h-auto py-4"
                    >
                      <Moon className="w-5 h-5" />
                      <span>Dark</span>
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      onClick={() => applyTheme("system")}
                      className="flex flex-col gap-2 h-auto py-4"
                    >
                      <Monitor className="w-5 h-5" />
                      <span>System</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Font Size</CardTitle>
                  <CardDescription>Adjust the base font size</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">A</span>
                    <Slider
                      value={[fontSize]}
                      onValueChange={([value]) => applyFontSize(value)}
                      min={14}
                      max={20}
                      step={1}
                      className="flex-1 mx-4"
                    />
                    <span className="text-lg font-medium">A</span>
                  </div>
                  <p className="text-center text-muted-foreground">{fontSize}px</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Daily Reading Goal</CardTitle>
                  <CardDescription>Set your daily reading target in minutes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      value={readingGoal}
                      onChange={(e) => setReadingGoal(parseInt(e.target.value) || 0)}
                      min={5}
                      max={480}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">minutes per day</span>
                  </div>
                  <Button onClick={() => saveReadingGoal(readingGoal)} variant="outline">
                    Save Goal
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle>Export & Backup</CardTitle>
                <CardDescription>Download your library data and reading history</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Export your books, annotations, reading progress, and more in various formats.
                </p>
                <Button onClick={() => setShowExportDialog(true)} className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Export Library
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} />
      </div>
    </div>
  );
};

export default Settings;
