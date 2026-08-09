-- Phase F: Drop legacy auth columns from customers table
-- These columns are no longer used after migration to Supabase Auth.

-- 1. Drop index on session_token first
DROP INDEX IF EXISTS public.idx_customers_session_token;

-- 2. Drop legacy columns
ALTER TABLE public.customers DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.customers DROP COLUMN IF EXISTS session_token;
ALTER TABLE public.customers DROP COLUMN IF EXISTS remember_me;
ALTER TABLE public.customers DROP COLUMN IF EXISTS last_seen;
