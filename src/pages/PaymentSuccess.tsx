import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Navigation } from '@/components/Navigation';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const { checkSubscription } = useSubscription();

  useEffect(() => {
    // Refresh subscription status after successful payment
    checkSubscription();
  }, [checkSubscription]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 py-12 flex items-center justify-center">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Premium!</CardTitle>
            <CardDescription>
              Your subscription is now active
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center gap-2 text-amber-500">
              <Crown className="h-5 w-5" />
              <span className="font-medium">Premium Member</span>
            </div>
            
            <p className="text-muted-foreground">
              You now have access to AI Chat, Text-to-Speech, AI Cover Generation, and unlimited book storage.
            </p>
            
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate('/library')}>
                Go to Library
              </Button>
              <Button variant="outline" onClick={() => navigate('/settings')}>
                Manage Subscription
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
