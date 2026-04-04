-- Remove the old individual SELECT policies since the new one covers both cases
DROP POLICY IF EXISTS "Users can view their own premium override" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;