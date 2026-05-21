
-- Harden handle_new_user: validate username, fallback to UUID-based, avoid duplicates
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_name text;
  candidate text;
  final_name text;
  suffix int := 0;
BEGIN
  raw_name := COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  -- strip to allowed charset, trim length
  candidate := regexp_replace(coalesce(raw_name, ''), '[^A-Za-z0-9_-]', '', 'g');
  candidate := substr(candidate, 1, 50);
  IF candidate IS NULL OR length(candidate) < 3 THEN
    candidate := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  END IF;

  final_name := candidate;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_name) LOOP
    suffix := suffix + 1;
    final_name := substr(candidate, 1, 50 - length(suffix::text) - 1) || '_' || suffix::text;
    IF suffix > 50 THEN
      final_name := 'user_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, username)
  VALUES (new.id, final_name);
  RETURN new;
END;
$$;

-- Drop the inefficient LIKE-based storage policy if present.
-- The folder-based policy ("Public book files are readable by anyone") remains and is sufficient.
DROP POLICY IF EXISTS "Anyone can view files from public books" ON storage.objects;
