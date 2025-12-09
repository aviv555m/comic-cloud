import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';
import { Crown } from 'lucide-react';

export function AdminPremiumToggle() {
  const [isPremiumOverride, setIsPremiumOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const { checkSubscription } = useSubscription();

  useEffect(() => {
    loadPremiumStatus();
  }, []);

  const loadPremiumStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('is_premium_override')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      setIsPremiumOverride(data?.is_premium_override || false);
    } catch (error) {
      console.error('Error loading premium status:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePremium = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const newValue = !isPremiumOverride;
      
      const { error } = await supabase
        .from('profiles')
        .update({ is_premium_override: newValue })
        .eq('id', user.id);

      if (error) throw error;
      
      setIsPremiumOverride(newValue);
      await checkSubscription();
      
      toast.success(newValue ? 'Premium enabled!' : 'Premium disabled');
    } catch (error) {
      console.error('Error toggling premium:', error);
      toast.error('Failed to update premium status');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        <Crown className="h-5 w-5 text-amber-500" />
        <div>
          <Label htmlFor="premium-toggle" className="font-medium">Manual Premium Override</Label>
          <p className="text-sm text-muted-foreground">Enable premium features without Stripe subscription</p>
        </div>
      </div>
      <Switch
        id="premium-toggle"
        checked={isPremiumOverride}
        onCheckedChange={togglePremium}
        disabled={loading}
      />
    </div>
  );
}
