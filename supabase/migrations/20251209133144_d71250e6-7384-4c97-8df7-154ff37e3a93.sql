-- Add is_premium_override column to profiles for manual premium grants
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_premium_override boolean DEFAULT false;

-- Add RLS policy for reading the override
CREATE POLICY "Users can view their own premium override" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);