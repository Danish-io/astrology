-- ============================================================
-- MIGRATION 002: handle_new_user also reads phone from metadata
-- WHY: Supabase signup accepts EITHER email or phone on the auth
--      record — when signing up with email, a phone number can only
--      ride in user_metadata. This trigger update copies it to
--      profiles.phone automatically.
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → RUN
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone', ''), NEW.phone)
  );
  RETURN NEW;
END;
$$;

-- The trigger itself (on_auth_user_created) stays as created in 001.
