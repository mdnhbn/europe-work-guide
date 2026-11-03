-- Persist the contact details users enter in their private profile and CV.
-- Existing RLS policies restrict these columns to the profile owner.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;
